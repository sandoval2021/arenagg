import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Camera,
  Check,
  Copy,
  Dices,
  Gamepad2,
  Link2,
  LoaderCircle,
  Play,
  Repeat2,
  Trophy,
  UsersRound,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, getCompetition, startCompetition } from '../../lib/api';

function startError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível iniciar o campeonato.';
  if (error.code === 'NOT_ENOUGH_PARTICIPANTS') return 'Convide pelo menos mais um jogador antes de começar.';
  if (error.code === 'COMPETITION_ALREADY_STARTED') return 'Este campeonato já começou.';
  return 'Não foi possível gerar as partidas. Tente novamente.';
}

export function CompetitionDetailPage() {
  const { competitionId = '' } = useParams();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const competition = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: () => getCompetition(competitionId),
    enabled: Boolean(competitionId),
  });
  const start = useMutation({
    mutationFn: () => startCompetition(competitionId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['competition', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['competitions', 'mine'] }),
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
  const canStart = data.isHost && ['REGISTRATION', 'READY'].includes(data.status) && data.participations.length >= 2;

  return (
    <div className="min-h-dvh bg-white text-black">
      <main className="mx-auto max-w-lg px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3 py-3">
          <Link to="/competitions" className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 shadow-sm" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">{data.status === 'IN_PROGRESS' ? 'Em andamento' : 'Inscrições abertas'}</p><h1 className="truncate text-xl font-black">{data.name}</h1></div>
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-[#073B8C]"><Trophy className="h-5 w-5" /></span>
        </header>

        <section className="mt-3 flex flex-wrap gap-2" aria-label="Regras da competição">
          <RuleBadge icon={Repeat2} label={data.legFormat === 'HOME_AWAY' ? 'Ida e volta' : 'Jogo único'} tone="violet" />
          <RuleBadge icon={data.teamSelection === 'RANDOM' ? Dices : Gamepad2} label={data.teamSelection === 'RANDOM' ? 'Sorteio cego' : 'Times livres'} tone="amber" />
          {data.requireValidation && <RuleBadge icon={Camera} label="Placar com foto" tone="blue" />}
        </section>

        {data.isHost && (
          <section className="mt-5 rounded-3xl bg-[#073B8C] p-5 text-white shadow-lg shadow-blue-900/10">
            <p className="text-xs font-black uppercase tracking-wider text-blue-100">Você é o Host 👑</p>
            <h2 className="mt-1 text-xl font-black">Chame a galera para a copa</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-blue-100">Copie o link e mande no grupo. Cada amigo entra com a própria conta.</p>
            <button onClick={copyInvite} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 font-black text-[#073B8C] shadow-md">
              {copied ? <Check className="h-5 w-5" /> : <Link2 className="h-5 w-5" />}
              {copied ? 'Link copiado! ✅' : '🔗 Convidar Amigos'}
            </button>
          </section>
        )}

        <section className="mt-6">
          <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">Lobby</p><h2 className="text-xl font-black">Jogadores ({data.participations.length})</h2></div><UsersRound className="h-6 w-6 text-slate-400" /></div>
          <div className="mt-3 space-y-2">
            {data.participations.map((participant, index) => (
              <div key={participant.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 shadow-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-sm font-black text-[#073B8C]">{index + 1}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{participant.user.displayName ?? participant.user.name}</p><p className="truncate text-xs font-semibold text-slate-500">{participant.team?.name ?? 'Time pendente'}</p></div>
                {participant.userId === data.hostId && <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-[#073B8C]">HOST</span>}
              </div>
            ))}
          </div>
        </section>

        {data.isHost && ['REGISTRATION', 'READY'].includes(data.status) && (
          <section className="mt-6 rounded-3xl border border-slate-200 p-5 shadow-sm">
            <h2 className="text-lg font-black">Pronto para o sorteio? 🎲</h2>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-500">Quando todos entrarem, o ArenaGG sorteia os confrontos, cria as partidas e inicia a competição.</p>
            <button disabled={!canStart || start.isPending} onClick={() => start.mutate()} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#073B8C] px-4 font-black text-white shadow-md disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none">
              {start.isPending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
              {start.isPending ? 'Sorteando partidas…' : '🎲 Gerar Partidas e Começar!'}
            </button>
            {data.participations.length < 2 && <p className="mt-2 text-center text-xs font-bold text-amber-700">Falta pelo menos 1 amigo entrar.</p>}
            {start.isError && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-[#E31B23]">{startError(start.error)}</p>}
          </section>
        )}

        {data.status === 'IN_PROGRESS' && (
          <section className="mt-6">
            <div className="flex items-center justify-between"><h2 className="text-xl font-black">Partidas ⚽</h2><Link to={`/competitions/${data.id}/standings`} className="text-sm font-black text-[#073B8C]">Classificação</Link></div>
            <div className="mt-3 space-y-2">
              {data.matches.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">As partidas estão sendo preparadas.</p>}
              {data.matches.map((match) => (
                <div key={match.id} className="rounded-2xl border border-slate-200 p-4 text-sm shadow-sm">
                  {data.legFormat === 'HOME_AWAY' && <p className="mb-2 text-center text-[10px] font-black uppercase tracking-wider text-violet-700">{match.leg === 2 ? 'Jogo de volta' : 'Jogo de ida'}</p>}
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <p className="truncate text-right font-black">{match.homeTeam?.name ?? 'A definir'}</p>
                    <span className="rounded-xl bg-slate-100 px-3 py-2 font-black">{match.homeScore ?? '—'} × {match.awayScore ?? '—'}</span>
                    <p className="truncate font-black">{match.awayTeam?.name ?? 'A definir'}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {data.isHost && <button onClick={copyInvite} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 text-sm font-black text-slate-700"><Copy className="h-4 w-4" />Copiar convite</button>}
      </main>
    </div>
  );
}

type RuleTone = 'blue' | 'violet' | 'amber';

function RuleBadge({ icon: Icon, label, tone }: { icon: typeof Repeat2; label: string; tone: RuleTone }) {
  const tones: Record<RuleTone, string> = {
    blue: 'border-blue-100 bg-blue-50 text-[#073B8C]',
    violet: 'border-violet-100 bg-violet-50 text-violet-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
  };

  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-black ${tones[tone]}`}><Icon className="h-3.5 w-3.5" />{label}</span>;
}

function Loading() {
  return <main className="grid min-h-dvh place-items-center bg-white"><LoaderCircle className="h-8 w-8 animate-spin text-[#073B8C]" aria-label="Carregando campeonato" /></main>;
}

function ErrorState() {
  return <main className="grid min-h-dvh place-items-center bg-white px-5"><div className="max-w-sm text-center"><h1 className="text-xl font-black">Campeonato não encontrado</h1><p className="mt-2 text-sm font-medium text-slate-500">Você precisa participar desta copa para visualizar os detalhes.</p><Link to="/competitions" className="mt-5 inline-flex rounded-2xl bg-[#073B8C] px-5 py-3 font-black text-white">Ver minhas copas</Link></div></main>;
}
