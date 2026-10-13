import { ArrowLeft, KeyRound, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../../components/brand/Logo';

/**
 * Production safety: the old reset form required a private developer token
 * and is not an acceptable user-facing password recovery mechanism.
 * It is deliberately not displayed until a verified, one-time email reset
 * and its transactional mail delivery are configured.
 */
export function ForgotPasswordPage() {
  return (
    <main className="min-h-dvh bg-white px-5 pb-10 pt-[max(1rem,env(safe-area-inset-top))] text-black">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between">
          <Link to="/login" className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200" aria-label="Voltar ao login">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Logo size="sm" />
          <span className="w-11" aria-hidden="true" />
        </div>
        <span className="mt-9 grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-[#073B8C]">
          <KeyRound className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-3xl font-black">Recuperação de senha</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
          A recuperação automática por e-mail ainda está sendo configurada.
          Sua conta permanece protegida e seus campeonatos não foram apagados.
        </p>
        <div className="mt-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-800" />
          <p className="text-sm font-semibold leading-6 text-amber-950">
            Por segurança, nunca informe sua senha ou códigos de acesso a terceiros.
            Não existe código de desenvolvimento para recuperação pública.
          </p>
        </div>
        <Link to="/login" className="mt-7 flex min-h-14 items-center justify-center rounded-2xl bg-[#073B8C] px-5 font-black text-white">
          Voltar ao login
        </Link>
      </div>
    </main>
  );
}
