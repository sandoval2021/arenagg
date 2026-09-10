import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { CompetitionDetailPageLight } from './CompetitionDetailPageLight';

const CompetitionPhaseFiveCenter = lazy(() =>
  import('../../components/competition/CompetitionPhaseFiveCenter').then((module) => ({ default: module.CompetitionPhaseFiveCenter })),
);
const CompetitionPrizePanel = lazy(() =>
  import('../../components/competition/CompetitionPrizePanel').then((module) => ({ default: module.CompetitionPrizePanel })),
);
const GroupStagePanel = lazy(() =>
  import('../../components/competition/GroupStagePanel').then((module) => ({ default: module.GroupStagePanel })),
);
const CompetitionMatchAutomationPanel = lazy(() =>
  import('../../components/matches/CompetitionMatchAutomationPanel').then((module) => ({ default: module.CompetitionMatchAutomationPanel })),
);
const CompetitionClipsPanel = lazy(() =>
  import('../../components/clips/CompetitionClipsPanel').then((module) => ({ default: module.CompetitionClipsPanel })),
);
const KnockoutBracketDock = lazy(() =>
  import('../../components/bracket/KnockoutBracketDock').then((module) => ({ default: module.KnockoutBracketDock })),
);
const ReputationReviewPrompt = lazy(() =>
  import('../../components/reputation/ReputationReviewPrompt').then((module) => ({ default: module.ReputationReviewPrompt })),
);

export function CompetitionDetailExperience() {
  const { competitionId = '' } = useParams();

  return (
    <>
      <CompetitionDetailPageLight />
      {competitionId && (
        <div aria-label="Recursos adicionais da competição">
          <DeferredSection><CompetitionPhaseFiveCenter /></DeferredSection>
          <DeferredSection><CompetitionPrizePanel /></DeferredSection>
          <DeferredSection><GroupStagePanel /></DeferredSection>
          <DeferredSection><CompetitionMatchAutomationPanel /></DeferredSection>
          <DeferredSection><CompetitionClipsPanel /></DeferredSection>
          <DeferredSection><KnockoutBracketDock /></DeferredSection>
          <DeferredSection><ReputationReviewPrompt /></DeferredSection>
        </div>
      )}
    </>
  );
}

function DeferredSection({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;

    if (typeof IntersectionObserver === 'undefined') {
      const timer = window.setTimeout(() => setReady(true), 800);
      return () => window.clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setReady(true);
        observer.disconnect();
      },
      { rootMargin: '700px 0px' },
    );

    const node = ref.current;
    if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [ready]);

  return (
    <div
      ref={ref}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 180px' }}
    >
      {ready ? (
        <Suspense fallback={<DeferredSkeleton />}>
          {children}
        </Suspense>
      ) : (
        <div className="mx-auto h-8 max-w-5xl px-4 sm:px-6" aria-hidden="true" />
      )}
    </div>
  );
}

function DeferredSkeleton() {
  return (
    <div className="mx-auto mt-4 max-w-5xl px-4 sm:px-6" aria-hidden="true">
      <div className="h-24 animate-pulse rounded-3xl border border-slate-100 bg-slate-100/80" />
    </div>
  );
}
