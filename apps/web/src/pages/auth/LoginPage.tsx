import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail, Phone } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../../components/brand/Logo';
import { useAuth } from '../../hooks/useAuth';
import { ApiError } from '../../lib/api';

type Mode = 'email' | 'phone';

function safeNext(value: string | null): string | null {
  return value?.startsWith('/') && !value.startsWith('//') ? value : null;
}

function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível entrar. Tente novamente.';

  switch (error.code) {
    case 'NETWORK_ERROR':
      return 'Não foi possível conectar ao servidor do Chavea.';
    case 'INVALID_INPUT':
      return 'Confira seu e-mail, telefone e senha.';
    case 'INVALID_CREDENTIALS':
      return 'E-mail, telefone ou senha inválidos.';
    default:
      return 'Não foi possível entrar. Tente novamente.';
  }
}

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('email');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await auth.login.mutateAsync({
        password,
        ...(mode === 'email' ? { email: identifier } : { phone: identifier }),
      });
      const fromState = (location.state as { from?: string } | null)?.from ?? null;
      const fromQuery = safeNext(new URLSearchParams(location.search).get('next'));
      navigate(fromState ?? fromQuery ?? '/dashboard', { replace: true });
    } catch (error) {
      console.error('[login] request failed', error);
    }
  }

  return (
    <main className="min-h-dvh bg-white px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-black">
      <div className="mx-auto max-w-md">
        <div className="flex w-full justify-center">
          <Link to="/" className="inline-flex rounded-2xl px-1 py-1 transition active:scale-95" aria-label="Chavea - início">
            <Logo size="md" />
          </Link>
        </div>
        <h1 className="mt-7 text-3xl font-black tracking-tight">Entrar no Chavea</h1>
        <p className="mt-2 text-sm font-medium text-slate-500">Seus campeonatos começam aqui. 🎮🏆</p>

        <div className="mt-7 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
          <button type="button" onClick={() => { setMode('email'); setIdentifier(''); }} className={`rounded-xl py-3 text-sm font-bold ${mode === 'email' ? 'bg-white text-[#073B8C] shadow-sm' : 'text-slate-500'}`}>E-mail</button>
          <button type="button" onClick={() => { setMode('phone'); setIdentifier(''); }} className={`rounded-xl py-3 text-sm font-bold ${mode === 'phone' ? 'bg-white text-[#073B8C] shadow-sm' : 'text-slate-500'}`}>Telefone</button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm font-bold">{mode === 'email' ? 'E-mail' : 'Telefone'}
            <div className="mt-2 flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 px-4 focus-within:border-[#073B8C]">
              {mode === 'email' ? <Mail className="h-5 w-5 text-slate-400" /> : <Phone className="h-5 w-5 text-slate-400" />}
              <input type={mode === 'email' ? 'email' : 'tel'} required autoComplete={mode === 'email' ? 'email' : 'tel'} value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="w-full outline-none" placeholder={mode === 'email' ? 'voce@email.com' : '+55 82 99999-9999'} />
            </div>
          </label>

          <label className="block text-sm font-bold">Senha
            <div className="mt-2 flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 px-4 focus-within:border-[#073B8C]">
              <LockKeyhole className="h-5 w-5 text-slate-400" />
              <input type={showPassword ? 'text' : 'password'} required minLength={10} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full outline-none" placeholder="Sua senha" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="grid h-10 w-10 shrink-0 place-items-center text-slate-500" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
            </div>
          </label>

          <div className="flex justify-end"><Link to="/forgot-password" className="text-sm font-extrabold text-[#073B8C]">Esqueceu a senha?</Link></div>

          {auth.login.isError && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-[#E31B23]">{loginErrorMessage(auth.login.error)}</p>}
          <button disabled={auth.login.isPending} className="min-h-14 w-full rounded-2xl bg-[#073B8C] font-extrabold text-white shadow-md disabled:opacity-60">{auth.login.isPending ? 'Entrando…' : 'Entrar'}</button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs font-bold text-slate-400"><span className="h-px flex-1 bg-slate-200" />OU<span className="h-px flex-1 bg-slate-200" /></div>
        <a href={auth.googleLoginUrl} className="flex min-h-14 items-center justify-center rounded-2xl border border-slate-200 bg-white font-bold shadow-sm">Continuar com Google</a>
        <p className="mt-7 text-center text-sm text-slate-500">Ainda não tem conta? <Link to="/register" className="font-extrabold text-[#073B8C]">Criar conta</Link></p>
      </div>
    </main>
  );
}
