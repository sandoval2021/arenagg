import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, PackageOpen, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { GlobalLoader } from '../components/brand/GlobalLoader';
import {
  getAlbum,
  openStickerPack,
  type AlbumCard,
  type CardRarity,
  type OpenPackResponse,
  type StickerPackType,
} from '../lib/album-api';

const rarityStyle: Record<CardRarity, string> = {
  COMMON: 'border-slate-300 bg-gradient-to-br from-slate-100 via-white to-slate-200 text-slate-800 shadow-slate-200/70',
  RARE: 'border-amber-300 bg-gradient-to-br from-yellow-100 via-amber-50 to-amber-300 text-amber-950 shadow-amber-200/80',
  EPIC: 'border-violet-400 bg-gradient-to-br from-violet-200 via-fuchsia-100 to-purple-500 text-purple-950 shadow-violet-300/60',
  LEGENDARY: 'border-slate-700 bg-gradient-to-br from-slate-950 via-slate-800 to-black text-white shadow-slate-500/50',
};

const rarityLabel: Record<CardRarity, string> = {
  COMMON: 'Comum',
  RARE: 'Rara',
  EPIC: 'Épica',
  LEGENDARY: 'Lendária',
};

export function AlbumPage() {
  const queryClient = useQueryClient();
  const [selectedPage, setSelectedPage] = useState<string | undefined>();
  const [lastPack, setLastPack] = useState<OpenPackResponse | null>(null);

  const album = useQuery({
    queryKey: ['album', selectedPage ?? 'first'],
    queryFn: () => getAlbum(selectedPage),
    staleTime: 20_000,
  });

  useEffect(() => {
    if (!selectedPage && album.data?.selectedPage) setSelectedPage(album.data.selectedPage);
  }, [album.data?.selectedPage, selectedPage]);

  const packs = useMemo(() => {
    const map = new Map(album.data?.packs.map((pack) => [pack.packType, pack.quantity]) ?? []);
    return {
      COMMON: map.get('COMMON') ?? 0,
      PREMIUM: map.get('PREMIUM') ?? 0,
    };
  }, [album.data?.packs]);

  const openPack = useMutation({
    mutationFn: (packType: StickerPackType) => openStickerPack(packType),
    onSuccess: async (result) => {
      setLastPack(result);
      await queryClient.invalidateQueries({ queryKey: ['album'] });
    },
  });

  if (album.isLoading && !album.data) {
    return <GlobalLoader mode="screen" label="Abrindo seu álbum…" />;
  }

  const data = album.data;

  return (
    <div className="min-h-dvh bg-white pb-28 text-slate-900">
      <main className="mx-auto max-w-lg px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3 py-3">
          <Link to="/profile" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Voltar ao perfil">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-[#073B8C]">Coleção Chavea</p>
            <h1 className="truncate text-2xl font-black tracking-tight">Meu Álbum</h1>
          </div>
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-yellow-500 text-amber-950 shadow-md shadow-amber-200/70">
            <Sparkles className="h-5 w-5" />
          </span>
        </header>

        <section className="mt-4 overflow-hidden rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-blue-50 p-5 shadow-xl shadow-amber-100/50">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-700">Progresso da coleção</p>
              <p className="mt-1 text-2xl font-black">{data?.progress.completed ?? 0} / {data?.progress.total ?? 0}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">Completado: {data?.progress.percentage ?? 0}%</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Página atual</p>
              <p className="mt-1 max-w-36 truncate text-sm font-black text-[#073B8C]">{data?.selectedPage ?? 'Sem cartas'}</p>
            </div>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white shadow-inner">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-400 via-yellow-400 to-blue-500 transition-all" style={{ width: `${Math.min(100, data?.progress.percentage ?? 0)}%` }} />
          </div>
        </section>

        <section className="mt-4 rounded-[1.7rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#073B8C]">Pacotinhos</p>
              <p className="mt-1 text-sm font-bold text-slate-500">Cada pacote revela 5 cartas.</p>
            </div>
            <PackageOpen className="h-6 w-6 text-amber-500" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <PackButton label="Comum" quantity={packs.COMMON} busy={openPack.isPending} onClick={() => openPack.mutate('COMMON')} />
            <PackButton label="Premium" quantity={packs.PREMIUM} busy={openPack.isPending} onClick={() => openPack.mutate('PREMIUM')} premium />
          </div>
          {openPack.isError && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-700">Você não possui pacotinhos disponíveis deste tipo.</p>}
        </section>

        <div className="-mx-4 mt-5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-2">
            {data?.pages.map((page, index) => {
              const active = page.albumPage === data.selectedPage;
              return (
                <button
                  key={page.albumPage}
                  type="button"
                  onClick={() => setSelectedPage(page.albumPage)}
                  className={`min-h-11 rounded-full border px-4 text-left transition ${active ? 'border-[#073B8C] bg-[#073B8C] text-white shadow-md shadow-blue-200' : 'border-slate-200 bg-white text-slate-600'}`}
                >
                  <span className="block text-[9px] font-black uppercase tracking-wider opacity-70">Página {index + 1}</span>
                  <span className="block text-xs font-black">{page.albumPage}</span>
                </button>
              );
            })}
          </div>
        </div>

        {album.isFetching && data && <div className="mt-4"><GlobalLoader mode="section" label="Virando a página…" /></div>}
        {album.isError && <section className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center text-sm font-bold text-rose-700">Não foi possível carregar o álbum agora.</section>}

        {!album.isError && (
          <section className="mt-5">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-slate-400">{data?.selectedPage}</p><h2 className="text-lg font-black">Figurinhas desta página</h2></div>
              <span className="text-xs font-black text-slate-400">{data?.cards.length ?? 0} slots</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data?.cards.map((card) => <StickerSlot key={card.id} card={card} />)}
            </div>
          </section>
        )}
      </main>

      {lastPack && <PackReveal result={lastPack} onClose={() => setLastPack(null)} />}
      <BottomNavigation />
    </div>
  );
}

function PackButton({ label, quantity, busy, onClick, premium = false }: { label: string; quantity: number; busy: boolean; onClick: () => void; premium?: boolean }) {
  return (
    <button
      type="button"
      disabled={quantity <= 0 || busy}
      onClick={onClick}
      className={`min-h-14 rounded-2xl px-3 text-left shadow-sm transition active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-45 ${premium ? 'bg-gradient-to-br from-slate-950 to-violet-950 text-white' : 'border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-100 text-amber-950'}`}
    >
      <span className="block text-[10px] font-black uppercase tracking-wider opacity-70">{label}</span>
      <span className="mt-1 block text-sm font-black">{busy ? 'Abrindo…' : `${quantity} pacote${quantity === 1 ? '' : 's'}`}</span>
    </button>
  );
}

function StickerSlot({ card }: { card: AlbumCard }) {
  if (card.copyCount <= 0) {
    return (
      <article className="relative aspect-[3/4] overflow-hidden rounded-[1.5rem] border border-dashed border-slate-300 bg-gradient-to-br from-slate-100 to-slate-200 p-3 text-slate-400 shadow-inner">
        <span className="absolute left-3 top-3 text-[10px] font-black">#{String(card.cardNumber).padStart(3, '0')}</span>
        <div className="grid h-full place-items-center text-center">
          <div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/80 shadow-sm"><Lock className="h-5 w-5" /></span><p className="mt-3 text-xs font-black">Figurinha bloqueada</p></div>
        </div>
      </article>
    );
  }

  return (
    <article className={`relative aspect-[3/4] overflow-hidden rounded-[1.5rem] border p-2 shadow-lg ${rarityStyle[card.rarity]}`}>
      <span className={`absolute left-2 top-2 z-10 rounded-full px-2 py-1 text-[9px] font-black backdrop-blur ${card.rarity === 'LEGENDARY' ? 'bg-white/15 text-white' : 'bg-white/75 text-slate-700'}`}>#{String(card.cardNumber).padStart(3, '0')}</span>
      {card.copyCount > 1 && <span className="absolute right-2 top-2 z-10 rounded-full bg-rose-600 px-2 py-1 text-[10px] font-black text-white shadow-md">x{card.copyCount}</span>}
      <CardArtwork card={card} />
      <div className={`absolute inset-x-2 bottom-2 rounded-xl px-2.5 py-2 backdrop-blur ${card.rarity === 'LEGENDARY' ? 'bg-black/45' : 'bg-white/80'}`}>
        <p className="truncate text-xs font-black">{card.name}</p>
        <p className={`mt-0.5 text-[8px] font-black uppercase tracking-[.14em] ${card.rarity === 'LEGENDARY' ? 'text-amber-300' : 'opacity-60'}`}>{rarityLabel[card.rarity]}</p>
      </div>
    </article>
  );
}

function CardArtwork({ card }: { card: Pick<AlbumCard, 'imageUrl' | 'name'> }) {
  const [failed, setFailed] = useState(false);
  if (card.imageUrl && !failed) {
    return <img src={card.imageUrl} alt={card.name} onError={() => setFailed(true)} loading="lazy" decoding="async" className="h-full w-full rounded-[1.1rem] object-cover" />;
  }
  return (
    <div className="grid h-full place-items-center rounded-[1.1rem] bg-white/15 p-4 text-center">
      <div><Sparkles className="mx-auto h-8 w-8 opacity-70" /><p className="mt-3 text-sm font-black leading-5">{card.name}</p></div>
    </div>
  );
}

function PackReveal({ result, onClose }: { result: OpenPackResponse; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem]">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-600">Pacote aberto</p><h2 className="mt-1 text-2xl font-black">Suas 5 cartas ✨</h2></div><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100" aria-label="Fechar"><X className="h-4 w-4" /></button></div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {result.cards.map((card, index) => (
            <article key={`${card.id}-${index}`} className={`relative aspect-[3/4] overflow-hidden rounded-[1.5rem] border p-2 shadow-lg ${rarityStyle[card.rarity]}`}>
              <span className="absolute left-2 top-2 z-10 rounded-full bg-white/80 px-2 py-1 text-[9px] font-black text-slate-700">#{String(card.cardNumber).padStart(3, '0')}</span>
              {card.imageUrl ? <img src={card.imageUrl} alt={card.name} className="h-full w-full rounded-[1.1rem] object-cover" loading="lazy" decoding="async" /> : <div className="grid h-full place-items-center rounded-[1.1rem] bg-white/15 p-3 text-center"><p className="text-sm font-black">{card.name}</p></div>}
              <div className={`absolute inset-x-2 bottom-2 rounded-xl px-2 py-2 backdrop-blur ${card.rarity === 'LEGENDARY' ? 'bg-black/45' : 'bg-white/80'}`}><p className="truncate text-xs font-black">{card.name}</p><p className="mt-0.5 text-[8px] font-black uppercase tracking-wider opacity-70">{rarityLabel[card.rarity]}</p></div>
            </article>
          ))}
        </div>
        <p className="mt-4 text-center text-xs font-bold text-slate-500">Restam {result.remaining} pacotinhos deste tipo.</p>
        <button type="button" onClick={onClose} className="mt-4 min-h-13 w-full rounded-2xl bg-[#073B8C] text-sm font-black text-white">Guardar no álbum</button>
      </div>
    </div>
  );
}
