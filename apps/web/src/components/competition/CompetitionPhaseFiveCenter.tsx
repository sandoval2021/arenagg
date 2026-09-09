import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Camera, Check, Gavel, MessageCircleMore, Send, ShieldAlert, Trophy, XCircle } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { getPlayerRanks } from '../../lib/gamification-api';
import { getPhaseThreeCompetition, type PhaseThreeMatch } from '../../lib/phase-three-api';
import {
  approveMatchResult,
  contestMatchResult,
  getCompetitionChat,
  getMatchDispute,
  judgeMatchDispute,
  sendCompetitionChatMessage,
} from '../../lib/phase-five-api';
import { GlobalLoader } from '../brand/GlobalLoader';
import { RankBadge, RankEmblem } from '../profile/RankBadge';

type Tab = 'CHAT' | 'INTEGRITY';

export function CompetitionPhaseFiveCenter() {
  const { competitionId = '' } = useParams();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('CHAT');
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(null);

  const competition = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: () => getPhaseThreeCompetition(competitionId),
    enabled: Boolean(competitionId),
    staleTime: 5_000,
  });
  const data = competition.data;
  const userIds = useMemo(() => data?.participations.map((item) => item.userId) ?? [], [data?.participations]);
  const ranks = useQuery({
    queryKey: ['player-ranks', competitionId, userIds.join(',')],
    queryFn: () => getPlayerRanks(userIds),
    enabled: userIds.length > 0,
    staleTime: 30_000,
  });
  const rankByUser = useMemo(() => new Map((ranks.data ?? []).map((entry) => [entry.userId, entry])), [ranks.data]);

  if (!data) return null;
  const myTeamId = data.participations.find((item) => item.userId === data.currentUserId)?.team?.id;
  const awaiting = data.matches.filter((match) => match.status === 'AWAITING_APPROVAL');
  const disputed = data.matches.filter((match) => match.status === 'DISPUTED');

  async function invalidateCompetition() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['competition', competitionId] }),
      queryClient.invalidateQueries({ queryKey: ['standings', competitionId] }),
      queryClient.invalidateQueries({ queryKey: ['competition-feed', competitionId] }),
      queryClient.invalidateQueries({ queryKey: ['global-ranking'] }),
    ]);
  }

  return (
    <section className="mx-auto mt-5 max-w-5xl px-4 pb-4 sm:px-6">
      <div className="overflow-hidden rounded-[2rem] border border-blue-200 bg-white shadow-lg shadow-blue-100/50">
        <header className="bg-gradient-to-r from-[#073B8C] via-blue-700 to-cyan-600 p-5 text-white">
          <div className="flex items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/30"><Trophy className="h-6 w-6" /></span><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-100">Arena Social</p><h2 className="text-xl font-black">Patentes, Resenha e Integridade</h2></div></div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {data.participations.map((participant) => {
              const entry = rankByUser.get(participant.userId);
              const name = participant.user.displayName ?? participant.user.name;
              return <div key={participant.id} className="flex min-w-[148px] items-center gap-2 rounded-2xl bg-white/10 p-2 ring-1 ring-white/15"><div className="relative shrink-0"><PlayerAvatar src={participant.user.avatarUrl} name={name} /><span className="absolute -bottom-1 -right-1">{entry && <RankEmblem rank={entry.rank} compact />}</span></div><div className="min-w-0"><p className="truncate text-xs font-black">{name}</p><p className="mt-0.5 text-[9px] font-bold text-blue-100">{entry ? `${entry.rank.label} · ${entry.mmr}` : '1500 MMR'}</p></div></div>;
            })}
          </div>
        </header>

        <div className="grid grid-cols-2 gap-2 border-b border-slate-200 bg-slate-50 p-2">
          <button type="button" onClick={() => setTab('CHAT')} className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-black ${tab === 'CHAT' ? 'bg-[#073B8C] text-white shadow-md' : 'bg-white text-slate-600'}`}><MessageCircleMore className="h-4 w-4" />Resenha</button>
          <button type="button" onClick={() => setTab('INTEGRITY')} className={`relative flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-black ${tab === 'INTEGRITY' ? 'bg-slate-950 text-white shadow-md' : 'bg-white text-slate-600'}`}><ShieldAlert className="h-4 w-4" />Protestos{disputed.length > 0 && <span className="absolute right-3 top-2 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[9px] text-white">{disputed.length}</span>}</button>
        </div>

        {tab === 'CHAT' ? <ChatPanel competitionId={competitionId} currentUserId={data.currentUserId} rankByUser={rankByUser} /> : <IntegrityPanel competitionId={competitionId} awaiting={awaiting} disputed={disputed} myTeamId={myTeamId} isHost={data.isHost} selectedDisputeId={selectedDisputeId} setSelectedDisputeId={setSelectedDisputeId} onChanged={invalidateCompetition} />}
      </div>
    </section>
  );
}

function ChatPanel({ competitionId, currentUserId, rankByUser }: { competitionId: string; currentUserId: string; rankByUser: Map<string, Awaited<ReturnType<typeof getPlayerRanks>>[number]> }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const chat = useQuery({
    queryKey: ['competition-chat', competitionId],
    queryFn: () => getCompetitionChat(competitionId),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    staleTime: 2_000,
  });
  const send = useMutation({
    mutationFn: (body: string) => sendCompetitionChatMessage(competitionId, body),
    onSuccess: async () => {
      setText('');
      await queryClient.invalidateQueries({ queryKey: ['competition-chat', competitionId] });
    },
  });
  const messages = chat.data ?? [];

  return <div className="p-4 sm:p-5"><div className="max-h-[430px] space-y-2 overflow-y-auto rounded-3xl border border-slate-200 bg-slate-50 p-3">{chat.isLoading && <GlobalLoader mode="section" label="Abrindo a resenha…" />}{!chat.isLoading && messages.length === 0 && <div className="grid min-h-40 place-items-center text-center"><div><MessageCircleMore className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-sm font-bold text-slate-500">A resenha começa aqui. Mande a primeira mensagem!</p></div></div>}{messages.map((message) => { const mine = message.userId === currentUserId; const rank = rankByUser.get(message.userId); return <div key={message.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : ''}`}>{!mine && <PlayerAvatar src={message.avatarUrl} name={message.displayName ?? message.name} compact />}<div className={`max-w-[82%] rounded-2xl px-3 py-2 shadow-sm ${mine ? 'rounded-br-md bg-[#073B8C] text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-900'}`}><div className="flex items-center gap-1.5"><p className={`truncate text-[9px] font-black uppercase tracking-wide ${mine ? 'text-blue-100' : 'text-slate-400'}`}>{mine ? 'Você' : message.displayName ?? message.name}</p>{rank && <RankBadge mmr={rank.mmr} compact />}</div><p className="mt-0.5 whitespace-pre-wrap break-words text-sm font-semibold leading-5">{message.body}</p><p className={`mt-1 text-right text-[8px] font-bold ${mine ? 'text-blue-200' : 'text-slate-300'}`}>{new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p></div></div>; })}</div><form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); const body = text.trim(); if (body && !send.isPending) send.mutate(body); }}><input value={text} onChange={(event) => setText(event.target.value.slice(0, 500))} placeholder="Escreva na resenha…" className="min-h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-400" /><button disabled={!text.trim() || send.isPending} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#073B8C] text-white shadow-md disabled:opacity-40" aria-label="Enviar mensagem"><Send className="h-5 w-5" /></button></form>{send.isError && <p className="mt-2 text-center text-xs font-bold text-rose-600">{phaseFiveError(send.error)}</p>}<p className="mt-2 text-center text-[9px] font-semibold text-slate-400">Atualização automática a cada 5 segundos · até 500 caracteres</p></div>;
}

