import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Camera,
  Check,
  Copy,
  Crown,
  Dices,
  Gamepad2,
  GitBranch,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Medal,
  Play,
  Repeat2,
  Save,
  Settings2,
  Shield,
  Sparkles,
  Swords,
  Target,
  Trophy,
  UsersRound,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  ApiError,
  getCompetition,
  getStandings,
  startCompetition,
  submitMatchScore,
  updateMyCompetitionTeam,
  type CompetitionDetail,
} from '../../lib/api';
import { StandingsTable } from '../../components/standings/StandingsTable';

type CompetitionTab = 'standings' | 'rounds';
type Participation = CompetitionDetail['participations'][number];
type CompetitionMatch = CompetitionDetail['matches'][number];

const presetShields = [
  { label: 'Azul', url: 'https://api.dicebear.com/9.x/shapes/svg?seed=ArenaBlue&backgroundColor=0d47a1' },
  { label: 'Vermelho', url: 'https://api.dicebear.com/9.x/shapes/svg?seed=ArenaRed&backgroundColor=c62828' },
  { label: 'Dourado', url: 'https://api.dicebear.com/9.x/shapes/svg?seed=ArenaGold&backgroundColor=f9a825' },
  { label: 'Roxo', url: 'https://api.dicebear.com/9.x/shapes/svg?seed=ArenaViolet&backgroundColor=6a1b9a' },
] as const;

function startError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível iniciar o campeonato.';
  if (error.code === 'NOT_ENOUGH_PARTICIPANTS') return 'Convide pelo menos mais um jogador antes de começar.';
  if (error.code === 'COMPETITION_ALREADY_STARTED' || error.code === 'START_CONFLICT') return 'Este campeonato já começou em outra ação.';
  if (error.code === 'MATCHES_ALREADY_EXIST') return 'As partidas desta copa já foram geradas.';
  return 'Não foi possível gerar as partidas. Tente novamente.';
}

