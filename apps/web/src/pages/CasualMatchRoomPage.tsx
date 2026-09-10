import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  Copy,
  Gamepad2,
  MessageCircle,
  Save,
  Send,
  ShieldCheck,
  Swords,
  X,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { BottomNavigation } from '../components/navigation/BottomNavigation';
import { GlobalLoader } from '../components/brand/GlobalLoader';
import { RankBadge } from '../components/profile/RankBadge';
import { ApiError } from '../lib/api';
import {
  cancelCasualRoom,
  confirmCasualScore,
  getCasualRoom,
  getCasualRoomChat,
  platformLabels,
  rejectCasualScore,
  saveCasualRoomHandle,
  sendCasualRoomChatMessage,
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
  const [chatBody, setChatBody] = useState('');

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
  const isClosed = data?.status === 'FINISHED' || data?.status === 'CANCELED';

  const chat = useQuery({
    queryKey: ['matchmaking', 'room-chat', roomId],
    queryFn: () => getCasualRoomChat(roomId),
    enabled: Boolean(roomId && data),
    refetchInterval: isClosed ? false : 4_000,
    refetchIntervalInBackground: false,
    staleTime: 1_500,
  });

  useEffect(() => {
    if (me?.handle) setHandle(me.handle);
  }, [me?.handle]);

  const invalidateRoom = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['matchmaking', 'room', roomId] }),
      queryClient.invalidateQueries({ queryKey: ['matchmaking', 'active-room'] }),
      queryClient.invalidateQueries({ queryKey: ['matchmaking', 'availability'] }),
      queryClient.invalidateQueries({ queryKey: ['matchmaking', 'players'] }),
      queryClient.invalidateQueries({ queryKey: ['global-friendly-feed'] }),
    ]);
  };

  const saveHandle = useMutation({ mutationFn: () => saveCasualRoomHandle(roomId, handle), onSuccess: invalidateRoom });
  const sendChat = useMutation({
    mutationFn: () => sendCasualRoomChatMessage(roomId, chatBody.trim()),
    onSuccess: async () => {
      setChatBody('');
      await queryClient.invalidateQueries({ queryKey: ['matchmaking', 'room-chat', roomId] });
    },
  });
  const submitScore = useMutation({ mutationFn: () => submitCasualScore(roomId, myScore, opponentScore), onSuccess: invalidateRoom });
  const confirmScore = useMutation({ mutationFn: () => confirmCasualScore(roomId), onSuccess: invalidateRoom });
  const rejectScore = useMutation({ mutationFn: () => rejectCasualScore(roomId), onSuccess: invalidateRoom });
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

  return (
    <div className="min-h-dvh bg-white pb-28 text-slate-900">
      <main className="mx-auto max-w-lg px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3 py-3">
          <button type="button" onClick={() => navigate('/play')} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#073B8C]">Match Room Casual</p><h1 className="truncate text-xl font-black">Amistoso</h1></div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[9px] font-black text-emerald-700">UNRANKED</span>
        </header>

        <div className="mt-2 flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-[11px] font-bold leading-4 text-emerald-800"><ShieldCheck className="h-4 w-4 shrink-0" />Este jogo entra no H2H e no Feed, mas nunca altera MMR, patente ou Ranking Global.</div>

        <section className="mt-4 overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-violet-50 p-4 shadow-lg shadow-blue-100/40">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <PlayerSide player={me} label="Você" />
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-950 text-white"><Swords className="h-5 w-5" /></span>
            <PlayerSide player={opponent} label="Adversário" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center"><InfoPill icon={Gamepad2} label={platformLabels[me.platform]} /><div className="flex min-h-10 items-center justify-center"><RankBadge mmr={me.mmr} compact /></div></div>
        </section>

        {!isClosed && (
          <section className="relative mt-5 overflow-hidden rounded-[2rem] border border-amber-300 bg-gradient-to-br from-amber-100 via-yellow-50 to-white p-5 shadow-xl shadow-amber-100/60">
            <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-amber-300/30 blur-3xl" />
            <p className="relative text-[10px] font-black uppercase tracking-[.2em] text-amber-700">Adicionar adversário · {platformLabels[opponent.platform]}</p>
            <h2 className="relative mt-1 text-lg font-black">Gamer Tag de {opponent.name}</h2>
            {opponent.handle ? (
              <button type="button" onClick={copyOpponentHandle} className="relative mt-4 flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-white px-4 text-left shadow-sm active:scale-[.99]">
                <span className="min-w-0"><span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">EA ID / PSN ID / Xbox ID</span><span className="mt-1 block truncate text-xl font-black text-slate-950">{opponent.handle}</span></span>
                <span className="flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white"><Copy className="h-4 w-4" />{copied ? 'Copiado' : 'Copiar ID'}</span>
              </button>
            ) : <p className="relative mt-4 rounded-2xl border border-amber-200 bg-white p-4 text-sm font-bold text-slate-500">Aguardando {opponent.name} informar a Gamer Tag…</p>}
          </section>
        )}

        {data.status === 'CANCELED' && (
          <section className="mt-5 rounded-[1.8rem] border border-slate-200 bg-slate-50 p-5 text-center"><X className="mx-auto h-8 w-8 text-slate-400" /><h2 className="mt-2 text-lg font-black">Amistoso cancelado</h2><p className="mt-1 text-xs font-semibold text-slate-500">Nada foi alterado no Ranking Global.</p><button onClick={() => navigate('/play')} className="mt-4 min-h-12 w-full rounded-2xl bg-[#073B8C] text-sm font-black text-white">Voltar ao Jogar Agora</button></section>
        )}

        {data.status === 'FINISHED' && (
          <section className="mt-5 rounded-[1.8rem] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 text-center shadow-sm">
            <Check className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="mt-2 text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">Amistoso confirmado</p>
            <div className="mt-3 flex items-center justify-center gap-4"><span className="text-4xl font-black">{myStoredScore ?? 0}</span><span className="text-xl font-black text-slate-300">×</span><span className="text-4xl font-black">{opponentStoredScore ?? 0}</span></div>
            <p className="mt-3 text-xs font-bold leading-5 text-slate-500">Resultado salvo no Histórico de Confrontos e no Feed Global. MMR protegido.</p>
            <button onClick={() => navigate('/play')} className="mt-5 min-h-12 w-full rounded-2xl bg-[#073B8C] text-sm font-black text-white">Procurar outro adversário</button>
          </section>
        )}

        {!isClosed && (
          <>
            <section className="mt-5 rounded-[1.8rem] border border-blue-100 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[.17em] text-[#073B8C]">Seu ID nesta sala</p>
              <div className="mt-3 flex gap-2"><input value={handle} onChange={(event) => setHandle(event.target.value.slice(0, 40))} placeholder="Sua EA ID / PSN ID / Xbox ID" className="min-h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-blue-400" /><button disabled={handle.trim().length < 2 || saveHandle.isPending} onClick={() => saveHandle.mutate()} className="grid min-h-12 min-w-12 place-items-center rounded-2xl bg-[#073B8C] text-white disabled:bg-slate-200" aria-label="Salvar Gamer Tag"><Save className="h-4 w-4" /></button></div>
              {saveHandle.isError && <p className="mt-2 text-xs font-bold text-red-600">Não foi possível salvar seu ID.</p>}
            </section>

            <section className="mt-5 rounded-[1.8rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-[#073B8C]" /><div><p className="text-[10px] font-black uppercase tracking-[.17em] text-[#073B8C]">Chat da sala</p><h2 className="text-base font-black">Combinar o amistoso</h2></div></div>
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-3">
                {chat.isLoading && <p className="py-4 text-center text-xs font-bold text-slate-400">Carregando conversa…</p>}
                {!chat.isLoading && (chat.data?.messages.length ?? 0) === 0 && <p className="py-4 text-center text-xs font-semibold text-slate-400">Ex.: “Já mandei o convite no PS5”.</p>}
                {chat.data?.messages.map((message) => {
                  const mine = message.userId === data.currentUserId;
                  return <div key={message.id} className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>{!mine && <MiniAvatar url={message.avatarUrl} name={message.name} />}<div className={`max-w-[78%] rounded-2xl px-3 py-2 ${mine ? 'bg-[#073B8C] text-white' : 'border border-slate-200 bg-white text-slate-800'}`}><p className={`text-[9px] font-black ${mine ? 'text-blue-100' : 'text-slate-400'}`}>{mine ? 'Você' : message.name}</p><p className="mt-0.5 break-words text-sm font-semibold leading-5">{message.body}</p></div></div>;
                })}
              </div>
              <div className="mt-3 flex gap-2"><input value={chatBody} onChange={(event) => setChatBody(event.target.value.slice(0, 280))} onKeyDown={(event) => { if (event.key === 'Enter' && chatBody.trim() && !sendChat.isPending) sendChat.mutate(); }} placeholder="Mensagem rápida…" className="min-h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-blue-400" /><button type="button" disabled={!chatBody.trim() || sendChat.isPending || chat.data?.canSend === false} onClick={() => sendChat.mutate()} className="grid min-h-12 min-w-12 place-items-center rounded-2xl bg-[#073B8C] text-white disabled:bg-slate-200" aria-label="Enviar mensagem"><Send className="h-4 w-4" /></button></div>
              {sendChat.isError && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{friendlyApiError(sendChat.error, 'Não foi possível enviar a mensagem.')}</p>}
              <p className="mt-2 text-[10px] font-semibold leading-4 text-slate-400">Por segurança, telefone, PIX, CPF, WhatsApp, Telegram e chaves externas são bloqueados.</p>
            </section>

            {data.status === 'OPEN' && (
              <section className="mt-5 rounded-[1.8rem] border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[.17em] text-[#073B8C]">Fim de jogo</p><h2 className="mt-1 text-lg font-black">Reportar placar</h2><p className="mt-1 text-xs font-semibold text-slate-500">O adversário precisa confirmar antes do amistoso entrar no H2H e no Feed.</p>
                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-3"><ScoreField label="Você" value={myScore} onChange={setMyScore} /><span className="pb-3 text-lg font-black text-slate-300">×</span><ScoreField label={opponent.name} value={opponentScore} onChange={setOpponentScore} /></div>
                <button disabled={submitScore.isPending} onClick={() => submitScore.mutate()} className="mt-4 min-h-13 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 text-sm font-black text-white shadow-md disabled:opacity-50">Enviar placar para confirmação</button>
                {submitScore.isError && <p className="mt-2 text-center text-xs font-bold text-red-600">Não foi possível enviar o placar.</p>}
              </section>
            )}

            {data.status === 'AWAITING_CONFIRMATION' && (
              <section className="mt-5 rounded-[1.8rem] border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[.17em] text-amber-700">Confirmação de resultado</p><div className="mt-3 flex items-center justify-center gap-4"><span className="text-3xl font-black">{myStoredScore ?? 0}</span><span className="font-black text-amber-300">×</span><span className="text-3xl font-black">{opponentStoredScore ?? 0}</span></div>
                {data.canConfirmScore ? <><p className="mt-3 text-center text-xs font-bold text-slate-600">{opponent.name} enviou este placar. Confirme somente se estiver correto.</p><div className="mt-4 grid grid-cols-2 gap-2"><button disabled={rejectScore.isPending || confirmScore.isPending} onClick={() => rejectScore.mutate()} className="min-h-12 rounded-2xl border border-red-200 bg-white text-xs font-black text-red-600">Corrigir placar</button><button disabled={confirmScore.isPending || rejectScore.isPending} onClick={() => confirmScore.mutate()} className="min-h-12 rounded-2xl bg-emerald-600 text-xs font-black text-white shadow-md"><Check className="mr-1 inline h-4 w-4" />Confirmar</button></div></> : <p className="mt-3 text-center text-xs font-bold text-amber-800">Aguardando {opponent.name} confirmar o placar.</p>}
              </section>
            )}

            <button disabled={cancelRoom.isPending} onClick={() => cancelRoom.mutate()} className="mt-5 min-h-12 w-full rounded-2xl border border-red-200 bg-red-50 text-xs font-black text-red-600 disabled:opacity-50">Cancelar este amistoso</button>
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

function MiniAvatar({ url, name }: { url: string | null; name: string }) {
  return url ? <img src={url} alt="" className="h-8 w-8 shrink-0 rounded-full border border-slate-200 object-cover" /> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-100 text-[10px] font-black text-[#073B8C]">{name.slice(0, 2).toUpperCase()}</span>;
}

function InfoPill({ icon: Icon, label }: { icon: typeof Gamepad2; label: string }) {
  return <span className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-600"><Icon className="h-4 w-4 text-[#073B8C]" />{label}</span>;
}

function ScoreField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="text-center"><span className="block truncate text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span><input type="number" inputMode="numeric" min={0} max={99} value={value} onChange={(event) => onChange(Math.min(99, Math.max(0, Number(event.target.value) || 0)))} className="mt-2 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 text-center text-3xl font-black outline-none focus:border-blue-400" /></label>;
}

function friendlyApiError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.details && typeof error.details === 'object' && 'message' in error.details && typeof error.details.message === 'string') return error.details.message;
  return fallback;
}

function ErrorState({ onBack }: { onBack: () => void }) {
  return <div className="grid min-h-dvh place-items-center bg-white p-6 text-center"><div><Swords className="mx-auto h-9 w-9 text-slate-300" /><h1 className="mt-3 text-xl font-black text-slate-900">Sala indisponível</h1><p className="mt-1 text-sm font-semibold text-slate-500">Esta Match Room não existe ou não pertence à sua conta.</p><button onClick={onBack} className="mt-5 min-h-12 rounded-2xl bg-[#073B8C] px-5 text-sm font-black text-white">Voltar ao Jogar Agora</button></div></div>;
}
