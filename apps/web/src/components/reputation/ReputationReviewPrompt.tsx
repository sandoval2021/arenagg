import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Star, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import {
  getPendingReputationReview,
  submitReputationReview,
  type ReputationTag,
} from '../../lib/phase-six-api';

const tagOptions: Array<{ value: ReputationTag; label: string; tone: string }> = [
  { value: 'FAIR_PLAY', label: '🤝 Fair Play', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { value: 'RAGE_QUITTER', label: '🚪 Rage Quitter', tone: 'border-orange-200 bg-orange-50 text-orange-700' },
  { value: 'TOXIC', label: '⚠️ Tóxico', tone: 'border-rose-200 bg-rose-50 text-rose-700' },
];

export function ReputationReviewPrompt() {
  const { competitionId = '' } = useParams();
  const queryClient = useQueryClient();
  const [dismissedMatchId, setDismissedMatchId] = useState<string | null>(null);
  const [stars, setStars] = useState(5);
  const [tags, setTags] = useState<ReputationTag[]>([]);

  const pending = useQuery({
    queryKey: ['pending-reputation', competitionId],
    queryFn: () => getPendingReputationReview(competitionId),
    enabled: Boolean(competitionId),
    refetchInterval: 12_000,
    staleTime: 5_000,
  });

  const review = pending.data;
  const visible = Boolean(review && review.matchId !== dismissedMatchId);

  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [visible]);

  const submit = useMutation({
    mutationFn: () => {
      if (!review) throw new Error('NO_REVIEW');
      return submitReputationReview(review.matchId, { stars, tags });
    },
    onSuccess: async () => {
      const opponentId = review?.opponent.id;
      setTags([]);
      setStars(5);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pending-reputation', competitionId] }),
        opponentId ? queryClient.invalidateQueries({ queryKey: ['reputation-summary', opponentId] }) : Promise.resolve(),
      ]);
    },
  });

  if (!visible || !review) return null;

  function toggleTag(tag: ReputationTag) {
    setTags((current) => {
      if (current.includes(tag)) return current.filter((item) => item !== tag);
      if (tag === 'FAIR_PLAY') return ['FAIR_PLAY'];
      return [...current.filter((item) => item !== 'FAIR_PLAY'), tag];
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 backdrop-blur-[2px] sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Avaliar adversário">
      <section className="w-full rounded-t-[2rem] bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl sm:max-w-md sm:rounded-[2rem] sm:p-6">
        <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
        <div className="mt-4 flex items-start gap-3 sm:mt-0">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">Fair Play Chavea</p><h2 className="mt-1 text-xl font-black text-slate-950">Como foi jogar contra {review.opponent.name}?</h2><p className="mt-1 text-xs font-semibold text-slate-500">Sua avaliação ajuda a comunidade a identificar bons adversários.</p></div>
          <button type="button" onClick={() => setDismissedMatchId(review.matchId)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500" aria-label="Avaliar depois"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-5 flex justify-center gap-2" aria-label={`${stars} estrelas`}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button key={value} type="button" onClick={() => setStars(value)} className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 transition active:scale-90" aria-label={`${value} estrela${value > 1 ? 's' : ''}`}>
              <Star className={`h-7 w-7 ${value <= stars ? 'fill-amber-400 text-amber-500' : 'text-slate-300'}`} />
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-sm font-black text-slate-700">{stars}.0 de 5</p>

        <div className="mt-5">
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Opcional · marque o que aconteceu</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tagOptions.map((option) => {
              const active = tags.includes(option.value);
              return <button key={option.value} type="button" onClick={() => toggleTag(option.value)} className={`rounded-full border px-3 py-2 text-xs font-black transition ${active ? option.tone : 'border-slate-200 bg-white text-slate-500'}`}>{option.label}</button>;
            })}
          </div>
        </div>

        {submit.isError && <p className="mt-3 rounded-xl bg-rose-50 p-2 text-center text-xs font-bold text-rose-700">Não foi possível registrar a avaliação. Tente novamente.</p>}
        <button type="button" disabled={submit.isPending} onClick={() => submit.mutate()} className="mt-5 min-h-13 w-full rounded-2xl bg-[#073B8C] px-4 text-sm font-black text-white shadow-md disabled:opacity-50">{submit.isPending ? 'Enviando…' : 'Enviar avaliação'}</button>
        <button type="button" onClick={() => setDismissedMatchId(review.matchId)} className="mt-2 min-h-11 w-full text-xs font-black text-slate-400">Agora não</button>
      </section>
    </div>
  );
}
