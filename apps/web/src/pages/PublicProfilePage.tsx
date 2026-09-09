import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Medal, ShieldCheck, Swords, Trophy, UserPlus, UserRound, Zap } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { GlobalLoader } from '../components/brand/GlobalLoader';
import { ConsoleBadges } from '../components/profile/ConsoleBadges';
import { HeadToHeadCard } from '../components/profile/HeadToHeadCard';
import { RankBadge, RankEmblem } from '../components/profile/RankBadge';
import { ReputationBadge } from '../components/profile/ReputationBadge';
import { TrophyRoom } from '../components/profile/TrophyRoom';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../lib/api';
import { PRIMARY_NAV_STALE_TIME } from '../lib/query-cache';
import { resolveRankLocally } from '../lib/gamification-api';
import { getPublicGamerProfile, requestFriend } from '../lib/social-api';

export function PublicProfilePage() {
  const { userId = '' } = useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['gamer-profile', userId],
    queryFn: () => getPublicGamerProfile(userId),
    enabled: Boolean(userId),
    staleTime: PRIMARY_NAV_STALE_TIME,
  });
  const add = useMutation({
    mutationFn: () => requestFriend(userId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gamer-profile', userId] }),
        queryClient.invalidateQueries({ queryKey: ['friends'] }),
        queryClient.invalidateQueries({ queryKey: ['friend-requests'] }),
      ]);
    },
  });

  if (profile.isLoading) return <GlobalLoader mode="screen" label="Carregando Card do Jogador…" />;
  if (profile.isError || !profile.data) return <main className="grid min-h-dvh place-items-center bg-white px-4"><div className="text-center"><h1 className="text-xl font-black">Jogador não encontrado</h1><Link to="/profile" className="mt-4 inline-flex rounded-2xl bg-[#073B8C] px-5 py-3 text-sm font-black text-white">Voltar ao perfil</Link></div></main>;

  const data = profile.data;
  const isMe = auth.user?.id === data.id;
  const totalGames = data.totalWins + data.totalDraws + data.totalLosses;
  const friendState = data.friendship;
  const playerName = data.displayName ?? data.name;
  const rank = resolveRankLocally(data.mmr);

  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <main className="mx-auto max-w-lg px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3 py-3">
          <button type="button" onClick={() => history.back()} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0"><p className="truncate text-[10px] font-black uppercase tracking-[.2em] text-[#073B8C]">Comunidade Chavea</p><h1 className="truncate text-xl font-black">Card de Jogador</h1></div>
        </header>

        <section className="relative mt-4 overflow-hidden rounded-[2rem] border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-amber-50 p-4 shadow-xl shadow-blue-100/50 sm:p-5">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="relative shrink-0">
              <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-[1.4rem] border border-blue-200 bg-white shadow-md sm:h-24 sm:w-24 sm:rounded-[1.6rem]">
                {data.avatarUrl ? <img src={data.avatarUrl} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-10 w-10 text-[#073B8C] sm:h-11 sm:w-11" />}
              </div>
              <span className="absolute -bottom-2 -right-2"><RankEmblem rank={rank} /></span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2"><h2 className="truncate text-xl font-black sm:text-2xl">{playerName}</h2><span className="flex shrink-0 items-center gap-1 rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-black text-white"><Medal className="h-3.5 w-3.5 text-amber-300" />{data.mmr} MMR</span></div>
              <div className="mt-2 flex flex-wrap items-center gap-2"><RankBadge mmr={data.mmr} /><ConsoleBadges consoles={data.consoles} /></div>
              <ReputationBadge userId={data.id} />
              <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-700"><ShieldCheck className="h-4 w-4 shrink-0" />{rank.subtitle} Chavea</p>
            </div>
          </div>

          {(data.favoriteFormation || data.playstyle) && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {data.favoriteFormation && <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-blue-200 bg-white/90 p-3 shadow-sm"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#073B8C] text-white"><Swords className="h-4 w-4" /></span><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.16em] text-blue-500">Formação favorita</p><p className="mt-0.5 truncate text-sm font-black text-slate-950">{data.favoriteFormation}</p></div></div>}
              {data.playstyle && <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-amber-200 bg-white/90 p-3 shadow-sm"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white"><Zap className="h-4 w-4" /></span><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.16em] text-amber-600">Estilo de jogo</p><p className="mt-0.5 text-sm font-black leading-5 text-slate-950">{data.playstyle}</p></div></div>}
            </div>
          )}

          {!isMe && (
            <div className="mt-5">
              {!friendState && <button disabled={add.isPending} onClick={() => add.mutate()} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#073B8C] px-3 text-center text-sm font-black text-white shadow-md disabled:opacity-50">{add.isPending ? <GlobalLoader mode="inline" label="Enviando…" className="[&_*]:text-white" /> : <><UserPlus className="h-4 w-4" />Adicionar como Amigo</>}</button>}
              {friendState?.status === 'ACCEPTED' && <div className="flex min-h-13 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 text-center text-sm font-black text-emerald-700"><Check className="h-4 w-4 shrink-0" />Vocês são amigos</div>}
              {friendState?.status === 'PENDING' && <div className="flex min-h-13 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-3 text-center text-sm font-black text-amber-700">{friendState.direction === 'OUTGOING' ? 'Pedido de amizade enviado' : 'Este jogador enviou um pedido para você'}</div>}
              {friendState?.status === 'REJECTED' && <button disabled={add.isPending} onClick={() => add.mutate()} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-3 text-center text-sm font-black text-[#073B8C]">{add.isPending ? <GlobalLoader mode="inline" label="Enviando…" /> : <><UserPlus className="h-4 w-4 shrink-0" />Enviar novo pedido</>}</button>}
              {add.isError && <p className="mt-2 rounded-xl bg-red-50 p-2 text-center text-xs font-bold text-red-700">{friendError(add.error)}</p>}
            </div>
          )}
        </section>

        {!isMe && <HeadToHeadCard userId={data.id} opponentName={playerName} />}
        <TrophyRoom badges={data.badges} />
        <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-[10px] font-black uppercase tracking-[.18em] text-[#073B8C]">Retrospecto público</p><h3 className="mt-1 text-lg font-black">{totalGames} partidas</h3></div><div className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-amber-50 px-3 py-2 text-amber-700"><Trophy className="h-4 w-4" /><span className="font-black">{data.championshipsWon}</span></div></div>
          <div className="mt-4 grid grid-cols-3 gap-1.5 sm:gap-2"><Metric label="Vitórias" value={data.totalWins} /><Metric label="Empates" value={data.totalDraws} /><Metric label="Derrotas" value={data.totalLosses} /></div>
          <div className="mt-2 grid grid-cols-2 gap-2"><Metric label="Gols pró" value={data.totalGoalsScored} /><Metric label="Gols contra" value={data.totalGoalsConceded} /></div>
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-2.5 text-center sm:p-3"><p className="truncate text-[8px] font-black uppercase tracking-wider text-slate-400 sm:text-[9px]">{label}</p><p className="mt-1 text-xl font-black sm:text-2xl">{value}</p></div>; }
function friendError(error: unknown): string { if (!(error instanceof ApiError)) return 'Não foi possível enviar o pedido.'; if (error.code === 'CANNOT_FRIEND_SELF') return 'Você não pode adicionar a si mesmo.'; if (error.code === 'USER_NOT_FOUND') return 'Esse jogador não está disponível.'; return 'Não foi possível enviar o pedido de amizade.'; }
