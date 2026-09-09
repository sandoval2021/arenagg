import { KnockoutBracketDock } from '../../components/bracket/KnockoutBracketDock';
import { CompetitionClipsPanel } from '../../components/clips/CompetitionClipsPanel';
import { CompetitionPhaseFiveCenter } from '../../components/competition/CompetitionPhaseFiveCenter';
import { CompetitionPrizePanel } from '../../components/competition/CompetitionPrizePanel';
import { CompetitionMatchAutomationPanel } from '../../components/matches/CompetitionMatchAutomationPanel';
import { CompetitionDetailPageLight } from './CompetitionDetailPageLight';

export function CompetitionDetailExperience() {
  return (
    <>
      <CompetitionDetailPageLight />
      <CompetitionPhaseFiveCenter />
      <CompetitionPrizePanel />
      <CompetitionMatchAutomationPanel />
      <CompetitionClipsPanel />
      <KnockoutBracketDock />
    </>
  );
}
