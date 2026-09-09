import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ImagePlus, LoaderCircle, Save, Shield, Sparkles } from 'lucide-react';
import {
  ApiError,
  getDefaultShields,
  updateMyCompetitionTeam,
  uploadMyCompetitionTeamLogo,
  type CompetitionDetail,
} from '../../lib/api';
import { BUILT_IN_TEAM_ICONS, TEAM_ICON_CATEGORIES } from '../../lib/default-icons';

type Participation = CompetitionDetail['participations'][number];

export function TeamConfiguratorLight({
  competitionId,
  participant,
}: {
  competitionId: string;
  participant: Participation;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [teamName, setTeamName] = useState(participant.teamName || participant.team?.name || 'Meu Time');
  const [selectedLogoUrl, setSelectedLogoUrl] = useState(participant.teamLogoUrl ?? participant.team?.logoUrl ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string>('');

  useEffect(() => {
    if (!file) {
      setFilePreview('');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setFilePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const shields = useQuery({
    queryKey: ['default-shields'],
    queryFn: getDefaultShields,
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const builtInGroups = useMemo(() => TEAM_ICON_CATEGORIES.map((category) => ({
    category,
    icons: BUILT_IN_TEAM_ICONS.filter((icon) => icon.category === category),
  })), []);

  const visibleLogo = filePreview || selectedLogoUrl || participant.teamLogoUrl || participant.team?.logoUrl || '';

  const save = useMutation({
    mutationFn: async () => {
      if (file) {
        const uploaded = await uploadMyCompetitionTeamLogo(competitionId, file);
        await updateMyCompetitionTeam(competitionId, { teamName });
        return { teamName, teamLogoUrl: uploaded.teamLogoUrl };
      }
      return updateMyCompetitionTeam(competitionId, {
        teamName,
        teamLogoUrl: selectedLogoUrl || null,
      });
    },
    onSuccess: async (result) => {
      setSelectedLogoUrl(result.teamLogoUrl ?? '');
      setFile(null);
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['competition', competitionId] }),
        queryClient.invalidateQueries({ queryKey: ['standings', competitionId] }),
      ]);
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 font-black text-[#073B8C] shadow-sm transition active:scale-[.99]"
      >
        <Shield className="h-5 w-5" />Configurar meu Time
      </button>
    );
  }

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-md shadow-slate-200/60">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-[#073B8C]"><Shield className="h-6 w-6" /></span>
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">Meu time</p>
          <h2 className="text-lg font-black text-slate-900">Personalização</h2>
        </div>
      </div>

      <label className="mt-5 block text-xs font-black uppercase tracking-wider text-slate-500">Nome do Time</label>
      <input
        value={teamName}
        onChange={(event) => setTeamName(event.target.value)}
        maxLength={60}
        className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-900 outline-none focus:border-blue-400 focus:bg-white"
        placeholder="Ex.: Arsenal do San"
      />

      <p className="mt-5 text-xs font-black uppercase tracking-wider text-slate-500">Escudo do time</p>
      <div className="mt-2 flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {visibleLogo ? <img src={visibleLogo} alt="Preview do escudo" className="h-full w-full object-cover" /> : <Shield className="h-8 w-8 text-slate-300" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-slate-800">Preview instantâneo</p>
          <p className="mt-1 text-[11px] font-medium leading-4 text-slate-500">A imagem aparece aqui antes de qualquer envio ao servidor.</p>
        </div>
      </div>

      <label className="mt-3 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-200 bg-blue-50 px-4 text-sm font-black text-[#073B8C]">
        <ImagePlus className="h-5 w-5" />
        <span className="truncate">{file ? file.name : 'Enviar foto da galeria'}</span>
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            if (selected) setSelectedLogoUrl('');
          }}
        />
      </label>
      <p className="mt-2 text-[11px] font-medium text-slate-400">JPG/JPEG, PNG ou WEBP · máximo 5 MB · compatível com fotos do iPhone.</p>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#073B8C]" />
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">Ícones padrão</p>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-[#073B8C]">36 opções</span>
      </div>
      <p className="mt-1 text-[11px] font-medium text-slate-400">Escolha um escudo leve em vetor. A galeria é rolável no celular.</p>

      <div className="mt-3 max-h-[26rem] space-y-4 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-slate-50/70 p-3 pr-2 [-webkit-overflow-scrolling:touch]">
        {builtInGroups.map((group) => (
          <section key={group.category}>
            <div className="sticky top-0 z-10 -mx-1 mb-2 rounded-xl bg-white/95 px-2 py-2 shadow-sm backdrop-blur">
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-500">{group.category}</p>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {group.icons.map((shield) => {
                const selected = !file && selectedLogoUrl === shield.url;
                return (
                  <button
                    key={shield.url}
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setSelectedLogoUrl(shield.url);
                    }}
                    className={`relative aspect-square overflow-hidden rounded-2xl border bg-white p-1.5 shadow-sm transition active:scale-95 ${selected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}
                    aria-label={`Usar escudo ${shield.name}`}
                    title={shield.name}
                  >
                    <img src={shield.url} alt="" className="h-full w-full rounded-xl object-cover" />
                    {selected && <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-white"><Check className="h-3 w-3" /></span>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {(shields.data?.length ?? 0) > 0 && (
        <section className="mt-4">
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-500">Escudos publicados</p>
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {shields.data?.map((shield) => {
              const selected = !file && selectedLogoUrl === shield.url;
              return (
                <button
                  key={shield.id}
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setSelectedLogoUrl(shield.url);
                  }}
                  className={`relative aspect-square overflow-hidden rounded-2xl border bg-white p-1.5 shadow-sm transition ${selected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}
                  aria-label={`Usar escudo ${shield.name}`}
                  title={shield.name}
                >
                  <img src={shield.url} alt="" className="h-full w-full rounded-xl object-cover" />
                  {selected && <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-white"><Check className="h-3 w-3" /></span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {shields.isLoading && <div className="mt-3 h-12 animate-pulse rounded-2xl bg-slate-100" />}
      {shields.isError && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-700">A galeria online não carregou, mas as 36 opções padrão continuam disponíveis.</p>}

      {save.isError && (
        <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">{teamSaveError(save.error)}</p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { setFile(null); setOpen(false); }} className="min-h-12 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-600">Cancelar</button>
        <button
          type="button"
          disabled={teamName.trim().length < 2 || save.isPending}
          onClick={() => save.mutate()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#073B8C] text-sm font-black text-white shadow-md disabled:opacity-40"
        >
          {save.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {save.isPending ? 'Salvando…' : 'Salvar Time'}
        </button>
      </div>
    </section>
  );
}

function teamSaveError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível salvar seu time.';
  switch (error.code) {
    case 'INVALID_TEAM_INPUT':
      return 'Confira o nome do time e o escudo selecionado.';
    case 'TEAM_NAME_TAKEN':
      return 'Esse nome de time já está sendo usado nesta Copa.';
    case 'TEAM_CONFIGURATION_LOCKED':
      return 'A Copa já começou e a configuração do time foi bloqueada.';
    case 'TEAM_CONFIGURATION_NOT_ALLOWED':
      return 'Esta Copa usa sorteio de times e não permite personalização manual.';
    case 'NOT_A_PARTICIPANT':
      return 'Sua participação nesta Copa não foi encontrada.';
    case 'IMAGE_REQUIRED':
      return 'O celular não entregou a imagem corretamente. Selecione a foto novamente.';
    case 'IMAGE_TOO_LARGE':
      return 'O escudo deve ter no máximo 5 MB.';
    case 'INVALID_IMAGE':
      return 'O conteúdo do arquivo não é uma imagem JPG/JPEG, PNG ou WEBP válida.';
    case 'STORAGE_NOT_CONFIGURED':
      return 'O upload de escudos ainda não está configurado no servidor.';
    case 'STORAGE_UPLOAD_FAILED':
    case 'TEAM_LOGO_UPLOAD_FAILED':
      return 'Falha ao gravar o escudo no Storage. O servidor registrou um código de diagnóstico.';
    case 'TEAM_DATABASE_ERROR':
      return 'O banco recusou a alteração do time. O erro foi registrado para diagnóstico.';
    case 'NETWORK_ERROR':
      return 'Sem comunicação com o servidor. Verifique sua conexão e tente novamente.';
    default:
      return 'Não foi possível salvar seu time. O erro foi registrado no servidor.';
  }
}
