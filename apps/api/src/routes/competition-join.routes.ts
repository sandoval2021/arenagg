import { Hono } from 'hono';
import { Prisma } from '@prisma/client';
import type { Env } from '../types/env';

export const competitionJoin = new Hono<Env>();

const MAX_JOIN_ATTEMPTS = 3;

type JoinBusinessError =
  | 'COMPETITION_NOT_FOUND'
  | 'COMPETITION_FULL'
  | 'COMPETITION_ALREADY_STARTED'
  | 'REGISTRATION_CLOSED';

function safePrismaMeta(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return undefined;
  return {
    code: error.code,
    target:
      typeof error.meta?.target === 'string' || Array.isArray(error.meta?.target)
        ? error.meta.target
        : undefined,
    constraint: typeof error.meta?.constraint === 'string' ? error.meta.constraint : undefined,
    modelName: typeof error.meta?.modelName === 'string' ? error.meta.modelName : undefined,
  };
}

function businessResponse(error: JoinBusinessError, requestId: string) {
  switch (error) {
    case 'COMPETITION_NOT_FOUND':
      return {
        status: 404 as const,
        body: { error, message: 'Este campeonato não existe ou foi removido.', requestId },
      };
    case 'COMPETITION_FULL':
      return {
        status: 409 as const,
        body: { error, message: 'A copa já está lotada.', requestId },
      };
    case 'COMPETITION_ALREADY_STARTED':
      return {
        status: 409 as const,
        body: { error, message: 'O campeonato já foi iniciado.', requestId },
      };
    case 'REGISTRATION_CLOSED':
      return {
        status: 409 as const,
        body: { error, message: 'As inscrições deste campeonato estão encerradas.', requestId },
      };
  }
}

function defaultTeamName(user: Env['Variables']['user']): string {
  return (user.displayName ?? user.name).trim().slice(0, 60) || 'Jogador';
}

async function ensureParticipantTeam(
  tx: Prisma.TransactionClient,
  competitionId: string,
  user: Env['Variables']['user'],
  participationId: string,
) {
  const existing = await tx.team.findUnique({ where: { participationId } });
  if (existing) return existing;

  const requested = defaultTeamName(user);
  const collision = await tx.team.findFirst({
    where: { competitionId, name: requested },
    select: { id: true },
  });
  const suffix = user.id.replaceAll('-', '').slice(0, 6);
  const teamName = collision ? `${requested.slice(0, 52)}-${suffix}` : requested;

  const team = await tx.team.create({
    data: {
      competitionId,
      participationId,
      createdById: user.id,
      name: teamName,
      logoUrl: null,
    },
  });

  await tx.participation.update({
    where: { id: participationId },
    data: { teamName, teamLogoUrl: null },
  });

  return team;
}

competitionJoin.post('/:id/join', async (c) => {
  const db = c.get('prisma');
  const competitionId = c.req.param('id');
  const user = c.get('user');
  const requestId = crypto.randomUUID();

  for (let attempt = 1; attempt <= MAX_JOIN_ATTEMPTS; attempt += 1) {
    try {
      const result = await db.$transaction(
        async (tx) => {
          // No pg_advisory_xact_lock / raw SQL here. Serializable isolation keeps
          // the capacity check and the participation write consistent under
          // concurrent joins while remaining compatible with the Supabase pooler.
          const competition = await tx.competition.findUnique({
            where: { id: competitionId },
            select: { id: true, status: true, maxParticipants: true },
          });

          if (!competition) return { ok: false as const, error: 'COMPETITION_NOT_FOUND' as const };
          if (['IN_PROGRESS', 'FINISHED'].includes(competition.status)) {
            return { ok: false as const, error: 'COMPETITION_ALREADY_STARTED' as const };
          }
          if (!['REGISTRATION', 'READY'].includes(competition.status)) {
            return { ok: false as const, error: 'REGISTRATION_CLOSED' as const };
          }

          let participation = await tx.participation.findUnique({
            where: { competitionId_userId: { competitionId, userId: user.id } },
            include: { team: true },
          });

          if (participation?.status === 'ACTIVE') {
            if (!participation.team) {
              await ensureParticipantTeam(tx, competitionId, user, participation.id);
            }
            return { ok: true as const, alreadyJoined: true };
          }

          const activeCount = await tx.participation.count({
            where: { competitionId, status: 'ACTIVE' },
          });
          if (activeCount >= competition.maxParticipants) {
            return { ok: false as const, error: 'COMPETITION_FULL' as const };
          }

          if (!participation) {
            participation = await tx.participation.create({
              data: {
                competitionId,
                userId: user.id,
                status: 'ACTIVE',
                teamName: defaultTeamName(user),
                teamLogoUrl: null,
              },
              include: { team: true },
            });
          } else {
            participation = await tx.participation.update({
              where: { id: participation.id },
              data: {
                status: 'ACTIVE',
                joinedAt: new Date(),
              },
              include: { team: true },
            });
          }

          const team = participation.team
            ?? await ensureParticipantTeam(tx, competitionId, user, participation.id);

          return {
            ok: true as const,
            alreadyJoined: false,
            participationId: participation.id,
            teamId: team.id,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 10_000,
        },
      );

      if (!result.ok) {
        const mapped = businessResponse(result.error, requestId);
        console.info('[competition.join] business rejection', {
          requestId,
          competitionId,
          userId: user.id,
          error: result.error,
          attempt,
        });
        return c.json(mapped.body, mapped.status);
      }

      console.info('[competition.join] joined', {
        requestId,
        competitionId,
        userId: user.id,
        alreadyJoined: result.alreadyJoined,
        attempt,
      });
      return c.json({ joined: true, requestId }, 200);
    } catch (error) {
      const prisma = safePrismaMeta(error);
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === 'P2002' || error.code === 'P2034');

      console.error('[competition.join] attempt failed', {
        requestId,
        competitionId,
        userId: user.id,
        attempt,
        retryable,
        prisma,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      if (retryable && attempt < MAX_JOIN_ATTEMPTS) continue;

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // A repeated tap or concurrent request can win the unique race. If the
        // row is already ACTIVE, treat the operation as idempotent success.
        const existing = await db.participation.findUnique({
          where: { competitionId_userId: { competitionId, userId: user.id } },
          select: { status: true },
        }).catch(() => null);
        if (existing?.status === 'ACTIVE') {
          return c.json({ joined: true, requestId }, 200);
        }

        return c.json(
          {
            error: 'JOIN_CONFLICT',
            message: 'Houve um conflito ao registrar sua entrada. Tente novamente.',
            prismaCode: error.code,
            requestId,
          },
          409,
        );
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return c.json(
          {
            error: 'JOIN_DATABASE_ERROR',
            message: 'O banco recusou a entrada no campeonato.',
            prismaCode: error.code,
            requestId,
          },
          500,
        );
      }

      return c.json(
        {
          error: 'JOIN_FAILED',
          message: 'Não foi possível concluir sua entrada no campeonato.',
          requestId,
        },
        500,
      );
    }
  }

  return c.json(
    {
      error: 'JOIN_FAILED',
      message: 'Não foi possível concluir sua entrada no campeonato.',
      requestId,
    },
    500,
  );
});