function IntegrityPanel({ competitionId, awaiting, disputed, myTeamId, isHost, selectedDisputeId, setSelectedDisputeId, onChanged }: { competitionId: string; awaiting: PhaseThreeMatch[]; disputed: PhaseThreeMatch[]; myTeamId?: string; isHost: boolean; selectedDisputeId: string | null; setSelectedDisputeId: (id: string | null) => void; onChanged: () => Promise<void> }) {
  const mineAwaiting = awaiting.filter((match) => myTeamId && (match.homeTeam?.id === myTeamId || match.awayTeam?.id === myTeamId));
  return <div className="space-y-4 p-4 sm:p-5"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900"><strong>Integridade competitiva:</strong> em Copas com premiação, o placar precisa de evidência. O adversário pode aprovar ou contestar; um protesto só é encerrado pelo Host.</div>{mineAwaiting.map((match) => <AwaitingReviewCard key={match.id} competitionId={competitionId} match={match} onChanged={onChanged} />)}{isHost && disputed.map((match) => <article key={match.id} className="rounded-3xl border border-rose-200 bg-rose-50 p-4"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-600 text-white"><Gavel className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-wider text-rose-600">Aguardando Host</p><h3 className="truncate text-sm font-black text-slate-950">{match.homeTeam?.name ?? 'Mandante'} × {match.awayTeam?.name ?? 'Visitante'}</h3></div><button type="button" onClick={() => setSelectedDisputeId(selectedDisputeId === match.id ? null : match.id)} className="rounded-xl bg-slate-950 px-3 py-2 text-[10px] font-black text-white">{selectedDisputeId === match.id ? 'Fechar' : 'Revisar'}</button></div>{selectedDisputeId === match.id && <HostJudgment matchId={match.id} onChanged={async () => { setSelectedDisputeId(null); await onChanged(); }} />}</article>)}{mineAwaiting.length === 0 && (!isHost || disputed.length === 0) && <div className="grid min-h-36 place-items-center rounded-3xl border border-slate-200 bg-slate-50 text-center"><div><Check className="mx-auto h-7 w-7 text-emerald-500" /><p className="mt-2 text-sm font-black text-slate-700">Tudo limpo por aqui.</p><p className="mt-1 text-xs font-semibold text-slate-400">Nenhum placar pendente ou protesto aberto.</p></div></div>}</div>;
}

