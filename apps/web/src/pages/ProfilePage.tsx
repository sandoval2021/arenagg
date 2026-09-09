import { useQuery } from '@tanstack/react-query';
import {
  Crown,
  Goal,
  LogOut,
  Mail,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { useAuth } from '../hooks/useAuth';
import { getMyUserProfile, PLATFORM_OWNER_EMAIL } from '../lib/api';

export function ProfilePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const user = auth.user;
  const isOwner = user?.email?.trim().toLowerCase() === PLATFORM_OWNER_EMAIL;
  const profile = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: getMyUserProfile,
  });

  const stats = profile.data ?? {
    totalWins: 0,
    totalDraws: 0,
    totalLosses: 0,
    totalGoalsScored: 0,
    totalGoalsConceded: 0,
    championshipsWon: 0,
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
        <header className="py-3">
          <p className="text-xs font-black uppercase tracking-[.18em] text-[#073B8C]">Sala de Troféus</p>
          <h1 className="text-2xl font-black tracking-tight">Meu Card de Jogador</h1>
        </header>

        <section className="relative mt-5 overflow-hidden rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-blue-50 p-5 shadow-xl shadow-amber-100/50">
          <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-amber-300/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-12 h-44 w-44 rounded-full bg-blue-300/20 blur-3xl" />
          <div className="relative flex items-center gap-4">
            <span className="relative grid h-20 w-20 shrink-0 place-items-center rounded-[1.4rem] border border-amber-200 bg-white shadow-lg shadow-amber-100">
              <span className="absolute inset-2 rounded-xl bg-gradient-to-br from-amber-100 to-blue-50" />
              <UserRound className="relative h-10 w-10 text-[#073B8C]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-black uppercase tracking-[.16em] text-amber-700">CHAVEA PLAYER</span><Sparkles className="h-4 w-4 text-amber-500" /></div>
              <h2 className="mt-2 truncate text-2xl font-black tracking-tight">{user?.displayName ?? user?.name}</h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-emerald-700"><ShieldCheck className="h-4 w-4" />Perfil competitivo ativo</p>
            </div>
          </div>

          <div className="relative mt-6 overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-b from-white to-amber-50 p-4 shadow-md">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-700">Prateleira de Troféus</p>
                <p className="mt-1 text-sm font-bold text-slate-500">Campeonatos conquistados</p>
              </div>
              <div className="relative grid h-16 w-16 place-items-center rounded-2xl border border-amber-300 bg-gradient-to-b from-yellow-100 via-amber-300 to-amber-500 shadow-lg shadow-amber-300/40">
                <span className="absolute inset-0 rounded-2xl bg-white/20 blur-sm" />
                <Trophy className="relative h-8 w-8 text-amber-950 drop-shadow" />
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div><span className="text-5xl font-black tracking-tighter text-amber-700">{stats.championshipsWon}</span><span className="ml-2 text-xs font-black uppercase tracking-wider text-amber-600">títulos</span></div>
              <div className="flex gap-1.5 pb-2" aria-hidden="true">{[0, 1, 2].map((index) => <span key={index} className={`grid h-8 w-8 place-items-center rounded-lg border ${stats.championshipsWon > index ? 'border-amber-300 bg-amber-100 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-300'}`}><Trophy className="h-4 w-4" /></span>)}</div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-gradient-to-r from-amber-700 via-yellow-400 to-amber-700 shadow-inner" />
          </div>
        </section>

        {profile.isLoading && <div className="mt-5 h-52 animate-pulse rounded-[2rem] bg-slate-100" />}
        {profile.isError && (
          <button type="button" onClick={() => void profile.refetch()} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700"><RotateCcw className="h-4 w-4" />Carregar estatísticas novamente</button>
        )}

        {!profile.isLoading && !profile.isError && totalGames === 0 && (
          <section className="mt-5 rounded-[2rem] border border-dashed border-blue-200 bg-blue-50/60 p-6 text-center shadow-sm">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-[#073B8C] shadow-sm"><Goal className="h-7 w-7" /></span>
            <h3 className="mt-4 text-lg font-black">Vá jogar sua primeira partida! 🎮</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Seu retrospecto, gols e conquistas vão aparecer aqui automaticamente.</p>
            <Link to="/competitions" className="mt-4 inline-flex min-h-11 items-center rounded-2xl bg-[#073B8C] px-5 text-sm font-black text-white">Ver minhas copas</Link>
          </section>
        )}

        {!profile.isLoading && !profile.isError && totalGames > 0 && (
          <>
            <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-md shadow-slate-200/60">
              <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#073B8C]">Painel de Retrospecto</p><h3 className="mt-1 text-lg font-black">{totalGames} partidas registradas</h3></div><span className="rounded-full bg-slate-950 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white">V · E · D</span></div>
              <div className="mt-5 space-y-4">
                <ResultBar label="Vitórias" value={stats.totalWins} total={totalGames} tone="emerald" />
                <ResultBar label="Empates" value={stats.totalDraws} total={totalGames} tone="amber" />
                <ResultBar label="Derrotas" value={stats.totalLosses} total={totalGames} tone="rose" />
              </div>
            </section>

            <section className="mt-5 grid grid-cols-[1fr_1.05fr_1fr] gap-2 rounded-[2rem] border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm">
              <GoalMetric label="Gols pró" value={stats.totalGoalsScored} />
              <div className={`rounded-2xl border p-3 text-center ${goalBalance >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}><p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Saldo de Gols</p><p className={`mt-2 text-3xl font-black ${goalBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{goalBalance > 0 ? '+' : ''}{goalBalance}</p></div>
              <GoalMetric label="Gols contra" value={stats.totalGoalsConceded} />
            </section>
          </>
        )}

        {isOwner && (
          <Link to="/owner/settings" className="mt-5 flex min-h-16 items-center gap-3 rounded-3xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-4 text-[#073B8C] shadow-sm">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#073B8C] text-white"><Crown className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1"><span className="block text-xs font-black uppercase tracking-wider text-blue-500">Proprietário</span><span className="mt-1 block text-base font-black">Configuração Geral</span></span>
            <Settings2 className="h-5 w-5" />
          </Link>
        )}

        {user?.email && <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"><Mail className="h-5 w-5 text-slate-400" /><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Conta</p><p className="truncate text-sm font-bold">{user.email}</p></div></div>}

        <button onClick={logout} disabled={auth.logout.isPending} className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 font-black text-[#E31B23] disabled:opacity-60"><LogOut className="h-5 w-5" />{auth.logout.isPending ? 'Saindo…' : 'Sair da conta'}</button>
      </main>
      <BottomNavigation />
    </div>
  );
}

function ResultBar({ label, value, total, tone }: { label: string; value: number; total: number; tone: 'emerald' | 'amber' | 'rose' }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  const tones = {
    emerald: { text: 'text-emerald-700', bar: 'bg-emerald-500' },
    amber: { text: 'text-amber-700', bar: 'bg-amber-400' },
    rose: { text: 'text-rose-700', bar: 'bg-rose-500' },
  }[tone];
  return <div><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-black text-slate-600">{label}</span><span className={`font-black ${tones.text}`}>{value} <span className="text-[10px] text-slate-400">({percent}%)</span></span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${tones.bar}`} style={{ width: `${percent}%` }} /></div></div>;
}

function GoalMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-slate-900">{value}</p></div>;
}
