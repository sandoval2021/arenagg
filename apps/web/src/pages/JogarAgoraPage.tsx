import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  Check,
  Clock3,
  Flame,
  Gamepad2,
  RefreshCw,
  ShieldCheck,
  Swords,
  Trophy,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { GlobalLoader } from '../components/brand/GlobalLoader';
import { ApiError } from '../lib/api';
import {
  challengePlayer,
  getActiveCasualRoom,
  getAvailablePlayers,
  getMatchmakingChallenges,
  getMyAvailability,
  leaveMatchmakingQueue,
  platformLabels,
  respondToChallenge,
  setMyAvailability,
  type CasualMatchMode,
  type MatchmakingPlatform,
  type MatchmakingPool,
} from '../lib/matchmaking-api';

const platformOptions: Array<{ value: MatchmakingPlatform; label: string }> = [
  { value: 'PS4', label: 'PS4' },
  { value: 'XBOX_ONE', label: 'Xbox One' },
  { value: 'PS5', label: 'PS5' },
  { value: 'XBOX_SERIES', label: 'Series' },
  { value: 'PC', label: 'PC' },
];

const poolOptions: Array<{ value: MatchmakingPool; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'LEGACY', label: 'PS4 / Xbox One' },
  { value: 'CURRENT', label: 'PS5 / Series / PC' },
];

