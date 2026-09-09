import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Film, Link2, Play, Plus, Sparkles } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { ApiError, getCompetition } from '../../lib/api';
import { addMatchClip, getCompetitionClips, type CompetitionClip } from '../../lib/phase-four-api';

export function CompetitionClipsPanel() {
  const { competitionId = '' } = useParams();
  const queryClient = useQueryClient();
  const [matchId, setMatchId] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const competition = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: () => getCompetition(competitionId),
    enabled: Boolean(competitionId),
  });
  const clips = useQuery({
    queryKey: ['competition-clips', competitionId],
    queryFn: () => getCompetitionClips(competitionId),
    enabled: Boolean(competitionId),
    staleTime: 5_000,
  });

  const eligibleMatches = useMemo(() => {
    const data = competition.data;
    if (!data) return [];
    const myTeamId = data.participations.find((item) => item.userId === data.currentUserId)?.team?.id;
    return data.matches.filter((match) => {
      if (match.status !== 'FINISHED') return false;
      if (data.isHost) return true;
      return Boolean(myTeamId && (match.homeTeam?.id === myTeamId || match.awayTeam?.id === myTeamId));
    });
  }, [competition.data]);

  const add = useMutation({
    mutationFn: ({ targetMatchId, clipUrl }: { targetMatchId: string; clipUrl: string }) => addMatchClip(targetMatchId, clipUrl),
    onSuccess: async () => {
      setUrl('');
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['competition-clips', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['competition-feed', competitionId] }),
      ]);
    },
    onError: (cause) => setError(clipError(cause)),
  });

  const data = competition.data;
  if (!data || !['IN_PROGRESS', 'FINISHED'].includes(data.status)) return null;
  if (eligibleMatches.length === 0 && (clips.data?.length ?? 0) === 0) return null;

  function submit() {
    const selected = matchId || eligibleMatches[0]?.id;
    const trimmed = url.trim();
    if (!selected) return setError('Escolha uma partida finalizada.');
    if (!/^https:\/\//i.test(trimmed)) return setError('Cole um link HTTPS do YouTube, Twitch, TikTok ou vídeo direto.');
    setError(null);
    add.mutate({ targetMatchId: selected, clipUrl: trimmed });
  }

  return (
    <section className="mx-auto mt-5 max-w-5xl px-4 sm:px-6">
      <div className="overflow-hidden rounded-[2rem] border border-violet-200 bg-white shadow-lg shadow-violet-100/50">
        <header className="relative overflow-hidden bg-gradient-to-r from-slate-950 via-violet-950 to-[#073B8C] p-5 text-white">
          <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-fuchsia-400/20 blur-3xl" />
          <div className="relative flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Film className="h-6 w-6 text-fuchsia-200" /></span>
            <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.2em] text-violet-200">Highlights da resenha</p><h2 className="mt-1 text-xl font-black">Mural de Clipes</h2><p className="mt-1 text-sm font-semibold text-slate-300">Golaços, defesas e lances que merecem replay.</p></div>
            <Sparkles className="h-5 w-5 text-amber-300" />
          </div>
        </header>

        {eligibleMatches.length > 0 && (
          <div className="border-b border-slate-100 bg-slate-50/70 p-4 sm:p-5">
            <p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">Adicionar highlight</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)_auto]">
              <select value={matchId || eligibleMatches[0]?.id || ''} onChange={(event) => setMatchId(event.target.value)} className="min-h-12 min-w-0 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-violet-400">
                {eligibleMatches.map((match) => <option key={match.id} value={match.id}>{matchLabel(match)}</option>)}
              </select>
              <label className="relative min-w-0"><Link2 className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={url} onChange={(event) => setUrl(event.target.value)} inputMode="url" placeholder="Link do Clipe / Golaço" className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-violet-400" /></label>
              <button type="button" disabled={add.isPending || !url.trim()} onClick={submit} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-violet-700 px-4 text-sm font-black text-white shadow-sm disabled:opacity-40"><Plus className="h-4 w-4" />{add.isPending ? 'Salvando…' : 'Adicionar'}</button>
            </div>
            {error && <p className="mt-2 rounded-xl bg-rose-50 p-2 text-xs font-bold text-rose-700">{error}</p>}
          </div>
        )}

        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          {clips.isLoading && <p className="text-sm font-semibold text-slate-400">Carregando os melhores lances…</p>}
          {!clips.isLoading && (clips.data?.length ?? 0) === 0 && <div className="sm:col-span-2 rounded-2xl border border-dashed border-violet-200 bg-violet-50/50 p-5 text-center"><Film className="mx-auto h-7 w-7 text-violet-400" /><p className="mt-2 text-sm font-black text-slate-700">Ainda não tem clipe nesta Copa.</p><p className="mt-1 text-xs font-semibold text-slate-400">Terminou um jogo bonito? Cole o link acima.</p></div>}
          {(clips.data ?? []).map((clip) => <ClipCard key={clip.id} clip={clip} />)}
        </div>
      </div>
    </section>
  );
}

function ClipCard({ clip }: { clip: CompetitionClip }) {
  const embed = youtubeEmbed(clip.url);
  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {embed ? <iframe src={embed} title="Highlight da partida" className="aspect-video w-full bg-slate-950" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /> : <a href={clip.url} target="_blank" rel="noopener noreferrer" className="grid aspect-video place-items-center bg-gradient-to-br from-slate-950 via-violet-950 to-[#073B8C] text-white"><span className="grid h-14 w-14 place-items-center rounded-full bg-white/15 ring-1 ring-white/20"><Play className="h-6 w-6 fill-current" /></span></a>}
      <div className="p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-violet-600">{clip.platform} · {clip.match.round?.name || `Rodada ${clip.match.round?.number ?? '-'}`}</p>
        <p className="mt-1 truncate text-sm font-black text-slate-950">{clip.match.homeTeam?.name ?? 'Mandante'} {clip.match.homeScore ?? '-'}×{clip.match.awayScore ?? '-'} {clip.match.awayTeam?.name ?? 'Visitante'}</p>
        <a href={clip.url} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 text-xs font-black text-violet-700"><Film className="h-4 w-4" />🎬 Ver Clipe <ExternalLink className="h-3.5 w-3.5" /></a>
      </div>
    </article>
  );
}

function youtubeEmbed(value: string): string | null {
  try {
    const url = new URL(value);
    let id = '';
    if (url.hostname === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] ?? '';
    else if (url.hostname.endsWith('youtube.com')) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') ?? '';
      else if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/')) id = url.pathname.split('/')[2] ?? '';
    }
    return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch { return null; }
}

function matchLabel(match: { homeTeam: { name: string } | null; awayTeam: { name: string } | null; homeScore: number | null; awayScore: number | null }): string {
  return `${match.homeTeam?.name ?? 'Mandante'} ${match.homeScore ?? '-'}×${match.awayScore ?? '-'} ${match.awayTeam?.name ?? 'Visitante'}`;
}

function clipError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível salvar o clipe.';
  if (error.code === 'INVALID_CLIP_URL') return 'Use um link HTTPS válido.';
  if (error.code === 'MATCH_NOT_FINISHED') return 'Só é possível anexar clipes depois que a partida terminar.';
  if (error.code === 'MATCH_CLIP_LIMIT_REACHED') return 'Esta partida já chegou ao limite de 5 clipes.';
  if (error.code === 'FORBIDDEN') return 'Você não pode adicionar clipes a esta partida.';
  return 'Não foi possível salvar o clipe.';
}
