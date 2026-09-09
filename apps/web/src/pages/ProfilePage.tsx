import { LogOut, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { useAuth } from '../hooks/useAuth';

export function ProfilePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const user = auth.user;

  async function logout() {
    await auth.logout.mutateAsync();
    navigate('/', { replace: true });
  }

  return (
    <div className="min-h-dvh bg-white pb-28 text-black">
      <main className="mx-auto max-w-lg px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="py-3">
          <p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">Minha conta</p>
          <h1 className="text-2xl font-black tracking-tight">Meu Perfil</h1>
        </header>

        <section className="mt-5 rounded-3xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-[#073B8C]"><UserRound className="h-8 w-8" /></span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-black">{user?.displayName ?? user?.name}</h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-emerald-700"><ShieldCheck className="h-4 w-4" />Conta ativa</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {user?.email && <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4"><Mail className="h-5 w-5 text-slate-400" /><div><p className="text-[11px] font-black uppercase tracking-wider text-slate-400">E-mail</p><p className="text-sm font-bold">{user.email}</p></div></div>}
            {user?.phone && <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4"><Phone className="h-5 w-5 text-slate-400" /><div><p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Telefone</p><p className="text-sm font-bold">{user.phone}</p></div></div>}
          </div>
        </section>

        <button onClick={logout} disabled={auth.logout.isPending} className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 font-black text-[#E31B23] disabled:opacity-60"><LogOut className="h-5 w-5" />{auth.logout.isPending ? 'Saindo…' : 'Sair da conta'}</button>
      </main>
      <BottomNavigation />
    </div>
  );
}
