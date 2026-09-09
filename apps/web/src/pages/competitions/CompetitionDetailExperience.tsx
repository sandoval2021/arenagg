import { KnockoutBracketDock } from '../../components/bracket/KnockoutBracketDock';
import { CompetitionPrizePanel } from '../../components/competition/CompetitionPrizePanel';
import { CompetitionMatchAutomationPanel } from '../../components/matches/CompetitionMatchAutomationPanel';
import { CompetitionDetailPageLight } from './CompetitionDetailPageLight';

export function CompetitionDetailExperience() {
  return (
    <>
      <CompetitionDetailPageLight />
      <CompetitionPrizePanel />
      <CompetitionMatchAutomationPanel />
      <KnockoutBracketDock />
    </>
  );
}
