import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  Copy,
  Gamepad2,
  Save,
  ShieldCheck,
  Swords,
  Trophy,
  X,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { GlobalLoader } from '../components/brand/GlobalLoader';
import {
  cancelCasualRoom,
  confirmCasualScore,
  getCasualRoom,
  platformLabels,
  rejectCasualScore,
  saveCasualRoomHandle,
  submitCasualScore,
  type CasualRoomPlayer,
} from '../lib/matchmaking-api';

export function CasualMatchRoomPage() {
  const { roomId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [handle, setHandle] = useState('');
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [copied, setCopied] = useState(false);

  const room = useQuery({
    queryKey: ['matchmaking', 'room', roomId],
    queryFn: () => getCasualRoom(roomId),
    enabled: Boolean(roomId),
    refetchInterval: (query) => {
      const status = query.state.data?.room.status;
      return status === 'FINISHED' || status === 'CANCELED' ? false : 5_000;
    },
    refetchIntervalInBackground: false,
    staleTime: 2_000,
  });

  const data = room.data?.room;
  const me = data ? (data.isChallenger ? data.challenger : data.challenged) : null;
  const opponent = data ? (data.isChallenger ? data.challenged : data.challenger) : null;

  useEffect(() => {
    if (me?.handle) setHandle(me.handle);
  }, [me?.handle]);

  const invalidateRoom = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['matchmaking', 'room', roomId] }),
      queryClient.invalidateQueries({ queryKey: ['matchmaking', 'active-room'] }),
      queryClient.invalidateQueries({ queryKey: ['matchmaking', 'availability'] }),
      queryClient.invalidateQueries({ queryKey: ['matchmaking', 'players'] }),
    ]);
  };

  const saveHandle = useMutation({
    mutationFn: () => saveCasualRoomHandle(roomId, handle),
    onSuccess: invalidateRoom,
  });
  const submitScore = useMutation({
    mutationFn: () => submitCasualScore(roomId, myScore, opponentScore),
    onSuccess: invalidateRoom,
  });
  const confirmScore = useMutation({
    mutationFn: () => confirmCasualScore(roomId),
    onSuccess: invalidateRoom,
  });
  const rejectScore = useMutation({
    mutationFn: () => rejectCasualScore(roomId),
    onSuccess: invalidateRoom,
  });
  const cancelRoom = useMutation({
    mutationFn: () => cancelCasualRoom(roomId),
    onSuccess: async () => {
      await invalidateRoom();
      navigate('/play');
    },
  });

  async function copyOpponentHandle() {
    if (!opponent?.handle) return;
    try {
      await navigator.clipboard.writeText(opponent.handle);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  if (room.isLoading) return <GlobalLoader mode="screen" label="Abrindo sala…" />;
  if (room.isError || !data || !me || !opponent) return <ErrorState onBack={() => navigate('/play')} />;

  const myStoredScore = data.isChallenger ? data.challenger.score : data.challenged.score;
  const opponentStoredScore = data.isChallenger ? data.challenged.score : data.challenger.score;
  const myDelta = data.isChallenger ? data.challenger.mmrDelta : data.challenged.mmrDelta;
  const opponentDelta = data.isChallenger ? data.challenged.mmrDelta : data.challenger.mmrDelta;
  const isClosed = data.status === 'FINISHED' || data.status === 'CANCELED';

  return (
    <div className="min-h-dvh bg-white pb-28 text-slate-900">
      <main className="mx-auto max-w-lg px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3 py-3">
          <button type="button" onClick={() => navigate('/play')} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#073B8C]">Match Room</p><h1 className="truncate text-xl font-black">Partida casual</h1></div>
          <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${data.mode === 'RANKED' ? 'bg-amber-400 text-slate-950' : 'bg-blue-50 text-[#073B8C]'}`}>{data.mode === 'RANKED' ? 'VALENDO MMR' : 'SÓ DIVERSÃO'}</span>
        </header>

        <section className="mt-4 overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-violet-50 p-4 shadow-lg shadow-blue-100/40">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <PlayerSide player={me} label="Você" />
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-950 text-white"><Swords className="h-5 w-5" /></span>
            <PlayerSide player={opponent} label="Adversário" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center"><InfoPill icon={Gamepad2} label={platformLabels[me.platform]} /><InfoPill icon={ShieldCheck} label={`${me.mmr} MMR`} /></div>
        </section>

        {data.status === 'CANCELED' && (
          <section className="mt-5 rounded-[1.8rem] border border-slate-200 bg-slate-50 p-5 text-center"><X className="mx-auto h-8 w-8 text-slate-400" /><h2 className="mt-2 text-lg font-black">Partida cancelada</h2><p className="mt-1 text-xs font-semibold text-slate-500">Nenhum MMR foi alterado.</p><button onClick={() => navigate('/play')} className="mt-4 min-h-12 w-full rounded-2xl bg-[#073B8C] text-sm font-black text-white">Voltar ao Jogar Agora</button></section>
        )}

        {data.status === 'FINISHED' && (
          <section className="mt-5 rounded-[1.8rem] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 text-center shadow-sm">
            <Check className="mx-auto h-8 w-8 text-emerald-600" /><p className="mt-2 text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">Resultado confirmado</p><div className="mt-3 flex items-center justify-center gap-4"><span className="text-4xl font-black">{myStoredScore ?? 0}</span><span className="text-xl font-black text-slate-300">×</span><span className="text-4xl font-black">{opponentStoredScore ?? 0}</span></div>
            {data.mode === 'RANKED' && <div className="mt-4 flex justify-center gap-2"><MmrDelta label="Seu MMR" value={myDelta} /><MmrDelta label={opponent.name} value={opponentDelta} /></div>}
            {data.mode === 'CASUAL' && <p className="mt-3 text-xs font-bold text-slate-500">Partida de diversão: o MMR não foi alterado.</p>}
            <button onClick={() => navigate('/play')} className="mt-5 min-h-12 w-full rounded-2xl bg-[#073B8C] text-sm font-black text-white">Procurar outro adversário</button>
          </section>
        )}

        {!isClosed && (
          <>
            <section className="mt-5 rounded-[1.8rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div><p className="text-[10px] font-black uppercase tracking-[.17em] text-[#073B8C]">EA ID / PSN ID / Gamertag</p><h2 className="mt-1 text-lg font-black">Troquem o ID de jogo</h2><p className="mt-1 text-xs font-semibold text-slate-500">Digite apenas o identificador que deseja compartilhar nesta partida.</p></div>
              <div className="mt-4 flex gap-2"><input value={handle} onChange={(event) => setHandle(event.target.value.slice(0, 40))} placeholder="Seu ID no jogo" className="min-h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-blue-400" /><button disabled={handle.trim().length < 2 || saveHandle.isPending} onClick={() => saveHandle.mutate()} className="grid min-h-12 min-w-12 place-items-center rounded-2xl bg-[#073B8C] text-white disabled:bg-slate-200"><Save className="h-4 w-4" /></button></div>
              <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-blue-500">ID do adversário</p>{opponent.handle ? <button type="button" onClick={copyOpponentHandle} className="mt-1 flex w-full items-center justify-between gap-3 text-left"><span className="truncate text-sm font-black text-[#073B8C]">{opponent.handle}</span><span className="flex shrink-0 items-center gap-1 text-[10px] font-black text-blue-500"><Copy className="h-3.5 w-3.5" />{copied ? 'Copiado' : 'Copiar'}</span></button> : <p className="mt-1 text-xs font-semibold text-slate-500">Aguardando {opponent.name} informar…</p>}</div>
              {saveHandle.isError && <p className="mt-2 text-center text-xs font-bold text-red-600">Não foi possível salvar seu ID.</p>}
            </section>

            {data.status === 'OPEN' && (
              <section className="mt-5 rounded-[1.8rem] border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[.17em] text-[#073B8C]">Fim de jogo</p><h2 className="mt-1 text-lg font-black">Reportar placar</h2><p className="mt-1 text-xs font-semibold text-slate-500">O adversário precisa confirmar antes do resultado valer.</p>
                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-3"><ScoreField label="Você" value={myScore} onChange={setMyScore} /><span className="pb-3 text-lg font-black text-slate-300">×</span><ScoreField label={opponent.name} value={opponentScore} onChange={setOpponentScore} /></div>
                <button disabled={submitScore.isPending} onClick={() => submitScore.mutate()} className="mt-4 min-h-13 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 text-sm font-black text-white shadow-md disabled:opacity-50">Enviar placar para confirmação</button>
                {submitScore.isError && <p className="mt-2 text-center text-xs font-bold text-red-600">Não foi possível enviar o placar.</p>}
              </section>
            )}

            {data.status === 'AWAITING_CONFIRMATION' && (
              <section className="mt-5 rounded-[1.8rem] border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[.17em] text-amber-700">Confirmação de resultado</p><div className="mt-3 flex items-center justify-center gap-4"><span className="text-3xl font-black">{myStoredScore ?? 0}</span><span className="font-black text-amber-300">×</span><span className="text-3xl font-black">{opponentStoredScore ?? 0}</span></div>
                {data.canConfirmScore ? <><p className="mt-3 text-center text-xs font-bold text-slate-600">{opponent.name} enviou este placar. Confirme somente se estiver correto.</p><div className="mt-4 grid grid-cols-2 gap-2"><button disabled={rejectScore.isPending || confirmScore.isPending} onClick={() => rejectScore.mutate()} className="min-h-12 rounded-2xl border border-red-200 bg-white text-xs font-black text-red-600">Corrigir placar</button><button disabled={confirmScore.isPending || rejectScore.isPending} onClick={() => confirmScore.mutate()} className="min-h-12 rounded-2xl bg-emerald-600 text-xs font-black text-white shadow-md"><Check className="mr-1 inline h-4 w-4" />Confirmar</button></div></> : <p className="mt-3 text-center text-xs font-bold text-amber-800">Aguardando {opponent.name} confirmar o placar.</p>}
                {(confirmScore.isError || rejectScore.isError) && <p className="mt-2 text-center text-xs font-bold text-red-600">Não foi possível atualizar a confirmação.</p>}
              </section>
            )}

            <button disabled={cancelRoom.isPending} onClick={() => cancelRoom.mutate()} className="mt-5 min-h-12 w-full rounded-2xl border border-red-200 bg-red-50 text-xs font-black text-red-600 disabled:opacity-50">Cancelar esta partida</button>
          </>
        )}
      </main>
      <BottomNavigation />
    </div>
  );
}

function PlayerSide({ player, label }: { player: CasualRoomPlayer; label: string }) {
  return <div className="min-w-0 text-center"><div className="mx-auto h-16 w-16 overflow-hidden rounded-[1.3rem] border border-slate-200 bg-white shadow-sm">{player.avatarUrl ? <img src={player.avatarUrl} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-lg font-black text-[#073B8C]">{player.name.slice(0, 2).toUpperCase()}</span>}</div><p className="mt-2 truncate text-sm font-black">{player.name}</p><p className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p></div>;
}

function InfoPill({ icon: Icon, label }: { icon: typeof Gamepad2; label: string }) {
  return <span className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-600"><Icon className="h-4 w-4 text-[#073B8C]" />{label}</span>;
}

function ScoreField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="text-center"><span className="block truncate text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span><input type="number" inputMode="numeric" min={0} max={99} value={value} onChange={(event) => onChange(Math.min(99, Math.max(0, Number(event.target.value) || 0)))} className="mt-2 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 text-center text-3xl font-black outline-none focus:border-blue-400" /></label>;
}

function MmrDelta({ label, value }: { label: string; value: number | null }) {
  const amount = value ?? 0;
  return <div className="rounded-2xl bg-white px-3 py-2 shadow-sm"><p className="max-w-28 truncate text-[8px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-1 text-sm font-black ${amount >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{amount >= 0 ? '+' : ''}{amount} MMR</p></div>;
}

function ErrorState({ onBack }: { onBack: () => void }) {
  return <main className="grid min-h-dvh place-items-center bg-white px-5 text-slate-900"><div className="max-w-sm text-center"><Swords className="mx-auto h-10 w-10 text-slate-300" /><h1 className="mt-3 text-xl font-black">Sala não encontrada</h1><p className="mt-2 text-sm font-semibold text-slate-500">A partida pode ter sido encerrada ou você não participa desta sala.</p><button onClick={onBack} className="mt-5 rounded-2xl bg-[#073B8C] px-5 py-3 text-sm font-black text-white">Voltar ao Jogar Agora</button></div></main>;
}
