import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, Clock3, Film, Gamepad2, Link2, Siren, ShieldCheck, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import {
  applyWalkover,
  getPhaseThreeCompetition,
  markMatchReady,
  type PhaseThreeMatch,
} from '../../lib/phase-three-api';

function automationError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível concluir esta ação.';
  if (error.code === 'PLAYER_ONLY') return 'Somente um dos jogadores deste confronto pode fazer check-in.';
  if (error.code === 'MATCH_NOT_OPEN' || error.code === 'INVALID_MATCH_TRANSITION') return 'Esta partida já foi encerrada ou não aceita mais esta ação.';
  if (error.code === 'MATCH_NOT_READY') return 'Os dois jogadores ainda não foram definidos nesta partida.';
  if (error.code === 'HOST_ONLY') return 'Somente o Host pode aplicar W.O.';
  if (error.code === 'WALKOVER_WINNER_REQUIRED') return 'Escolha quem receberá a vitória por W.O.';
  if (error.code === 'VERSION_CONFLICT') return 'A partida mudou em outra tela. Os dados foram atualizados; tente novamente.';
  return 'Não foi possível concluir esta ação.';
}

function isOpen(match: PhaseThreeMatch): boolean {
  return !['FINISHED', 'CANCELED'].includes(match.status) && Boolean(match.homeTeam && match.awayTeam);
}

