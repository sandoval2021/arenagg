import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Crown,
  Goal,
  LogOut,
  Mail,
  Pencil,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserPlus,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { ConsoleBadges } from '../components/profile/ConsoleBadges';
import { useAuth } from '../hooks/useAuth';
import { PLATFORM_OWNER_EMAIL } from '../lib/api';
import {
  acceptFriendRequest,
  getFriendRequests,
  getFriends,
  getMyGamerProfile,
  rejectFriendRequest,
} from '../lib/social-api';

export function ProfilePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOwner = auth.user?.email?.trim().toLowerCase() === PLATFORM_OWNER_EMAIL;

  const profile = useQuery({ queryKey: ['gamer-profile', 'me'], queryFn: getMyGamerProfile });
  const friends = useQuery({ queryKey: ['friends'], queryFn: getFriends });
  const requests = useQuery({ queryKey: ['friend-requests'], queryFn: getFriendRequests });

  const respond = useMutation<
    { id: string; status: 'ACCEPTED' | 'REJECTED' },
    Error,
    { id: string; action: 'accept' | 'reject' }
  >({
    mutationFn: async ({ id, action }) => {
      if (action === 'accept') return acceptFriendRequest(id);
      return rejectFriendRequest(id);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['friends'] }),
        queryClient.invalidateQueries({ queryKey: ['friend-requests'] }),
      ]);
    },
  });

  const data = profile.data;
  const stats = data ?? {
    totalWins: 0,
    totalDraws: 0,
    totalLosses: 0,
    totalGoalsScored: 0,
    totalGoalsConceded: 0,
    championshipsWon: 0,
    consoles: [],
  };
  const totalGames = stats.totalWins + stats.totalDraws + stats.totalLosses;
  const goalBalance = stats.totalGoalsScored - stats.totalGoalsConceded;

  async function logout() {
    await auth.logout.mutateAsync();
    navigate('/', { replace: true });
  }

  return (
    <div className="min-h-dvh bg-white pb-28 text-slate-900">
      <main className="mx-auto max-w-lg px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-end justify-between gap-3 py-3">
          <div><p className="text-xs font-black uppercase tracking-[.18em] text-[#073B8C]">Sala de Troféus</p><h1 className="text-2xl font-black tracking-tight">Meu Card de Jogador</h1></div>
          <Link to="/profile/edit" className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-[#073B8C] shadow-sm" aria-label="Editar perfil"><Pencil className="h-4 w-4" /></Link>
        </header>

        <section className="relative mt-5 overflow-hidden rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-blue-50 p-5 shadow-xl shadow-amber-100/50">
          <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-amber-300/25 blur-3xl" />
          <div className="relative flex items-center gap-4">
            <span className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[1.4rem] border border-amber-200 bg-white shadow-lg shadow-amber-100">
              {data?.avatarUrl ? <img src={data.avatarUrl} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-10 w-10 text-[#073B8C]" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-black uppercase tracking-[.16em] text-amber-700">ARENAGG PLAYER</span><Sparkles className="h-4 w-4 text-amber-500" /></div>
              <h2 className="mt-2 truncate text-2xl font-black tracking-tight">{data?.displayName ?? data?.name ?? auth.user?.displayName ?? auth.user?.name}</h2>
              <div className="mt-2"><ConsoleBadges consoles={data?.consoles ?? []} /></div>
              <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-700"><ShieldCheck className="h-4 w-4" />Perfil competitivo ativo</p>
            </div>
          </div>
          <div className="relative mt-5 flex items-center justify-between rounded-2xl border border-amber-100 bg-white/80 p-4">
            <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-700">Títulos conquistados</p><p className="mt-1 text-3xl font-black text-amber-700">{stats.championshipsWon}</p></div>
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-700"><Trophy className="h-7 w-7" /></span>
          </div>
        </section>

        {profile.isLoading && <div className="mt-5 h-48 animate-pulse rounded-[2rem] bg-slate-100" />}
        {profile.isError && <button type="button" onClick={() => void profile.refetch()} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700"><RotateCcw className="h-4 w-4" />Carregar perfil novamente</button>}

        {!profile.isLoading && !profile.isError && totalGames === 0 && (
          <section className="mt-5 rounded-[2rem] border border-dashed border-blue-200 bg-blue-50/60 p-6 text-center shadow-sm">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-[#073B8C] shadow-sm"><Goal className="h-7 w-7" /></span>
            <h3 className="mt-4 text-lg font-black">Vá jogar sua primeira partida! 🎮</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Seu retrospecto, gols e conquistas vão aparecer aqui automaticamente.</p>
          </section>
        )}

        {!profile.isLoading && !profile.isError && totalGames > 0 && (
          <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-md shadow-slate-200/60">
            <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#073B8C]">Retrospecto</p><h3 className="mt-1 text-lg font-black">{totalGames} partidas</h3></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ${goalBalance >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>Saldo {goalBalance > 0 ? '+' : ''}{goalBalance}</span></div>
            <div className="mt-4 grid grid-cols-3 gap-2"><Metric label="Vitórias" value={stats.totalWins} /><Metric label="Empates" value={stats.totalDraws} /><Metric label="Derrotas" value={stats.totalLosses} /></div>
            <div className="mt-2 grid grid-cols-2 gap-2"><Metric label="Gols pró" value={stats.totalGoalsScored} /><Metric label="Gols contra" value={stats.totalGoalsConceded} /></div>
          </section>
        )}

        {(requests.data?.length ?? 0) > 0 && (
          <section className="mt-5 rounded-[2rem] border border-blue-200 bg-blue-50/60 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[#073B8C]"><UserPlus className="h-5 w-5" /><h3 className="font-black">Pedidos de amizade</h3></div>
            <div className="mt-3 space-y-2">{requests.data?.map((request) => <div key={request.friendshipId} className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white p-3"><MiniAvatar url={request.user.avatarUrl} name={request.user.displayName ?? request.user.name} /><Link to={`/profile/${request.user.id}`} className="min-w-0 flex-1 truncate text-sm font-black text-slate-800">{request.user.displayName ?? request.user.name}</Link><button disabled={respond.isPending} onClick={() => respond.mutate({ id: request.friendshipId, action: 'accept' })} className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Check className="h-4 w-4" /></button><button disabled={respond.isPending} onClick={() => respond.mutate({ id: request.friendshipId, action: 'reject' })} className="grid h-9 w-9 place-items-center rounded-xl bg-red-50 text-red-600"><X className="h-4 w-4" /></button></div>)}</div>
          </section>
        )}

        <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-[#073B8C]" /><h3 className="font-black">Amigos</h3></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500">{friends.data?.length ?? 0}</span></div>
          {friends.isLoading && <div className="mt-3 h-14 animate-pulse rounded-2xl bg-slate-100" />}
          {!friends.isLoading && (friends.data?.length ?? 0) === 0 && <p className="mt-3 rounded-2xl bg-slate-50 p-4 text-center text-xs font-semibold text-slate-500">Seus amigos vão aparecer aqui.</p>}
          <div className="mt-3 space-y-2">{friends.data?.map((friend) => <Link key={friend.id} to={`/profile/${friend.id}`} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3"><MiniAvatar url={friend.avatarUrl} name={friend.displayName ?? friend.name} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800">{friend.displayName ?? friend.name}</p><div className="mt-1"><ConsoleBadges consoles={friend.consoles} compact /></div></div></Link>)}</div>
        </section>

        {isOwner && <Link to="/owner/settings" className="mt-5 flex min-h-16 items-center gap-3 rounded-3xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-4 text-[#073B8C] shadow-sm"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#073B8C] text-white"><Crown className="h-6 w-6" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-black uppercase tracking-wider text-blue-500">Proprietário</span><span className="mt-1 block text-base font-black">Configuração Geral</span></span><Settings2 className="h-5 w-5" /></Link>}

        {(data?.email ?? auth.user?.email) && <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"><Mail className="h-5 w-5 text-slate-400" /><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Conta</p><p className="truncate text-sm font-bold">{data?.email ?? auth.user?.email}</p></div></div>}
        <button onClick={logout} disabled={auth.logout.isPending} className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 font-black text-[#E31B23] disabled:opacity-60"><LogOut className="h-5 w-5" />{auth.logout.isPending ? 'Saindo…' : 'Sair da conta'}</button>
      </main>
      <BottomNavigation />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-900">{value}</p></div>; }
function MiniAvatar({ url, name }: { url: string | null; name: string }) { return url ? <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-white object-cover" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-xs font-black text-[#073B8C]">{name.slice(0, 2).toUpperCase()}</span>; }
