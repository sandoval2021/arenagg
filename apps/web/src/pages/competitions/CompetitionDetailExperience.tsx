import { useParams } from 'react-router-dom';
import { KnockoutBracketDock } from '../../components/bracket/KnockoutBracketDock';
import { CompetitionClipsPanel } from '../../components/clips/CompetitionClipsPanel';
import { CompetitionPhaseFiveCenter } from '../../components/competition/CompetitionPhaseFiveCenter';
import { CompetitionPrizePanel } from '../../components/competition/CompetitionPrizePanel';
import { GroupStagePanel } from '../../components/competition/GroupStagePanel';
import { CompetitionMatchAutomationPanel } from '../../components/matches/CompetitionMatchAutomationPanel';
import { ReputationReviewPrompt } from '../../components/reputation/ReputationReviewPrompt';
import { useCompetitionLivePolling } from '../../hooks/useCompetitionLivePolling';
import { CompetitionDetailPageLight } from './CompetitionDetailPageLight';

export function CompetitionDetailExperience() {
  const { competitionId = '' } = useParams();
  useCompetitionLivePolling(competitionId);

  return (
    <>
      <CompetitionDetailPageLight />
      <CompetitionPhaseFiveCenter />
      <CompetitionPrizePanel />
      <GroupStagePanel />
      <CompetitionMatchAutomationPanel />
      <CompetitionClipsPanel />
      <KnockoutBracketDock />
      <ReputationReviewPrompt />
    </>
  );
}
