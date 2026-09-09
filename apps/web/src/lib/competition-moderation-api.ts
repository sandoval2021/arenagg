import { apiRequest } from './api';

export function removeCompetitionParticipant(
  competitionId: string,
  participationId: string,
): Promise<{ removed: true; requestId?: string }> {
  return apiRequest(
    `/api/competitions/${encodeURIComponent(competitionId)}/participants/${encodeURIComponent(participationId)}`,
    { method: 'DELETE' },
  );
}