export function CompetitionMatchAutomationPanel() {
  const { competitionId = '' } = useParams();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [choosingWinnerId, setChoosingWinnerId] = useState<string | null>(null);

  const competition = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: () => getPhaseThreeCompetition(competitionId),
    enabled: Boolean(competitionId),
  });
  const data = competition.data;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['competition', competitionId] }),
      queryClient.invalidateQueries({ queryKey: ['standings', competitionId] }),
      queryClient.invalidateQueries({ queryKey: ['top-scorers', competitionId] }),
      queryClient.invalidateQueries({ queryKey: ['competition-feed', competitionId] }),
      queryClient.invalidateQueries({ queryKey: ['competition-clips', competitionId] }),
      queryClient.invalidateQueries({ queryKey: ['match-stats', competitionId] }),
      queryClient.invalidateQueries({ queryKey: ['global-ranking'] }),
    ]);
  };

  const ready = useMutation({
    mutationFn: (matchId: string) => markMatchReady(matchId),
    onSuccess: invalidate,
  });

  const walkover = useMutation({
    mutationFn: ({ match, winner }: { match: PhaseThreeMatch; winner: 'AUTO' | 'HOME' | 'AWAY' }) =>
      applyWalkover(match.id, { winner, version: match.version }),
    onSuccess: async (_data, variables) => {
      clearClipDraft(variables.match.id);
      setChoosingWinnerId(null);
      await invalidate();
    },
  });

  const view = useMemo(() => {
    if (!data) return { matches: [] as PhaseThreeMatch[], myTeamId: undefined as string | undefined };
    const myTeamId = data.participations.find((participant) => participant.userId === data.currentUserId)?.team?.id;
    const matches = data.matches
      .filter(isOpen)
      .filter((match) => data.isHost || Boolean(myTeamId && (match.homeTeam?.id === myTeamId || match.awayTeam?.id === myTeamId)))
      .sort((a, b) => (a.round?.number ?? 0) - (b.round?.number ?? 0));
    return { matches, myTeamId };
  }, [data]);

  if (!data || !['IN_PROGRESS'].includes(data.status) || view.matches.length === 0) return null;
  const visible = showAll ? view.matches : view.matches.slice(0, 12);

  return (
    <section className="mx-auto mt-3 max-w-5xl px-2.5 sm:mt-5 sm:px-6">
      <div className="rounded-[1.5rem] border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-3 shadow-lg shadow-blue-100/50 sm:rounded-[2rem] sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#073B8C] sm:h-12 sm:w-12 sm:rounded-2xl text-white shadow-md"><Gamepad2 className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#073B8C]">Automação de partidas</p><h2 className="mt-0.5 text-lg font-black text-slate-950 sm:mt-1 sm:text-xl">Check-in, clipe e W.O.</h2><p className="mt-0.5 text-xs font-semibold leading-5 text-slate-500 sm:mt-1 sm:text-sm">Confirme presença e, se rolou golaço, deixe o link pronto. Ao registrar o placar, o clipe segue junto na mesma consolidação.</p></div>
        </div>

        <div className="mt-3 grid gap-2 sm:mt-5 sm:gap-3 lg:grid-cols-2">
          {visible.map((match) => {
            const viewerSide = match.homeTeam?.id === view.myTeamId ? 'HOME' : match.awayTeam?.id === view.myTeamId ? 'AWAY' : null;
            const viewerReady = viewerSide === 'HOME' ? match.homeReady : viewerSide === 'AWAY' ? match.awayReady : false;
            const autoWinnerAvailable = match.homeReady !== match.awayReady;
            const choosing = choosingWinnerId === match.id;
            const walkoverPending = walkover.isPending && walkover.variables?.match.id === match.id;
            const readyPending = ready.isPending && ready.variables === match.id;

            return (
              <article key={`${match.id}:${match.version}:${match.homeReady}:${match.awayReady}`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4">
                <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{match.round?.name || `Rodada ${match.round?.number ?? '-'}`} · {match.leg === 2 ? 'Volta' : 'Jogo'}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-500">{match.status.replaceAll('_', ' ')}</span></div>
                <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:mt-3 sm:gap-3">
                  <TeamReady name={match.homeTeam?.name ?? 'Mandante'} logoUrl={match.homeTeam?.logoUrl} ready={match.homeReady} />
                  <span className="text-sm font-black text-slate-300">VS</span>
                  <TeamReady name={match.awayTeam?.name ?? 'Visitante'} logoUrl={match.awayTeam?.logoUrl} ready={match.awayReady} align="right" />
                </div>

                {(viewerSide || data.isHost) && <ClipDraftInput matchId={match.id} />}

                {viewerSide && (
                  <button type="button" disabled={viewerReady || readyPending} onClick={() => ready.mutate(match.id)} className={`mt-2 flex min-h-10 w-full items-center justify-center sm:mt-3 sm:min-h-12 gap-2 rounded-2xl text-sm font-black transition ${viewerReady ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'bg-[#073B8C] text-white shadow-md'} disabled:opacity-70`}>
                    {viewerReady ? <CheckCircle2 className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                    {viewerReady ? 'Você está pronto ✅' : readyPending ? 'Confirmando…' : 'Estou Pronto'}
                  </button>
                )}

                {data.isHost && (
                  <div className="mt-2 border-t border-slate-100 pt-2 sm:mt-3 sm:pt-3">
                    {!choosing ? (
                      <button type="button" disabled={walkoverPending} onClick={() => {
                        if (autoWinnerAvailable) {
                          const winnerName = match.homeReady ? match.homeTeam?.name : match.awayTeam?.name;
                          if (window.confirm(`Aplicar W.O. 3x0 para ${winnerName ?? 'o jogador pronto'}?`)) walkover.mutate({ match, winner: 'AUTO' });
                        } else {
                          setChoosingWinnerId(match.id);
                        }
                      }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 text-xs font-black text-rose-700"><Siren className="h-4 w-4" />{walkoverPending ? 'Aplicando W.O.…' : 'Aplicar W.O.'}</button>
                    ) : (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
                        <div className="flex items-center justify-between"><p className="text-xs font-black text-rose-800">Escolha quem vence por 3×0</p><button type="button" onClick={() => setChoosingWinnerId(null)} className="grid h-8 w-8 place-items-center rounded-xl bg-white text-rose-600"><X className="h-4 w-4" /></button></div>
                        <div className="mt-2 grid grid-cols-2 gap-2"><WinnerButton label={match.homeTeam?.name ?? 'Mandante'} onClick={() => walkover.mutate({ match, winner: 'HOME' })} disabled={walkoverPending} /><WinnerButton label={match.awayTeam?.name ?? 'Visitante'} onClick={() => walkover.mutate({ match, winner: 'AWAY' })} disabled={walkoverPending} /></div>
                      </div>
                    )}
                  </div>
                )}

                {((ready.isError && ready.variables === match.id) || (walkover.isError && walkover.variables?.match.id === match.id)) && <p className="mt-2 rounded-xl bg-rose-50 p-2 text-center text-[11px] font-bold text-rose-700">{automationError(ready.variables === match.id && ready.isError ? ready.error : walkover.error)}</p>}
              </article>
            );
          })}
        </div>

        {view.matches.length > 12 && <button type="button" onClick={() => setShowAll((value) => !value)} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-white text-xs font-black text-[#073B8C]"><ChevronDown className={`h-4 w-4 transition ${showAll ? 'rotate-180' : ''}`} />{showAll ? 'Mostrar menos' : `Mostrar todos (${view.matches.length})`}</button>}
      </div>
    </section>
  );
}

function ClipDraftInput({ matchId }: { matchId: string }) {
  const storageKey = clipDraftKey(matchId);
  const [value, setValue] = useState(() => {
    try { return sessionStorage.getItem(storageKey) ?? ''; } catch { return ''; }
  });

  function change(next: string) {
    setValue(next);
    try {
      if (next.trim()) sessionStorage.setItem(storageKey, next.trim());
      else sessionStorage.removeItem(storageKey);
    } catch { /* storage can be unavailable in private modes */ }
  }

  return (
    <label className="mt-2 block rounded-xl border border-violet-100 bg-violet-50/60 p-2.5 sm:mt-4 sm:rounded-2xl sm:p-3">
      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-violet-700"><Film className="h-3.5 w-3.5" /> Link do Clipe / Golaço <span className="text-violet-400">· opcional</span></span>
      <span className="relative mt-2 block"><Link2 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-violet-400" /><input type="url" inputMode="url" value={value} onChange={(event) => change(event.target.value)} placeholder="https://youtube.com/..." className="min-h-10 w-full rounded-xl border border-violet-200 bg-white pl-9 pr-3 text-xs font-semibold outline-none focus:border-violet-400" /></span>
      <span className="mt-1.5 block text-[10px] font-semibold text-violet-500">YouTube, Twitch, TikTok ou link direto. Será enviado junto quando o placar for registrado.</span>
    </label>
  );
}

function clipDraftKey(matchId: string): string { return `chavea:match-clip:${matchId}`; }
function clearClipDraft(matchId: string): void { try { sessionStorage.removeItem(clipDraftKey(matchId)); } catch { /* noop */ } }

function TeamReady({ name, logoUrl, ready, align = 'left' }: { name: string; logoUrl?: string | null; ready: boolean; align?: 'left' | 'right' }) {
  return <div className={`min-w-0 ${align === 'right' ? 'text-right' : 'text-left'}`}><div className={`flex items-center gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>{logoUrl ? <img decoding="async" src={logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[10px] font-black text-[#073B8C]">{name.slice(0, 2).toUpperCase()}</span>}<div className="min-w-0"><p className="truncate text-xs font-black text-slate-900">{name}</p><p className={`mt-0.5 flex items-center gap-1 text-[10px] font-black ${align === 'right' ? 'justify-end' : ''} ${ready ? 'text-emerald-600' : 'text-slate-400'}`}>{ready ? <CheckCircle2 className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}{ready ? 'PRONTO' : 'AGUARDANDO'}</p></div></div></div>;
}

function WinnerButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return <button type="button" disabled={disabled} onClick={() => { if (window.confirm(`Confirmar W.O. 3x0 para ${label}?`)) onClick(); }} className="min-h-11 truncate rounded-xl bg-rose-600 px-2 text-xs font-black text-white shadow-sm disabled:opacity-50">3×0 {label}</button>;
}