export function CompetitionDetailPage() {
  const { competitionId = '' } = useParams();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<CompetitionTab>('standings');

  const competition = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: () => getCompetition(competitionId),
    enabled: Boolean(competitionId),
  });

  const standings = useQuery({
    queryKey: ['standings', competitionId],
    queryFn: () => getStandings(competitionId),
    enabled: Boolean(competitionId) && competition.data?.status === 'IN_PROGRESS' && activeTab === 'standings',
  });

  const start = useMutation({
    mutationFn: () => startCompetition(competitionId),
    onSuccess: async () => {
      setActiveTab('standings');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['competition', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['competitions', 'mine'] }),
        queryClient.invalidateQueries({ queryKey: ['standings', competitionId] }),
      ]);
    },
  });

  async function copyInvite() {
    const inviteUrl = `${window.location.origin}/invite/${competitionId}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch (error) {
      console.error('[invite] clipboard failed', error);
    }
  }

  if (competition.isLoading) return <Loading />;
  if (competition.isError || !competition.data) return <ErrorState />;

  const data = competition.data;
  const isRegistrationOpen = ['REGISTRATION', 'READY'].includes(data.status);
  const isFull = data.participations.length >= data.maxParticipants;
  const canStart = data.isHost && isRegistrationOpen && data.participations.length >= 2;
  const myParticipation = data.participations.find((participant) => participant.userId === data.currentUserId);
  const myTeamId = myParticipation?.team?.id;
  const rounds = groupMatchesByRound(data.matches);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:28px_28px]" />
      <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-28 top-72 h-72 w-72 rounded-full bg-fuchsia-600/10 blur-3xl" />

      <main className="relative mx-auto max-w-5xl px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <header className="flex items-center gap-3 py-3">
          <Link to="/competitions" className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[.06] shadow-xl shadow-black/20 backdrop-blur-xl" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-300">{data.status === 'IN_PROGRESS' ? 'Arena em andamento' : 'Lobby da competição'}</p>
            <h1 className="truncate text-xl font-black sm:text-2xl">{data.name}</h1>
          </div>
          <span className="grid h-11 w-11 place-items-center rounded-2xl border border-yellow-300/20 bg-gradient-to-br from-yellow-300/20 to-amber-600/10 text-yellow-300 shadow-lg shadow-amber-950/20"><Trophy className="h-5 w-5" /></span>
        </header>

        <section className="mt-3 flex flex-wrap gap-2" aria-label="Regras da competição">
          <RuleBadge icon={Repeat2} label={data.legFormat === 'HOME_AWAY' ? 'Ida e volta' : 'Jogo único'} tone="violet" />
          <RuleBadge icon={data.teamSelection === 'RANDOM' ? Dices : Gamepad2} label={data.teamSelection === 'RANDOM' ? 'Sorteio cego' : 'Times livres'} tone="amber" />
          <RuleBadge icon={UsersRound} label={`${data.participations.length}/${data.maxParticipants} jogadores`} tone={isFull ? 'rose' : 'cyan'} />
          {data.requireValidation && <RuleBadge icon={Camera} label="Placar com foto" tone="blue" />}
        </section>

        {data.status !== 'IN_PROGRESS' && (
          <div className="mt-6 grid gap-5 lg:grid-cols-[1.08fr_.92fr]">
            <div className="space-y-5">
              {data.isHost && (
                <section className="relative overflow-hidden rounded-[2rem] border border-blue-300/20 bg-gradient-to-br from-blue-700 via-[#073B8C] to-slate-950 p-5 shadow-2xl shadow-blue-950/40">
                  <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-cyan-300/15 blur-2xl" />
                  <div className="relative">
                    <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-cyan-200"><Crown className="h-4 w-4" /> Você é o Host</p>
                    <h2 className="mt-2 text-2xl font-black">Monte o lobby e dê o start quando quiser.</h2>
                    <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-blue-100">Entrar na copa nunca dispara o sorteio. As partidas só nascem quando você tocar no botão de início.</p>
                    <button disabled={isFull} onClick={copyInvite} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 font-black text-[#073B8C] shadow-xl shadow-black/20 transition active:scale-[.99] disabled:bg-slate-300 disabled:text-slate-600">
                      {isFull ? <LockKeyhole className="h-5 w-5" /> : copied ? <Check className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}
                      {isFull ? 'Limite de jogadores atingido' : copied ? 'Link copiado! ✅' : '🔗 Convidar Amigos'}
                    </button>
                  </div>
                </section>
              )}

              <Lobby participants={data.participations} hostId={data.hostId} maxParticipants={data.maxParticipants} />
            </div>

            <div className="space-y-5">
              {data.teamSelection === 'FREE' && myParticipation && isRegistrationOpen && (
                <TeamConfigurator competitionId={data.id} participant={myParticipation} />
              )}

              {data.isHost && isRegistrationOpen && (
                <section className="rounded-[2rem] border border-white/10 bg-white/[.055] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-300"><Dices className="h-6 w-6" /></span>
                    <div><p className="text-xs font-black uppercase tracking-wider text-cyan-300">Gatilho manual</p><h2 className="text-lg font-black">Gerar partidas</h2></div>
                  </div>
                  <p className="mt-4 text-sm font-medium leading-6 text-slate-400">Ao iniciar, o lobby é fechado para novas entradas, todas as rodadas são persistidas e a Copa muda para <strong className="text-white">IN_PROGRESS</strong>.</p>
                  <button disabled={!canStart || start.isPending} onClick={() => start.mutate()} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-600 px-4 font-black text-slate-950 shadow-xl shadow-blue-950/40 transition active:scale-[.99] disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-400 disabled:shadow-none">
                    {start.isPending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 fill-current" />}
                    {start.isPending ? 'Criando rodadas…' : '🎲 Gerar Partidas e Começar!'}
                  </button>
                  {data.participations.length < 2 && <p className="mt-3 text-center text-xs font-bold text-amber-300">Falta pelo menos 1 amigo entrar.</p>}
                  {start.isError && <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm font-bold text-rose-300">{startError(start.error)}</p>}
                </section>
              )}

              {!data.isHost && (
                <section className="rounded-[2rem] border border-white/10 bg-white/[.04] p-5 backdrop-blur-xl">
                  <div className="flex items-center gap-3 text-cyan-300"><Shield className="h-5 w-5" /><p className="text-sm font-black">Aguardando o Host</p></div>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-400">Você já está no lobby. O sorteio só acontece quando o Host iniciar manualmente.</p>
                </section>
              )}
            </div>
          </div>
        )}

        {data.status === 'IN_PROGRESS' && (
          <section className="mt-7">
            <div className="rounded-[2rem] border border-white/10 bg-white/[.045] p-2 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="grid grid-cols-2 gap-2">
                <TabButton active={activeTab === 'standings'} onClick={() => setActiveTab('standings')} icon={Medal} label="Classificação" />
                <TabButton active={activeTab === 'rounds'} onClick={() => setActiveTab('rounds')} icon={Swords} label="Rodadas" />
              </div>
            </div>

            <div className="mt-5">
              {activeTab === 'standings' && (
                <>
                  {standings.isLoading && <div className="h-80 animate-pulse rounded-[2rem] border border-white/10 bg-white/[.05]" />}
                  {standings.isError && <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm font-bold text-rose-300">Não foi possível carregar a classificação.</div>}
                  {!standings.isLoading && !standings.isError && <StandingsTable standings={standings.data ?? []} />}
                </>
              )}

              {activeTab === 'rounds' && (
                <RoundsView
                  rounds={rounds}
                  competitionId={data.id}
                  myTeamId={myTeamId}
                  isHost={data.isHost}
                  requireValidation={data.requireValidation}
                />
              )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {/* TODO(Stats): implementar artilharia quando o modelo de eventos/gols por jogador estiver disponível. */}
              <ComingSoon icon={Target} title="Artilharia" description="Ranking de gols e destaques por jogador." />
              {/* TODO(Bracket): implementar visualização navegável da árvore e progressão agregada de ida/volta. */}
              <ComingSoon icon={GitBranch} title="Árvore de Mata-Mata" description="Chave visual completa com caminho até a final." />
            </div>
          </section>
        )}

        {data.isHost && data.status !== 'IN_PROGRESS' && (
          <button disabled={isFull} onClick={copyInvite} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[.04] text-sm font-black text-slate-300 disabled:opacity-40"><Copy className="h-4 w-4" />Copiar convite</button>
        )}
      </main>
    </div>
  );
}

function Lobby({ participants, hostId, maxParticipants }: { participants: Participation[]; hostId: string; maxParticipants: number }) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/[.07] to-white/[.025] p-5 shadow-2xl shadow-black/25 backdrop-blur-xl">
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">Lobby</p><h2 className="mt-1 text-xl font-black">Jogadores <span className="text-slate-500">{participants.length}/{maxParticipants}</span></h2></div>
        <UsersRound className="h-6 w-6 text-slate-500" />
      </div>
      <div className="mt-4 space-y-2">
        {participants.map((participant, index) => (
          <div key={participant.id} className="flex items-center gap-3 rounded-2xl border border-white/[.08] bg-black/20 p-3 shadow-inner shadow-black/20">
            <TeamAvatar name={participant.teamName} logoUrl={participant.teamLogoUrl ?? participant.team?.logoUrl ?? undefined} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-white">{participant.teamName || participant.team?.name || 'Time pendente'}</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">#{index + 1} · {participant.user.displayName ?? participant.user.name}</p>
            </div>
            {participant.userId === hostId && <span className="rounded-full border border-yellow-300/20 bg-yellow-300/10 px-2 py-1 text-[10px] font-black text-yellow-300">HOST</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function TeamConfigurator({ competitionId, participant }: { competitionId: string; participant: Participation }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [teamName, setTeamName] = useState(participant.teamName || participant.team?.name || 'Meu Time');
  const [teamLogoUrl, setTeamLogoUrl] = useState(participant.teamLogoUrl ?? participant.team?.logoUrl ?? '');

  const mutation = useMutation({
    mutationFn: () => updateMyCompetitionTeam(competitionId, { teamName, teamLogoUrl: teamLogoUrl || null }),
    onSuccess: async () => {
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['competition', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['standings', competitionId] }),
      ]);
    },
  });

  const errorMessage = mutation.error instanceof ApiError && mutation.error.code === 'TEAM_NAME_TAKEN'
    ? 'Esse nome de time já está sendo usado nesta Copa.'
    : mutation.isError
      ? 'Não foi possível salvar seu time.'
      : null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 font-black text-cyan-200 shadow-lg shadow-cyan-950/10 transition active:scale-[.99]">
        <Settings2 className="h-5 w-5" />Configurar meu Time
      </button>
    );
  }

  return (
    <section className="rounded-[2rem] border border-cyan-300/20 bg-slate-900/80 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-300"><Settings2 className="h-5 w-5" /></span><div><p className="text-xs font-black uppercase tracking-wider text-cyan-300">Meu time</p><h2 className="text-lg font-black">Personalização</h2></div></div>

      <label className="mt-5 block text-xs font-black uppercase tracking-wider text-slate-400">Nome do Time</label>
      <input value={teamName} onChange={(event) => setTeamName(event.target.value)} maxLength={60} className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm font-bold text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50" placeholder="Ex.: Arsenal do San" />

      <label className="mt-4 block text-xs font-black uppercase tracking-wider text-slate-400">URL do escudo (HTTPS)</label>
      <input type="url" value={teamLogoUrl} onChange={(event) => setTeamLogoUrl(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50" placeholder="https://..." />

      <p className="mt-4 text-xs font-black uppercase tracking-wider text-slate-500">Ou escolha um escudo rápido</p>
      <div className="mt-2 flex gap-2">
        {presetShields.map((shield) => (
          <button key={shield.url} type="button" onClick={() => setTeamLogoUrl(shield.url)} aria-label={`Usar escudo ${shield.label}`} className={`grid h-12 w-12 place-items-center rounded-2xl border bg-white/5 p-1.5 transition ${teamLogoUrl === shield.url ? 'border-cyan-300 ring-2 ring-cyan-300/20' : 'border-white/10'}`}>
            <img src={shield.url} alt="" className="h-full w-full rounded-xl object-cover" referrerPolicy="no-referrer" />
          </button>
        ))}
      </div>

      {errorMessage && <p className="mt-3 rounded-xl bg-rose-500/10 p-3 text-xs font-bold text-rose-300">{errorMessage}</p>}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setOpen(false)} className="min-h-12 rounded-2xl border border-white/10 bg-white/[.04] text-sm font-black text-slate-300">Cancelar</button>
        <button type="button" disabled={teamName.trim().length < 2 || mutation.isPending} onClick={() => mutation.mutate()} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-300 text-sm font-black text-slate-950 disabled:opacity-40"><Save className="h-4 w-4" />{mutation.isPending ? 'Salvando…' : 'Salvar Time'}</button>
      </div>
    </section>
  );
}

function RoundsView({ rounds, competitionId, myTeamId, isHost, requireValidation }: { rounds: Array<{ number: number; name: string; matches: CompetitionMatch[] }>; competitionId: string; myTeamId?: string; isHost: boolean; requireValidation: boolean }) {
  if (rounds.length === 0) {
    return <div className="rounded-[2rem] border border-white/10 bg-white/[.04] p-6 text-center text-sm font-bold text-slate-400">As partidas estão sendo preparadas.</div>;
  }

  return (
    <div className="space-y-5">
      {rounds.map((round) => (
        <section key={round.number} className="overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-slate-900/95 to-black/95 shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[.035] px-5 py-4">
            <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-300">Fase de jogos</p><h3 className="mt-1 text-lg font-black">{round.name}</h3></div>
            <span className="rounded-full border border-white/10 bg-white/[.05] px-3 py-1 text-xs font-black text-slate-400">{round.matches.length} jogos</span>
          </div>
          <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-2">
            {round.matches.map((match) => {
              const canEdit = isHost || Boolean(myTeamId && (match.homeTeam?.id === myTeamId || match.awayTeam?.id === myTeamId));
              return (
                <MatchCard key={`${match.id}:${match.version}`} match={match} competitionId={competitionId} canEdit={canEdit} requireValidation={requireValidation} />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function MatchCard({ match, competitionId, canEdit, requireValidation }: { match: CompetitionMatch; competitionId: string; canEdit: boolean; requireValidation: boolean }) {
  const queryClient = useQueryClient();
  const [homeScore, setHomeScore] = useState(match.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(match.awayScore ?? 0);
  const [evidence, setEvidence] = useState<File | undefined>();
  const [localError, setLocalError] = useState<string | null>(null);
  const editable = canEdit && match.status === 'PENDING' && Boolean(match.homeTeam && match.awayTeam);

  const score = useMutation({
    mutationFn: () => submitMatchScore(match.id, { homeScore, awayScore, version: match.version, evidence }),
    onSuccess: async () => {
      setLocalError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['competition', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['standings', competitionId] }),
      ]);
    },
  });

  function saveScore() {
    if (requireValidation && !evidence) {
      setLocalError('Anexe a foto do placar para enviar o resultado.');
      return;
    }
    setLocalError(null);
    score.mutate();
  }

  return (
    <article className="rounded-3xl border border-white/[.08] bg-white/[.035] p-4 shadow-xl shadow-black/20">
      <div className="mb-3 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
        <span>{match.leg === 2 ? 'Jogo de volta' : match.leg === 1 ? 'Jogo de ida' : 'Confronto'}</span>
        <span className="rounded-full bg-white/[.05] px-2 py-1">{match.status.replaceAll('_', ' ')}</span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamSide team={match.homeTeam} align="right" />
        <div className="flex items-center gap-1.5">
          <ScoreInput value={homeScore} onChange={setHomeScore} disabled={!editable} label="Placar mandante" />
          <span className="font-black text-slate-600">×</span>
          <ScoreInput value={awayScore} onChange={setAwayScore} disabled={!editable} label="Placar visitante" />
        </div>
        <TeamSide team={match.awayTeam} align="left" />
      </div>

      {editable && requireValidation && (
        <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/20 px-3 text-xs font-black text-slate-300">
          <Camera className="h-4 w-4 text-cyan-300" />{evidence ? evidence.name : 'Anexar foto do placar'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setEvidence(event.target.files?.[0])} />
        </label>
      )}

      {editable && (
        <button onClick={saveScore} disabled={score.isPending} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-xs font-black text-cyan-200 disabled:opacity-40">
          {score.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{score.isPending ? 'Enviando…' : 'Registrar placar'}
        </button>
      )}

      {(localError || score.isError) && <p className="mt-2 text-center text-[11px] font-bold text-rose-300">{localError ?? scoreError(score.error)}</p>}
    </article>
  );
}

function TeamSide({ team, align }: { team: CompetitionMatch['homeTeam']; align: 'left' | 'right' }) {
  return (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <TeamAvatar name={team?.name ?? 'A definir'} logoUrl={team?.logoUrl ?? undefined} compact />
      <p className="mt-2 truncate text-xs font-black text-white">{team?.name ?? 'A definir'}</p>
    </div>
  );
}

function TeamAvatar({ name, logoUrl, compact = false }: { name: string; logoUrl?: string; compact?: boolean }) {
  const size = compact ? 'h-10 w-10' : 'h-11 w-11';
  if (logoUrl) return <img src={logoUrl} alt="" className={`${size} shrink-0 rounded-xl border border-white/10 bg-white/5 object-cover shadow-lg`} loading="lazy" referrerPolicy="no-referrer" />;
  return <span className={`inline-grid ${size} shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[.06] text-[10px] font-black text-cyan-200 shadow-inner`}>{name.slice(0, 2).toUpperCase()}</span>;
}

function ScoreInput({ value, onChange, disabled, label }: { value: number; onChange: (value: number) => void; disabled: boolean; label: string }) {
  return <input aria-label={label} type="number" inputMode="numeric" min={0} max={99} disabled={disabled} value={value} onChange={(event) => onChange(Math.min(99, Math.max(0, Number(event.target.value) || 0)))} className="h-11 w-11 rounded-xl border border-white/10 bg-black/40 text-center text-lg font-black text-white outline-none focus:border-cyan-300 disabled:text-slate-400" />;
}

function scoreError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível registrar o placar.';
  if (error.code === 'EVIDENCE_REQUIRED') return 'A foto do placar é obrigatória nesta Copa.';
  if (error.code === 'INVALID_MATCH_TRANSITION') return 'Este jogo não aceita um novo placar neste momento.';
  if (error.code === 'FORBIDDEN') return 'Você não pode registrar o placar deste jogo.';
  return 'Falha ao registrar o placar.';
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Medal; label: string }) {
  return <button type="button" onClick={onClick} className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-black transition ${active ? 'bg-gradient-to-r from-cyan-300 to-blue-500 text-slate-950 shadow-lg shadow-blue-950/30' : 'text-slate-400 hover:bg-white/[.04]'}`}><Icon className="h-4 w-4" />{label}</button>;
}

