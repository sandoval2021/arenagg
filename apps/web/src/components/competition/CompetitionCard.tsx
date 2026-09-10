import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Trophy, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getCompetition, type CompetitionStatus, type CompetitionSummary } from '../../lib/api';

const formatLabel = {
  LEAGUE: 'Liga',
  KNOCKOUT: 'Mata-mata',
  GROUPS_KNOCKOUT: 'Grupos + mata-mata',
  ENDLESS: 'Liga infinita',
} as const;

const statusLabel: Record<CompetitionStatus, string> = {
  DRAFT: 'Rascunho',
  REGISTRATION: 'Inscrições',
  READY: 'Pronto',
  IN_PROGRESS: 'Em andamento',
  FINISHED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

export function CompetitionCard({ competition }: { competition: CompetitionSummary }) {
  const queryClient = useQueryClient();
  const prefetch = () => void queryClient.prefetchQuery({ queryKey: ['competition', competition.id], queryFn: () => getCompetition(competition.id), staleTime: 30_000 });
  const showRound = competition.status === 'IN_PROGRESS' || competition.status === 'FINISHED';
  const isFull = competition.participantCount >= competition.maxParticipants;

  return (
    <Link to={`/competitions/${competition.id}`} onPointerEnter={prefetch} onPointerDown={prefetch} onFocus={prefetch} className="block rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[.99]">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#073B8C] text-white shadow-md shadow-blue-950/10">
          <Trophy className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-base font-extrabold text-black">{competition.name}</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">{formatLabel[competition.format]}{competition.isHost ? ' • Você é o host' : ''}</p>
            </div>
            <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-[#073B8C]">{statusLabel[competition.status]}</span>
          </div>

          {(competition.game || competition.platform) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {competition.platform && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-gradient-to-b from-slate-800 to-slate-950 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-sm">
                  🎮 {competition.platform}
                </span>
              )}
              {competition.game && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-gradient-to-b from-amber-50 to-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-900 shadow-sm shadow-amber-100">
                  ⚽ {competition.game}
                </span>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <span className={`flex items-center gap-1.5 font-semibold ${isFull ? 'text-amber-700' : 'text-slate-600'}`}><Users className="h-4 w-4" />{competition.participantCount}/{competition.maxParticipants} jogadores</span>
            <span className="flex items-center gap-1 font-bold text-black">{showRound ? `Rodada ${competition.currentRound ?? '—'}` : isFull ? 'Lobby cheio' : 'Abrir copa'}<ChevronRight className="h-4 w-4" /></span>
          </div>
        </div>
      </div>
    </Link>
  );
}
