import { useQuery } from '@tanstack/react-query';
import { Flame, MessageCircleMore, Shield, Sparkles, Swords, Trophy, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GlobalLoader } from '../brand/GlobalLoader';
import { getCompetitionFeed, type CompetitionFeedItem } from '../../lib/phase-one-api';

export function CompetitionFeedPanel({ competitionId }: { competitionId: string }) {
  const feed = useQuery({
    queryKey: ['competition-feed', competitionId],
    queryFn: () => getCompetitionFeed(competitionId),
    enabled: Boolean(competitionId),
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });

  if (feed.isLoading) return <GlobalLoader mode="section" label="Carregando resenha da Copa…" />;
  if (feed.isError) return <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">Não foi possível carregar o Feed agora.</div>;

  const items = feed.data?.items ?? [];
  if (items.length === 0) {
    return (
      <section className="rounded-[2rem] border border-dashed border-blue-200 bg-gradient-to-br from-blue-50 via-white to-amber-50 p-7 text-center shadow-sm">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#073B8C] text-white shadow-md"><MessageCircleMore className="h-6 w-6" /></span>
        <h3 className="mt-4 text-lg font-black text-slate-950">A resenha vai começar.</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Entradas no lobby e resultados das partidas vão aparecer automaticamente aqui.</p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-md shadow-slate-200/50">
      <header className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-r from-[#073B8C] via-blue-700 to-cyan-600 px-5 py-5 text-white">
        <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/15 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Flame className="h-5 w-5 text-amber-300" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-100">Ao vivo na comunidade</p>
            <h2 className="text-xl font-black">Feed da Copa</h2>
          </div>
          <Sparkles className="h-5 w-5 shrink-0 text-cyan-200" />
        </div>
      </header>

      <div className="relative divide-y divide-slate-100">
        {items.map((item) => <FeedRow key={item.id} item={item} />)}
      </div>
    </section>
  );
}

function FeedRow({ item }: { item: CompetitionFeedItem }) {
  if (item.type === 'JOIN') {
    return (
      <article className="flex gap-3 p-4 sm:p-5">
        <TimelineIcon tone="blue"><UserPlus className="h-4 w-4" /></TimelineIcon>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link to={`/profile/${encodeURIComponent(item.user.id)}`} className="font-black text-slate-950 hover:text-[#073B8C]">🏆 {item.user.name}</Link>
            <span className="text-sm font-semibold text-slate-500">entrou na Copa!</span>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-400">Chegou representando <strong className="text-slate-600">{item.team.name}</strong>.</p>
          <TimeLabel value={item.occurredAt} />
        </div>
        <AvatarOrShield name={item.team.name} url={item.team.logoUrl ?? item.user.avatarUrl} />
      </article>
    );
  }

  const winner = item.winnerSide === 'HOME' ? item.home : item.winnerSide === 'AWAY' ? item.away : null;
  const loser = item.winnerSide === 'HOME' ? item.away : item.winnerSide === 'AWAY' ? item.home : null;
  const isBlowout = item.tone === 'BLOWOUT';

  let headline: React.ReactNode;
  if (!winner || !loser) {
    headline = <><strong className="text-slate-950">🤝 {item.home.playerName}</strong> e <strong className="text-slate-950">{item.away.playerName}</strong> empataram em {item.home.score}×{item.away.score}.</>;
  } else if (isBlowout) {
    headline = <><strong className="text-slate-950">🔥 {winner.playerName}</strong> aplicou uma goleada de <strong className="text-rose-600">{winner.score}×{loser.score}</strong> no {loser.playerName}!</>;
  } else {
    headline = <><strong className="text-slate-950">⚽ {winner.playerName}</strong> venceu {loser.playerName} por <strong className="text-[#073B8C]">{winner.score}×{loser.score}</strong>.</>;
  }

  return (
    <article className={`flex gap-3 p-4 sm:p-5 ${isBlowout ? 'bg-gradient-to-r from-amber-50/70 via-white to-rose-50/40' : 'bg-white'}`}>
      <TimelineIcon tone={isBlowout ? 'amber' : item.tone === 'DRAW' ? 'slate' : 'green'}>
        {isBlowout ? <Flame className="h-4 w-4" /> : item.tone === 'DRAW' ? <Swords className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
      </TimelineIcon>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-6 text-slate-600">{headline}</p>
        <div className="mt-2 flex min-w-0 items-center gap-2 text-[10px] font-bold text-slate-400">
          <span className="truncate">{item.home.teamName}</span>
          <span>×</span>
          <span className="truncate">{item.away.teamName}</span>
        </div>
        <TimeLabel value={item.occurredAt} />
      </div>
      <div className="shrink-0 rounded-2xl bg-slate-950 px-3 py-2 text-center text-white shadow-sm">
        <p className="text-lg font-black leading-none">{item.home.score}×{item.away.score}</p>
        <p className="mt-1 text-[8px] font-black uppercase tracking-wider text-slate-400">Final</p>
      </div>
    </article>
  );
}

function TimelineIcon({ children, tone }: { children: React.ReactNode; tone: 'blue' | 'amber' | 'green' | 'slate' }) {
  const tones = {
    blue: 'bg-blue-50 text-[#073B8C] border-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    slate: 'bg-slate-100 text-slate-500 border-slate-200',
  } as const;
  return <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl border ${tones[tone]}`}>{children}</span>;
}

function AvatarOrShield({ name, url }: { name: string; url: string | null }) {
  if (url) return <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-white object-cover shadow-sm" loading="lazy" referrerPolicy="no-referrer" />;
  return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400"><Shield className="h-4 w-4" /><span className="sr-only">{name}</span></span>;
}

function TimeLabel({ value }: { value: string }) {
  const date = new Date(value);
  const label = Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
  return label ? <p className="mt-2 text-[9px] font-black uppercase tracking-[.12em] text-slate-300">{label}</p> : null;
}