function ComingSoon({ icon: Icon, title, description }: { icon: typeof Target; title: string; description: string }) {
  return (
    <button disabled className="flex min-h-24 items-center gap-4 rounded-3xl border border-white/10 bg-white/[.035] p-4 text-left opacity-70 backdrop-blur-xl">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/[.06] text-slate-400"><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="text-sm font-black text-slate-300">{title}</strong><span className="rounded-full bg-fuchsia-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-fuchsia-300">Em breve</span></span><span className="mt-1 block text-xs font-medium leading-5 text-slate-500">{description}</span></span>
      <Sparkles className="h-4 w-4 text-slate-600" />
    </button>
  );
}

type RuleTone = 'blue' | 'violet' | 'amber' | 'cyan' | 'rose';

function RuleBadge({ icon: Icon, label, tone }: { icon: typeof Repeat2; label: string; tone: RuleTone }) {
  const tones: Record<RuleTone, string> = {
    blue: 'border-blue-300/20 bg-blue-300/10 text-blue-200',
    violet: 'border-violet-300/20 bg-violet-300/10 text-violet-200',
    amber: 'border-amber-300/20 bg-amber-300/10 text-amber-200',
    cyan: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-200',
    rose: 'border-rose-300/20 bg-rose-300/10 text-rose-200',
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-black backdrop-blur-xl ${tones[tone]}`}><Icon className="h-3.5 w-3.5" />{label}</span>;
}

function groupMatchesByRound(matches: CompetitionMatch[]) {
  const grouped = new Map<number, CompetitionMatch[]>();
  for (const match of matches) {
    const number = match.round?.number ?? 0;
    const bucket = grouped.get(number) ?? [];
    bucket.push(match);
    grouped.set(number, bucket);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, roundMatches]) => ({
      number,
      name: roundMatches[0]?.round?.name || (number > 0 ? `Rodada ${number}` : 'Partidas'),
      matches: roundMatches,
    }));
}

function Loading() {
  return <main className="grid min-h-dvh place-items-center bg-slate-950"><LoaderCircle className="h-8 w-8 animate-spin text-cyan-300" aria-label="Carregando campeonato" /></main>;
}

function ErrorState() {
  return <main className="grid min-h-dvh place-items-center bg-slate-950 px-5 text-white"><div className="max-w-sm text-center"><h1 className="text-xl font-black">Campeonato não encontrado</h1><p className="mt-2 text-sm font-medium text-slate-500">Você precisa participar desta copa para visualizar os detalhes.</p><Link to="/competitions" className="mt-5 inline-flex rounded-2xl bg-cyan-300 px-5 py-3 font-black text-slate-950">Ver minhas copas</Link></div></main>;
}