function AwaitingReviewCard({ match, onChanged }: { competitionId: string; match: PhaseThreeMatch; onChanged: () => Promise<void> }) {
  const [contesting, setContesting] = useState(false);
  const [homeScore, setHomeScore] = useState(match.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(match.awayScore ?? 0);
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState<File | null>(null);
  const approve = useMutation({ mutationFn: () => approveMatchResult(match.id, match.version), onSuccess: onChanged });
  const dispute = useMutation({ mutationFn: () => { if (!evidence) throw new Error('EVIDENCE_REQUIRED'); return contestMatchResult(match.id, { version: match.version, homeScore, awayScore, reason, evidence }); }, onSuccess: async () => { setContesting(false); await onChanged(); } });
  return <article className="rounded-3xl border border-blue-200 bg-blue-50/60 p-4"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#073B8C]" /><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-wider text-[#073B8C]">Placar aguardando sua revisão</p><h3 className="mt-1 text-base font-black text-slate-950">{match.homeTeam?.name ?? 'Mandante'} <strong>{match.homeScore ?? '-'} × {match.awayScore ?? '-'}</strong> {match.awayTeam?.name ?? 'Visitante'}</h3></div></div>{!contesting ? <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={approve.isPending} onClick={() => approve.mutate()} className="min-h-11 rounded-2xl bg-emerald-600 px-2 text-xs font-black text-white"><Check className="mr-1 inline h-4 w-4" />Concordar</button><button type="button" onClick={() => setContesting(true)} className="min-h-11 rounded-2xl border border-rose-200 bg-white px-2 text-xs font-black text-rose-700"><AlertTriangle className="mr-1 inline h-4 w-4" />Contestar Adversário</button></div> : <div className="mt-4 rounded-2xl border border-rose-200 bg-white p-3"><p className="text-xs font-black text-rose-700">Informe o placar correto e envie a foto da TV/monitor.</p><div className="mt-3 grid grid-cols-2 gap-2"><ScoreField label="Mandante" value={homeScore} setValue={setHomeScore} /><ScoreField label="Visitante" value={awayScore} setValue={setAwayScore} /></div><textarea value={reason} onChange={(event) => setReason(event.target.value.slice(0, 500))} placeholder="Explique rapidamente o motivo (opcional)" className="mt-2 min-h-20 w-full resize-none rounded-xl border border-slate-200 p-3 text-xs font-semibold outline-none focus:border-rose-300" /><label className="mt-2 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-rose-300 bg-rose-50 text-xs font-black text-rose-700"><Camera className="h-4 w-4" />{evidence ? evidence.name : 'Anexar foto da prova'}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setEvidence(event.target.files?.[0] ?? null)} /></label><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setContesting(false)} className="min-h-11 rounded-xl bg-slate-100 text-xs font-black text-slate-600">Cancelar</button><button type="button" disabled={!evidence || dispute.isPending} onClick={() => dispute.mutate()} className="min-h-11 rounded-xl bg-rose-600 text-xs font-black text-white disabled:opacity-40">Abrir Protesto</button></div></div>}{(approve.isError || dispute.isError) && <p className="mt-2 text-center text-[11px] font-bold text-rose-600">{phaseFiveError(approve.isError ? approve.error : dispute.error)}</p>}</article>;
}

function HostJudgment({ matchId, onChanged }: { matchId: string; onChanged: () => Promise<void> }) {
  const [epicComeback, setEpicComeback] = useState(false);
  const dispute = useQuery({ queryKey: ['match-dispute', matchId], queryFn: () => getMatchDispute(matchId) });
  const judge = useMutation({ mutationFn: (decision: 'HOME' | 'AWAY' | 'CANCEL') => judgeMatchDispute(matchId, { decision, version: dispute.data!.version, epicComeback }), onSuccess: onChanged });
  if (dispute.isLoading) return <GlobalLoader mode="section" label="Carregando provas…" />;
  if (!dispute.data) return <p className="mt-3 text-xs font-bold text-rose-700">Não foi possível carregar o protesto.</p>;
  const data = dispute.data;
  return <div className="mt-4 border-t border-rose-200 pt-4"><div className="grid gap-3 sm:grid-cols-2"><EvidenceCard title="Placar enviado" score={`${data.original.homeScore ?? '-'} × ${data.original.awayScore ?? '-'}`} image={data.original.evidenceUrl} /><EvidenceCard title="Contestação" score={`${data.contest.homeScore ?? '-'} × ${data.contest.awayScore ?? '-'}`} image={data.contest.evidenceUrl} note={data.contest.reason} /></div><label className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900"><input type="checkbox" checked={epicComeback} onChange={(event) => setEpicComeback(event.target.checked)} />Confirmar “Virada Épica” para o vencedor desta decisão</label><div className="mt-3 grid gap-2 sm:grid-cols-3"><JudgeButton label={`A favor de ${data.home.name}`} onClick={() => judge.mutate('HOME')} disabled={judge.isPending} /><JudgeButton label={`A favor de ${data.away.name}`} onClick={() => judge.mutate('AWAY')} disabled={judge.isPending} /><button type="button" disabled={judge.isPending} onClick={() => { if (window.confirm('Cancelar esta partida? Ela não contará no ranking.')) judge.mutate('CANCEL'); }} className="min-h-11 rounded-xl border border-slate-300 bg-white px-2 text-xs font-black text-slate-700"><XCircle className="mr-1 inline h-4 w-4" />Cancelar Partida</button></div>{judge.isError && <p className="mt-2 text-center text-xs font-bold text-rose-700">{phaseFiveError(judge.error)}</p>}</div>;
}

function EvidenceCard({ title, score, image, note }: { title: string; score: string; image: string | null; note?: string | null }) { return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{title}</p><p className="mt-1 text-2xl font-black text-slate-950">{score}</p>{note && <p className="mt-1 text-xs font-semibold text-slate-500">{note}</p>}</div>{image ? <img src={image} alt={`Evidência: ${title}`} className="max-h-64 w-full border-t border-slate-100 object-contain" /> : <div className="grid min-h-24 place-items-center border-t border-slate-100 bg-slate-50 text-xs font-bold text-slate-400">Sem imagem</div>}</div>; }
function JudgeButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) { return <button type="button" disabled={disabled} onClick={() => { if (window.confirm(`Confirmar decisão: ${label}?`)) onClick(); }} className="min-h-11 rounded-xl bg-slate-950 px-2 text-xs font-black text-white disabled:opacity-50"><Gavel className="mr-1 inline h-4 w-4" />{label}</button>; }
function ScoreField({ label, value, setValue }: { label: string; value: number; setValue: (value: number) => void }) { return <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}<input type="number" min={0} max={99} inputMode="numeric" value={value} onChange={(event) => setValue(Math.min(99, Math.max(0, Number(event.target.value) || 0)))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 text-center text-lg font-black text-slate-950 outline-none focus:border-rose-300" /></label>; }
function PlayerAvatar({ src, name, compact = false }: { src: string | null; name: string; compact?: boolean }) { const size = compact ? 'h-8 w-8' : 'h-10 w-10'; return src ? <img src={src} alt="" className={`${size} rounded-xl border border-white/30 bg-white object-cover`} /> : <span className={`grid ${size} place-items-center rounded-xl bg-white/20 text-[10px] font-black`}>{name.slice(0, 2).toUpperCase()}</span>; }
function phaseFiveError(error: unknown): string { if (error instanceof ApiError) { if (error.code === 'CHAT_RATE_LIMIT') return 'Aguarde um instante antes de mandar outra mensagem.'; if (error.code === 'SELF_APPROVAL_FORBIDDEN') return 'Quem enviou o placar não pode homologar a própria prova.'; if (error.code === 'CANNOT_DISPUTE_OWN_SCORE') return 'Você não pode contestar o placar que você mesmo enviou.'; if (error.code === 'DISPUTE_REQUIRES_PRIZE') return 'Protestos formais ficam disponíveis em Copas com premiação.'; if (error.code === 'VERSION_CONFLICT') return 'A partida mudou em outra tela. Atualize e tente novamente.'; } if (error instanceof Error && error.message === 'EVIDENCE_REQUIRED') return 'Anexe a foto da prova.'; return 'Não foi possível concluir esta ação.'; }
