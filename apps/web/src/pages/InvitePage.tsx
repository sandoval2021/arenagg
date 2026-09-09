import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Gamepad2, LogIn, Trophy, UserPlus } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GlobalLoader } from '../components/brand/GlobalLoader';
import { useAuth } from '../hooks/useAuth';
import { ApiError, joinCompetition } from '../lib/api';

type JoinErrorDetails = {
  message?: string;
  prismaCode?: string;
  requestId?: string;
};

function errorDetails(error: ApiError): JoinErrorDetails {
  return error.details && typeof error.details === 'object'
    ? (error.details as JoinErrorDetails)
    : {};
}

function joinError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível entrar neste campeonato.';
  const details = errorDetails(error);

  if (error.status === 0 || error.code === 'NETWORK_ERROR') {
    return 'Falha de conexão. Verifique sua internet e tente novamente.';
  }
  if (error.status === 401 || error.code === 'UNAUTHORIZED') {
    return 'Sua sessão expirou. Entre novamente no Chavea e abra o convite.';
  }
  if (error.code === 'COMPETITION_NOT_FOUND') return 'Este convite não existe ou foi removido.';
  if (error.code === 'COMPETITION_FULL') return 'A copa já está lotada.';
  if (error.code === 'COMPETITION_ALREADY_STARTED') return 'O campeonato já foi iniciado.';
  if (error.code === 'REGISTRATION_CLOSED') return 'As inscrições deste campeonato estão encerradas.';
  if (error.code === 'JOIN_CONFLICT') return 'Houve um conflito ao registrar sua entrada. Toque novamente para tentar.';
  if (error.code === 'JOIN_DATABASE_ERROR') return details.message ?? 'O banco recusou a entrada no campeonato.';
  if (error.code === 'JOIN_FAILED') return details.message ?? 'Não foi possível concluir sua entrada no campeonato.';
  return details.message ?? `Não foi possível entrar agora (${error.code}).`;
}

function joinDiagnostic(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const details = errorDetails(error);
  const parts = [details.prismaCode ?? error.code, details.requestId].filter(Boolean);
  return parts.length > 0 ? `Diagnóstico: ${parts.join(' · ')}` : null;
}

export function InvitePage() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const next = `/invite/${encodeURIComponent(id)}`;
  const join = useMutation({
    mutationFn: () => joinCompetition(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['competitions', 'mine'] }),
        queryClient.invalidateQueries({ queryKey: ['competition', id] }),
      ]);
      navigate(`/competitions/${id}`, { replace: true });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        console.error('[invite.join] failed', {
          competitionId: id,
          status: error.status,
          code: error.code,
          details: error.details,
        });
        return;
      }
      console.error('[invite.join] failed', { competitionId: id, error });
    },
  });

  if (auth.isLoading) {
    return <GlobalLoader mode="screen" label="Preparando seu convite…" />;
  }

  const diagnostic = join.isError ? joinDiagnostic(join.error) : null;

  return (
    <main className="grid min-h-dvh place-items-center bg-white px-5 py-10 text-black">
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
        <div className="bg-[#073B8C] p-6 text-white">
          <div className="flex items-center justify-between"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10"><Trophy className="h-7 w-7" /></span><Gamepad2 className="h-8 w-8 text-blue-200" /></div>
          <p className="mt-6 text-xs font-black uppercase tracking-[.2em] text-blue-100">Convite Chavea</p>
          <h1 className="mt-2 text-3xl font-black leading-tight">Você foi convocado! 🎮🏆</h1>
          <p className="mt-3 text-sm font-medium leading-6 text-blue-100">A galera já está montando a chave. Entre na copa antes que comecem sem você. 😅</p>
        </div>

        <div className="p-6">
          {!auth.isAuthenticated ? (
            <>
              <h2 className="text-xl font-black">Primeiro, entre no Chavea</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">Crie sua conta grátis ou faça login. Depois você volta direto para este convite.</p>
              <div className="mt-5 space-y-3">
                <Link to={`/register?next=${encodeURIComponent(next)}`} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#073B8C] font-black text-white shadow-md"><UserPlus className="h-5 w-5" />Criar minha conta</Link>
                <Link to={`/login?next=${encodeURIComponent(next)}`} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-slate-200 font-black text-[#073B8C]"><LogIn className="h-5 w-5" />Já tenho conta</Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-black">Bora entrar, {auth.user?.displayName ?? auth.user?.name}? ⚽</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">Ao entrar, seu nome será adicionado ao lobby. Isso não inicia a Copa: somente o Host pode gerar as partidas manualmente.</p>
              <button disabled={join.isPending || !id} onClick={() => join.mutate()} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#073B8C] px-4 font-black text-white shadow-md disabled:opacity-60">
                {join.isPending ? <GlobalLoader mode="inline" label="Entrando…" className="[&_*]:text-white" /> : <><ArrowRight className="h-5 w-5" />Entrar neste Campeonato</>}
              </button>
              {join.isError && (
                <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3">
                  <p className="text-sm font-bold text-[#E31B23]">{joinError(join.error)}</p>
                  {diagnostic && <p className="mt-1 break-all text-[10px] font-bold text-red-400">{diagnostic}</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
