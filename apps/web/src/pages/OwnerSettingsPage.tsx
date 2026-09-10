import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileSpreadsheet,
  ImagePlus,
  Settings2,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { GlobalLoader } from '../components/brand/GlobalLoader';
import { bulkImportCards, type CardBulkImportResult } from '../lib/admin-cards-api';
import { useAuth } from '../hooks/useAuth';
import {
  ApiError,
  deleteOwnerDefaultShield,
  getOwnerDefaultShields,
  PLATFORM_OWNER_EMAIL,
  updateOwnerDefaultShield,
  uploadOwnerDefaultShield,
} from '../lib/api';

export function OwnerSettingsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [cardImportResult, setCardImportResult] = useState<CardBulkImportResult | null>(null);
  const isAdmin = auth.user?.role === 'ADMIN' || auth.user?.email?.trim().toLowerCase() === PLATFORM_OWNER_EMAIL;

  const shields = useQuery({
    queryKey: ['owner', 'default-shields'],
    queryFn: getOwnerDefaultShields,
    enabled: isAdmin,
  });

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('IMAGE_REQUIRED');
      return uploadOwnerDefaultShield(name.trim(), file);
    },
    onSuccess: async () => {
      setName('');
      setFile(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owner', 'default-shields'] }),
        queryClient.invalidateQueries({ queryKey: ['default-shields'] }),
      ]);
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateOwnerDefaultShield(id, { isActive }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owner', 'default-shields'] }),
        queryClient.invalidateQueries({ queryKey: ['default-shields'] }),
      ]);
    },
  });

  const remove = useMutation({
    mutationFn: deleteOwnerDefaultShield,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owner', 'default-shields'] }),
        queryClient.invalidateQueries({ queryKey: ['default-shields'] }),
      ]);
    },
  });

  const cardImport = useMutation({
    mutationFn: () => {
      if (!csvFile) throw new Error('CSV_REQUIRED');
      return bulkImportCards(csvFile);
    },
    onSuccess: (result) => {
      setCardImportResult(result);
      setCsvFile(null);
    },
  });

  if (!isAdmin) {
    return (
      <main className="grid min-h-dvh place-items-center bg-white px-5 text-slate-900">
        <div className="max-w-sm text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-slate-300" />
          <h1 className="mt-4 text-xl font-black">Área administrativa</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">Esta configuração geral é exclusiva de administradores do Chavea.</p>
          <Link to="/profile" className="mt-5 inline-flex rounded-2xl bg-[#073B8C] px-5 py-3 font-black text-white">Voltar ao perfil</Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <header className="flex items-center gap-3 py-3">
          <Link to="/profile" className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-[#073B8C]">Admin Chavea</p>
            <h1 className="text-2xl font-black">Configuração Geral</h1>
          </div>
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-[#073B8C]"><Settings2 className="h-5 w-5" /></span>
        </header>

        <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-md shadow-slate-200/60">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[#073B8C]"><ImagePlus className="h-6 w-6" /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">Escudos padrão</p>
              <h2 className="mt-1 text-xl font-black">Adicionar à galeria</h2>
              <p className="mt-1 text-sm font-medium leading-6 text-slate-500">Envie JPG, PNG ou WEBP. Esses escudos aparecem para todos os jogadores escolherem com um toque.</p>
            </div>
          </div>

          <label className="mt-5 block text-xs font-black uppercase tracking-wider text-slate-500">Nome do escudo</label>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="Ex.: Azul Elite" className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-blue-400 focus:bg-white" />

          <label className="mt-4 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-200 bg-blue-50 px-4 text-sm font-black text-[#073B8C]">
            <ImagePlus className="h-5 w-5" />
            {file ? file.name : 'Escolher imagem da galeria'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>

          {upload.isError && <p className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">{ownerUploadError(upload.error)}</p>}

          <button type="button" disabled={!file || name.trim().length < 2 || upload.isPending} onClick={() => upload.mutate()} className="mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#073B8C] px-4 font-black text-white shadow-md disabled:opacity-40">
            {upload.isPending ? <GlobalLoader mode="inline" label="Enviando…" className="[&_*]:text-white" /> : <><ImagePlus className="h-5 w-5" />Adicionar escudo padrão</>}
          </button>
        </section>

        <section className="mt-5 rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-blue-50 p-5 shadow-md shadow-amber-100/40">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700"><FileSpreadsheet className="h-6 w-6" /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-amber-700">Cartas · Importação em massa</p>
              <h2 className="mt-1 text-xl font-black">Importar CSV</h2>
              <p className="mt-1 text-sm font-medium leading-6 text-slate-500">Envie até 5.000 cartas por arquivo. Duplicatas de número são ignoradas automaticamente.</p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white/85 p-3 text-[11px] font-bold leading-5 text-slate-500">
            <p className="font-black text-slate-700">Colunas obrigatórias</p>
            <p className="mt-1 break-words">cardNumber, name, rarity, boostType, boostValue, imageUrl</p>
            <p className="mt-1">Opcional: <span className="font-black">albumPage</span>. Sem ela, as cartas entram na página “Importadas”. imageUrl pode ficar vazia.</p>
          </div>

          <label className="mt-4 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-amber-300 bg-white px-4 text-sm font-black text-amber-800">
            <FileSpreadsheet className="h-5 w-5" />
            <span className="max-w-[75%] truncate">{csvFile ? csvFile.name : 'Escolher arquivo CSV'}</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { setCsvFile(event.target.files?.[0] ?? null); setCardImportResult(null); }} />
          </label>

          {cardImport.isError && <p className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">{cardImportError(cardImport.error)}</p>}
          {cardImportResult && <p className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">Importação concluída: {cardImportResult.imported} novas, {cardImportResult.skippedDuplicates} duplicadas ignoradas, {cardImportResult.processed} processadas.</p>}

          <button type="button" disabled={!csvFile || cardImport.isPending} onClick={() => cardImport.mutate()} className="mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 px-4 font-black text-amber-950 shadow-md disabled:opacity-40">
            {cardImport.isPending ? <GlobalLoader mode="inline" label="Importando…" /> : <><FileSpreadsheet className="h-5 w-5" />Importar CSV</>}
          </button>
          <p className="mt-3 text-center text-[11px] font-semibold text-slate-400">Artes podem ser enviadas no bucket público <span className="font-black">cards-assets</span> do Supabase e a URL pública colocada no CSV.</p>
        </section>

        <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">Galeria global</p><h2 className="mt-1 text-xl font-black">Escudos disponíveis</h2></div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{shields.data?.length ?? 0}</span>
          </div>

          {shields.isLoading && <div className="mt-5"><GlobalLoader mode="section" label="Carregando escudos…" /></div>}
          {shields.isError && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">Não foi possível carregar os escudos.</p>}
          {!shields.isLoading && !shields.isError && (shields.data?.length ?? 0) === 0 && <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm font-medium text-slate-500">Nenhum escudo padrão cadastrado ainda.</p>}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {shields.data?.map((shield) => (
              <article key={shield.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <img src={shield.url} alt="" className="h-14 w-14 rounded-2xl border border-slate-200 bg-white object-cover shadow-sm" loading="lazy" decoding="async" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">{shield.name}</p>
                  <p className={`mt-1 text-[11px] font-bold ${shield.isActive ? 'text-emerald-700' : 'text-slate-400'}`}>{shield.isActive ? 'Disponível para jogadores' : 'Oculto'}</p>
                </div>
                <button type="button" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: shield.id, isActive: !shield.isActive })} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-40" aria-label={shield.isActive ? 'Ocultar escudo' : 'Ativar escudo'}>
                  {toggle.isPending ? <GlobalLoader mode="inline" label="" /> : shield.isActive ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5" />}
                </button>
                <button type="button" disabled={remove.isPending} onClick={() => remove.mutate(shield.id)} className="grid h-10 w-10 place-items-center rounded-xl border border-red-100 bg-red-50 text-red-600 disabled:opacity-40" aria-label="Excluir escudo">
                  {remove.isPending ? <GlobalLoader mode="inline" label="" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function cardImportError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível importar o CSV.';
  const details = error.details as { message?: string } | undefined;
  return details?.message ?? (error.code === 'ADMIN_ONLY' ? 'Esta ação é exclusiva de administradores.' : 'Falha ao importar o CSV.');
}

function ownerUploadError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível enviar o escudo.';
  if (error.code === 'STORAGE_NOT_CONFIGURED') return 'O Supabase Storage ainda não está configurado no Worker.';
  if (error.code === 'IMAGE_TOO_LARGE') return 'A imagem deve ter no máximo 5 MB.';
  if (error.code === 'INVALID_IMAGE') return 'Use uma imagem JPG, PNG ou WEBP.';
  if (error.code === 'OWNER_ONLY') return 'Esta ação é exclusiva do proprietário.';
  return 'Falha ao enviar o escudo. Tente novamente.';
}