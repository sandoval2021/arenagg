import { useQuery } from '@tanstack/react-query';
import { Gamepad2, Swords } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GlobalLoader } from '../brand/GlobalLoader';
import { getGlobalFriendlyFeed } from '../../lib/phase-one-api';

export function GlobalFriendlyFeedPanel() {
  const query = useQuery({
    queryKey: ['global-friendly-feed'],
    queryFn: getGlobalFriendlyFeed,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  return (
    <section className="mt-7">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">Feed Global</p>
          <h2 className="mt-1 text-xl font-black">Amistosos recentes</h2>
        </div>
        <Link to="/play" className="rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black text-emerald-700">Jogar agora</Link>
      </div>

      {query.isLoading && <div className="mt-3"><GlobalLoader mode="section" label="Carregando amistosos…" /></div>}
      {query.isError && <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-center text-xs font-bold text-slate-500">Não foi possível carregar o Feed Global.</div>}
      {query.data && query.data.items.length === 0 && (
        <div className="mt-3 rounded-[1.6rem] border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
          <Gamepad2 className="mx-auto h-6 w-6 text-slate-300" />
          <p className="mt-2 text-sm font-black">Nenhum amistoso confirmado ainda.</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Os resultados do Jogar Agora aparecem aqui sem alterar o MMR.</p>
        </div>
      )}

      {query.data && query.data.items.length > 0 && (
        <div className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {query.data.items.slice(0, 10).map((item) => (
            <Link key={item.id} to={`/play/rooms/${encodeURIComponent(item.roomId)}`} className="w-[82%] shrink-0 snap-start rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm sm:w-[65%]">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700"><Gamepad2 className="h-3 w-3" /> Amistoso</span>
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Unranked</span>
              </div>
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <Player avatarUrl={item.challenger.avatarUrl} name={item.challenger.playerName} score={item.challenger.score} />
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-white"><Swords className="h-4 w-4" /></span>
                <Player avatarUrl={item.challenged.avatarUrl} name={item.challenged.playerName} score={item.challenged.score} />
              </div>
              <p className="mt-3 text-center text-[10px] font-bold text-slate-400">{platformLabel(item.challenger.platform)} · resultado confirmado · MMR intacto</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function Player({ avatarUrl, name, score }: { avatarUrl: string | null; name: string; score: number }) {
  return (
    <div className="min-w-0 text-center">
      <div className="mx-auto h-11 w-11 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {avatarUrl ? <img decoding="async" src={avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <span className="grid h-full w-full place-items-center text-[10px] font-black text-[#073B8C]">{name.slice(0, 2).toUpperCase()}</span>}
      </div>
      <p className="mt-1.5 truncate text-[11px] font-black text-slate-800">{name}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{score}</p>
    </div>
  );
}

function platformLabel(platform: string): string {
  if (platform === 'XBOX_ONE') return 'Xbox One';
  if (platform === 'XBOX_SERIES') return 'Xbox Series';
  return platform;
}