export function JogarAgoraPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState<MatchmakingPlatform>('PS5');
  const [pool, setPool] = useState<MatchmakingPool>('ALL');
  const [mode, setMode] = useState<CasualMatchMode>('CASUAL');

  const availability = useQuery({
    queryKey: ['matchmaking', 'availability'],
    queryFn: getMyAvailability,
    staleTime: 5_000,
  });
  const players = useQuery({
    queryKey: ['matchmaking', 'players', pool],
    queryFn: () => getAvailablePlayers(pool),
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });
  const challenges = useQuery({
    queryKey: ['matchmaking', 'challenges'],
    queryFn: getMatchmakingChallenges,
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
    staleTime: 3_000,
  });
  const activeRoom = useQuery({
    queryKey: ['matchmaking', 'active-room'],
    queryFn: getActiveCasualRoom,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    staleTime: 4_000,
  });

  useEffect(() => {
    if (availability.data?.queue?.platform) setPlatform(availability.data.queue.platform);
  }, [availability.data?.queue?.platform]);

  const refreshAll = async () => {
    await Promise.all([players.refetch(), challenges.refetch(), availability.refetch(), activeRoom.refetch()]);
  };

  const setAvailable = useMutation({
    mutationFn: () => setMyAvailability(platform),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['matchmaking', 'availability'] }),
        queryClient.invalidateQueries({ queryKey: ['matchmaking', 'players'] }),
      ]);
    },
  });

  const leaveQueue = useMutation({
    mutationFn: leaveMatchmakingQueue,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['matchmaking', 'availability'] }),
        queryClient.invalidateQueries({ queryKey: ['matchmaking', 'players'] }),
        queryClient.invalidateQueries({ queryKey: ['matchmaking', 'challenges'] }),
      ]);
    },
  });

  const challenge = useMutation({
    mutationFn: (userId: string) => challengePlayer(userId, mode),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['matchmaking', 'challenges'] });
    },
  });

  const respond = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'ACCEPT' | 'DECLINE' }) => respondToChallenge(id, action),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['matchmaking', 'challenges'] }),
        queryClient.invalidateQueries({ queryKey: ['matchmaking', 'players'] }),
        queryClient.invalidateQueries({ queryKey: ['matchmaking', 'availability'] }),
        queryClient.invalidateQueries({ queryKey: ['matchmaking', 'active-room'] }),
      ]);
      if (result.roomId) navigate(`/play/rooms/${result.roomId}`);
    },
  });

  const queue = availability.data?.queue ?? null;
  const incoming = challenges.data?.incoming ?? [];
  const outgoing = challenges.data?.outgoing ?? null;
  const listedPlayers = players.data?.players ?? [];
  const availableMinutes = useMemo(() => queue ? minutesRemaining(queue.expiresAt) : 0, [queue]);

  return (
    <div className="min-h-dvh bg-white pb-28 text-slate-900">
      <main className="mx-auto max-w-lg px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.2em] text-orange-600"><Flame className="h-3.5 w-3.5 fill-orange-500" /> Matchmaking Global</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">Jogar Agora</h1>
            <p className="mt-1 text-xs font-semibold text-slate-500">Ache alguém online e comece uma partida sem criar Copa.</p>
          </div>
          <button type="button" onClick={() => void refreshAll()} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-[#073B8C] shadow-sm" aria-label="Atualizar jogadores"><RefreshCw className={`h-4 w-4 ${players.isFetching ? 'animate-spin' : ''}`} /></button>
        </header>

        {activeRoom.data?.room && (
          <button type="button" onClick={() => navigate(`/play/rooms/${activeRoom.data!.room!.id}`)} className="mt-3 flex w-full items-center gap-3 rounded-[1.6rem] border border-violet-200 bg-gradient-to-r from-violet-50 to-blue-50 p-4 text-left shadow-sm">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white"><Swords className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1"><span className="block text-[9px] font-black uppercase tracking-[.17em] text-violet-600">Partida em andamento</span><span className="mt-1 block truncate text-sm font-black">Sua sala está pronta · voltar ao confronto</span></span>
            <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black text-violet-700">ABRIR</span>
          </button>
        )}

        {incoming.map((item) => (
          <section key={item.id} className="mt-3 overflow-hidden rounded-[1.8rem] border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4 shadow-lg shadow-orange-100/50">
            <div className="flex items-center gap-3">
              <PlayerAvatar url={item.challenger.avatarUrl} name={item.challenger.name} size="lg" />
              <div className="min-w-0 flex-1"><p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[.16em] text-orange-600"><BellRing className="h-3.5 w-3.5" /> Você foi desafiado</p><h2 className="mt-1 truncate text-base font-black">{item.challenger.name}</h2><p className="mt-0.5 text-xs font-bold text-slate-500">{item.challenger.mmr} MMR · {platformLabels[item.challengerPlatform]}</p></div>
              <ModePill mode={item.mode} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button disabled={respond.isPending} onClick={() => respond.mutate({ id: item.id, action: 'DECLINE' })} className="min-h-12 rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-500 disabled:opacity-50"><X className="mr-1.5 inline h-4 w-4" />Agora não</button>
              <button disabled={respond.isPending} onClick={() => respond.mutate({ id: item.id, action: 'ACCEPT' })} className="min-h-12 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-xs font-black text-white shadow-md disabled:opacity-50"><Check className="mr-1.5 inline h-4 w-4" />Aceitar desafio</button>
            </div>
          </section>
        ))}

        <section className="mt-5 rounded-[2rem] border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-4 shadow-md shadow-blue-100/50">
          <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#073B8C] text-white"><Zap className="h-5 w-5 fill-white" /></span><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#073B8C]">Sua disponibilidade</p><h2 className="mt-1 text-lg font-black">{queue?.status === 'ACTIVE' ? `Online por mais ${availableMinutes} min` : queue?.status === 'IN_GAME' ? 'Você está em uma partida' : 'Estou disponível'}</h2></div></div>

          <p className="mt-4 text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Onde você vai jogar?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {platformOptions.map((item) => <button key={item.value} type="button" disabled={queue?.status === 'IN_GAME'} onClick={() => setPlatform(item.value)} className={`rounded-full border px-3 py-2 text-xs font-black transition ${platform === item.value ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-blue-100 bg-white text-slate-600'} disabled:opacity-40`}>{item.label}</button>)}
          </div>

          {queue?.status === 'ACTIVE' ? (
            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <button disabled={setAvailable.isPending} onClick={() => setAvailable.mutate()} className="min-h-13 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white shadow-md disabled:opacity-50"><Clock3 className="mr-2 inline h-4 w-4" />Renovar por 1 hora</button>
              <button disabled={leaveQueue.isPending} onClick={() => leaveQueue.mutate()} className="grid min-h-13 min-w-13 place-items-center rounded-2xl border border-red-200 bg-red-50 text-red-600 disabled:opacity-50" aria-label="Sair da fila"><X className="h-5 w-5" /></button>
            </div>
          ) : queue?.status !== 'IN_GAME' ? (
            <button disabled={setAvailable.isPending} onClick={() => setAvailable.mutate()} className="mt-4 min-h-14 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 text-sm font-black text-white shadow-md disabled:opacity-50">{setAvailable.isPending ? 'Entrando na fila…' : '🔥 Estou Disponível por 1 hora'}</button>
          ) : null}
          {(setAvailable.isError || leaveQueue.isError) && <p className="mt-3 rounded-xl bg-red-50 p-2 text-center text-xs font-bold text-red-700">Não foi possível atualizar sua disponibilidade.</p>}
        </section>

        <section className="mt-5">
          <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#073B8C]">Cross-play</p><h2 className="mt-1 text-lg font-black">Quem está disponível</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500">{listedPlayers.length}</span></div>
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {poolOptions.map((item) => <button key={item.value} type="button" onClick={() => setPool(item.value)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-black ${pool === item.value ? 'border-[#073B8C] bg-[#073B8C] text-white' : 'border-slate-200 bg-white text-slate-500'}`}>{item.label}</button>)}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-1.5">
            <button type="button" onClick={() => setMode('CASUAL')} className={`min-h-10 rounded-xl text-xs font-black ${mode === 'CASUAL' ? 'bg-white text-[#073B8C] shadow-sm' : 'text-slate-400'}`}><Gamepad2 className="mr-1.5 inline h-4 w-4" />Só diversão</button>
            <button type="button" onClick={() => setMode('RANKED')} className={`min-h-10 rounded-xl text-xs font-black ${mode === 'RANKED' ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400'}`}><Trophy className="mr-1.5 inline h-4 w-4" />Valendo MMR</button>
          </div>

          {outgoing && <div className="mt-3 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-amber-600"><Clock3 className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-wider text-amber-600">Desafio enviado</p><p className="truncate text-xs font-black text-slate-700">Aguardando {outgoing.challenged.name}</p></div></div>}
          {challenge.isError && <p className="mt-3 rounded-xl bg-red-50 p-2 text-center text-xs font-bold text-red-700">{challengeError(challenge.error)}</p>}

          {players.isLoading && <div className="mt-4"><GlobalLoader mode="section" label="Procurando jogadores online…" /></div>}
          {!players.isLoading && listedPlayers.length === 0 && (
            <div className="mt-4 rounded-[1.8rem] border border-dashed border-slate-200 bg-slate-50 p-6 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm"><UserRound className="h-6 w-6" /></span><h3 className="mt-3 text-sm font-black">Ninguém disponível neste filtro</h3><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Sua própria disponibilidade nunca aparece aqui. A lista remove automaticamente quem completou 1 hora.</p></div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {listedPlayers.map((player) => (
              <article key={player.queueId} className="rounded-[1.7rem] border border-slate-200 bg-white p-3.5 shadow-sm">
                <div className="flex items-center gap-3"><PlayerAvatar url={player.avatarUrl} name={player.displayName ?? player.name} /><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-black">{player.displayName ?? player.name}</h3><p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />{player.mmr} MMR</p></div><span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black text-[#073B8C]">{platformLabels[player.platform]}</span></div>
                <button disabled={!queue || queue.status !== 'ACTIVE' || Boolean(outgoing) || challenge.isPending} onClick={() => challenge.mutate(player.userId)} className="mt-3 min-h-11 w-full rounded-xl bg-[#073B8C] px-3 text-xs font-black text-white shadow-sm disabled:bg-slate-200 disabled:text-slate-400"><Swords className="mr-1.5 inline h-4 w-4" />Desafiar</button>
              </article>
            ))}
          </div>
        </section>
      </main>
      <BottomNavigation />
    </div>
  );
}

function PlayerAvatar({ url, name, size = 'md' }: { url: string | null; name: string; size?: 'md' | 'lg' }) {
  const classes = size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-11 w-11 rounded-xl';
  if (url) return <img src={url} alt="" className={`${classes} shrink-0 border border-slate-200 bg-white object-cover`} loading="lazy" referrerPolicy="no-referrer" />;
  return <span className={`${classes} grid shrink-0 place-items-center bg-blue-50 text-xs font-black text-[#073B8C]`}>{name.slice(0, 2).toUpperCase()}</span>;
}

function ModePill({ mode }: { mode: CasualMatchMode }) {
  return mode === 'RANKED'
    ? <span className="shrink-0 rounded-full bg-amber-400 px-2 py-1 text-[9px] font-black text-slate-950">MMR</span>
    : <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black text-[#073B8C]">FUN</span>;
}

function minutesRemaining(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));
}

function challengeError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível enviar o desafio.';
  if (error.code === 'YOU_ARE_NOT_AVAILABLE') return 'Ative “Estou Disponível” antes de desafiar.';
  if (error.code === 'PLAYER_NOT_AVAILABLE') return 'Esse jogador acabou de sair da fila.';
  if (error.code === 'CROSSPLAY_INCOMPATIBLE') return 'Essas plataformas não estão no mesmo grupo de cross-play.';
  if (error.code === 'CHALLENGE_ALREADY_PENDING') return 'Você já possui um desafio aguardando resposta.';
  return 'Não foi possível enviar o desafio.';
}
