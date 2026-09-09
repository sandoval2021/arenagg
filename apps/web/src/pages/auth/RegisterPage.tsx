import { useState } from 'react';
import { LockKeyhole, Mail, Phone, Trophy, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ApiError } from '../../lib/api';

type Mode = 'email' | 'phone';

function registrationErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Não foi possível criar a conta. Tente novamente.';
  }

  switch (error.code) {
    case 'INVALID_INPUT':
      return 'Confira os dados. A senha precisa ter pelo menos 10 caracteres.';
    case 'ACCOUNT_EXISTS':
      return 'Já existe uma conta com esse e-mail ou telefone.';
    case 'NETWORK_ERROR':
      return 'Não foi possível conectar ao servidor do ArenaGG.';
    case 'REGISTRATION_FAILED':
      return 'O servidor não conseguiu criar a conta. Tente novamente.';
    default:
      return `Não foi possível criar a conta. Código: ${error.code}`;
  }
}

export function RegisterPage() {
  const [mode, setMode] = useState<Mode>('email');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const auth = useAuth();
  const navigate = useNavigate();

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    try {
      await auth.register.mutateAsync({
        name,
        password,
        ...(mode === 'email' ? { email: identifier } : { phone: identifier }),
      });
      navigate('/');
    } catch (error) {
      console.error('[register] request failed', error);
    }
  }

  return (
    <main className="min-h-dvh bg-white px-5 pt-[max(2rem,env(safe-area-inset-top))] text-black">
      <div className="mx-auto max-w-md">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#073B8C] text-white shadow-md">
          <Trophy />
        </div>
        <h1 className="mt-7 text-3xl font-black">Criar conta</h1>
        <p className="mt-2 text-sm font-medium text-slate-500">Entre no ArenaGG e comece sua competição.</p>

        <div className="mt-7 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('email');
              setIdentifier('');
            }}
            className={`rounded-xl py-3 text-sm font-bold ${
              mode === 'email' ? 'bg-white text-[#073B8C] shadow-sm' : 'text-slate-500'
            }`}
          >
            E-mail
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('phone');
              setIdentifier('');
            }}
            className={`rounded-xl py-3 text-sm font-bold ${
              mode === 'phone' ? 'bg-white text-[#073B8C] shadow-sm' : 'text-slate-500'
            }`}
          >
            Telefone
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field icon={<UserRound />}>
            <input
              required
              minLength={2}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Seu nome"
              className="w-full outline-none"
            />
          </Field>

          <Field icon={mode === 'email' ? <Mail /> : <Phone />}>
            <input
              required
              type={mode === 'email' ? 'email' : 'tel'}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder={mode === 'email' ? 'voce@email.com' : '+55 82 99999-9999'}
              className="w-full outline-none"
            />
          </Field>

          <Field icon={<LockKeyhole />}>
            <input
              required
              type="password"
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Senha com pelo menos 10 caracteres"
              className="w-full outline-none"
            />
          </Field>

          {auth.register.isError && (
            <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-[#E31B23]">
              {registrationErrorMessage(auth.register.error)}
            </p>
          )}

          <button
            disabled={auth.register.isPending}
            className="min-h-14 w-full rounded-2xl bg-[#073B8C] font-extrabold text-white shadow-md disabled:opacity-60"
          >
            {auth.register.isPending ? 'Criando…' : 'Criar minha conta'}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-slate-500">
          Já possui conta?{' '}
          <Link to="/login" className="font-extrabold text-[#073B8C]">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 px-4 shadow-sm focus-within:border-[#073B8C]">
      <span className="text-slate-400 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      {children}
    </div>
  );
}
