import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldAlert } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { GlobalLoader } from '../../components/brand/GlobalLoader';
import { Logo } from '../../components/brand/Logo';
import { ApiError, resetPasswordDev } from '../../lib/api';

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível redefinir a senha.';
  switch (error.code) {
    case 'DEV_RESET_DISABLED':
      return 'A recuperação temporária ainda não foi habilitada no servidor.';
    case 'DEV_RESET_FORBIDDEN':
      return 'Código temporário inválido.';
    case 'ACCOUNT_NOT_FOUND':
      return 'Não encontramos uma conta com esse e-mail.';
    case 'INVALID_INPUT':
      return 'Confira o e-mail e use uma senha com pelo menos 10 caracteres.';
    case 'NETWORK_ERROR':
      return 'Não foi possível conectar ao servidor do Chavea.';
    default:
      return 'Não foi possível redefinir a senha. Tente novamente.';
  }
}

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [devToken, setDevToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await resetPasswordDev(email, newPassword, devToken);
      setSuccess(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <main className="grid min-h-dvh place-items-center bg-white px-5 text-black">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 p-6 text-center shadow-sm">
          <Logo size="sm" className="mx-auto" />
          <span className="mx-auto mt-5 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><KeyRound /></span>
          <h1 className="mt-4 text-2xl font-black">Senha atualizada ✅</h1>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-500">Suas sessões anteriores foram encerradas. Entre novamente com a nova senha.</p>
          <button onClick={() => navigate('/login', { replace: true })} className="mt-6 min-h-14 w-full rounded-2xl bg-[#073B8C] font-black text-white">Ir para o login</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-white px-5 pb-10 pt-[max(1rem,env(safe-area-inset-top))] text-black">
      <div className="mx-auto max-w-md">
        <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-start gap-4">
          <Link to="/login" className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 shadow-sm" aria-label="Voltar para o login"><ArrowLeft className="h-5 w-5" /></Link>
          <Link to="/" className="mx-auto rounded-2xl px-1 py-1" aria-label="Chavea - início"><Logo size="sm" /></Link>
          <span className="h-11 w-11" aria-hidden="true" />
        </div>
        <span className="mt-8 grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-[#073B8C]"><KeyRound /></span>
        <h1 className="mt-5 text-3xl font-black tracking-tight">Esqueceu a senha?</h1>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">Enquanto o e-mail automático não chega, usamos uma recuperação temporária protegida por código de desenvolvimento.</p>

        <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-5 text-amber-900">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <p>Este fluxo é temporário e será removido quando a recuperação por e-mail estiver pronta.</p>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-black">E-mail
            <div className="mt-2 flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 px-4 focus-within:border-[#073B8C]">
              <Mail className="h-5 w-5 text-slate-400" />
              <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" className="w-full outline-none" />
            </div>
          </label>

          <label className="block text-sm font-black">Nova senha
            <div className="mt-2 flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 px-4 focus-within:border-[#073B8C]">
              <LockKeyhole className="h-5 w-5 text-slate-400" />
              <input required minLength={10} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Pelo menos 10 caracteres" className="w-full outline-none" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="grid h-10 w-10 place-items-center text-slate-500" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
            </div>
          </label>

          <label className="block text-sm font-black">Código temporário de desenvolvimento
            <div className="mt-2 flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 px-4 focus-within:border-[#073B8C]">
              <KeyRound className="h-5 w-5 text-slate-400" />
              <input required type="password" value={devToken} onChange={(e) => setDevToken(e.target.value)} placeholder="Código fornecido pelo administrador" className="w-full outline-none" />
            </div>
          </label>

          {error && <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-[#E31B23]">{error}</p>}

          <button disabled={pending} className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#073B8C] font-black text-white shadow-md disabled:opacity-60">{pending ? <GlobalLoader mode="inline" label="Atualizando…" className="[&_*]:text-white" /> : 'Redefinir senha'}</button>
        </form>
      </div>
    </main>
  );
}
