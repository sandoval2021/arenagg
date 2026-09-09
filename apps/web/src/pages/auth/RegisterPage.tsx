import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail, Phone, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { GlobalLoader } from '../../components/brand/GlobalLoader';
import { Logo } from '../../components/brand/Logo';
import { useAuth } from '../../hooks/useAuth';
import { ApiError } from '../../lib/api';

type Mode = 'email' | 'phone';

function registrationErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível criar a conta. Tente novamente.';

  switch (error.code) {
    case 'INVALID_INPUT':
      return 'Confira os dados. A senha precisa ter pelo menos 10 caracteres.';
    case 'ACCOUNT_EXISTS':
      return 'Já existe uma conta com esse e-mail ou telefone.';
    case 'NETWORK_ERROR':
      return 'Não foi possível conectar ao servidor do Chavea.';
    case 'REGISTRATION_FAILED':
      return 'O servidor não conseguiu criar a conta. Tente novamente.';
    default:
      return `Não foi possível criar a conta. Código: ${error.code}`;
  }
}

function safeNext(value: string | null): string | null {
  return value?.startsWith('/') && !value.startsWith('//') ? value : null;
}

export function RegisterPage() {
  const [mode, setMode] = useState<Mode>('email');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await auth.register.mutateAsync({
        name,
        password,
        ...(mode === 'email' ? { email: identifier } : { phone: identifier }),
      });
      const next = safeNext(new URLSearchParams(location.search).get('next'));
      navigate(next ?? '/dashboard', { replace: true });
    } catch (error) {
      console.error('[register] request failed', error);
    }
  }

  return (
    <main className="min-h-dvh bg-white px-5 pb-10 pt-[max(2rem,env(safe-area-inset-top))] text-black">
      <div className="mx-auto max-w-md">
        <div className="flex w-full justify-center">
          <Link to="/" className="inline-flex rounded-2xl px-1 py-1 transition active:scale-95" aria-label="Chavea - início">
            <Logo size="md" />
          </Link>
        </div>
        <h1 className="mt-7 text-3xl font-black">Criar conta</h1>
        <p className="mt-2 text-sm font-medium text-slate-500">Entre no Chavea e comece sua competição. 🎮</p>

        <div className="mt-7 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
          <button type="button" onClick={() => { setMode('email'); setIdentifier(''); }} className={`rounded-xl py-3 text-sm font-bold ${mode === 'email' ? 'bg-white text-[#073B8C] shadow-sm' : 'text-slate-500'}`}>E-mail</button>
          <button type="button" onClick={() => { setMode('phone'); setIdentifier(''); }} className={`rounded-xl py-3 text-sm font-bold ${mode === 'phone' ? 'bg-white text-[#073B8C] shadow-sm' : 'text-slate-500'}`}>Telefone</button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field icon={<UserRound />}>
            <input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome" autoComplete="name" className="w-full outline-none" />
          </Field>

          <Field icon={mode === 'email' ? <Mail /> : <Phone />}>
            <input required type={mode === 'email' ? 'email' : 'tel'} value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder={mode === 'email' ? 'voce@email.com' : '+55 82 99999-9999'} autoComplete={mode === 'email' ? 'email' : 'tel'} className="w-full outline-none" />
          </Field>

          <Field icon={<LockKeyhole />} trailing={<button type="button" onClick={() => setShowPassword((value) => !value)} className="grid h-10 w-10 place-items-center text-slate-500" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>}>
            <input required type={showPassword ? 'text' : 'password'} minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Senha com pelo menos 10 caracteres" autoComplete="new-password" className="w-full outline-none" />
          </Field>

          {auth.register.isError && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-[#E31B23]">{registrationErrorMessage(auth.register.error)}</p>}

          <button disabled={auth.register.isPending} className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#073B8C] font-extrabold text-white shadow-md disabled:opacity-60">{auth.register.isPending ? <GlobalLoader mode="inline" label="Criando…" className="[&_*]:text-white" /> : 'Criar minha conta'}</button>
        </form>

        <p className="mt-7 text-center text-sm text-slate-500">Já possui conta? <Link to="/login" className="font-extrabold text-[#073B8C]">Entrar</Link></p>
      </div>
    </main>
  );
}

function Field({ icon, trailing, children }: { icon: React.ReactNode; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 px-4 shadow-sm focus-within:border-[#073B8C]">
      <span className="text-slate-400 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      {children}
      {trailing}
    </div>
  );
}
