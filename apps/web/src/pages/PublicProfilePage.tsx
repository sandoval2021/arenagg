import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ShieldCheck, Trophy, UserPlus, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { GlobalLoader } from '../components/brand/GlobalLoader';
import { ConsoleBadges } from '../components/profile/ConsoleBadges';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../lib/api';
import { getPublicGamerProfile, requestFriend } from '../lib/social-api';

export function PublicProfilePage() {
  const { userId = '' } = useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['gamer-profile', userId],
    queryFn: () => getPublicGamerProfile(userId),
    enabled: Boolean(userId),
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

  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <main className="mx-auto max-w-lg px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3 py-3">
          <button type="button" onClick={() => history.back()} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0"><p className="truncate text-[10px] font-black uppercase tracking-[.2em] text-[#073B8C]">Comunidade Chavea</p><h1 className="truncate text-xl font-black">Card de Jogador</h1></div>
        </header>

        <section className="relative mt-4 overflow-hidden rounded-[2rem] border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-amber-50 p-4 shadow-xl shadow-blue-100/50 sm:p-5">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[1.4rem] border border-blue-200 bg-white shadow-md sm:h-24 sm:w-24 sm:rounded-[1.6rem]">
              {data.avatarUrl ? <img src={data.avatarUrl} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-10 w-10 text-[#073B8C] sm:h-11 sm:w-11" />}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-black sm:text-2xl">{data.displayName ?? data.name}</h2>
              <div className="mt-2"><ConsoleBadges consoles={data.consoles} /></div>
              <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-700"><ShieldCheck className="h-4 w-4 shrink-0" />Jogador Chavea</p>
            </div>
          </div>

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
