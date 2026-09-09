import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ImagePlus, LoaderCircle, Save, Sparkles, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { BUILT_IN_AVATARS } from '../lib/default-icons';
import {
  CONSOLE_OPTIONS,
  getMyGamerProfile,
  updateMyGamerProfile,
  uploadMyAvatar,
  type ConsoleTag,
} from '../lib/social-api';

export function EditProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['gamer-profile', 'me'], queryFn: getMyGamerProfile });
  const [displayName, setDisplayName] = useState('');
  const [consoles, setConsoles] = useState<ConsoleTag[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!profile.data || hydrated) return;
    setDisplayName(profile.data.displayName ?? profile.data.name);
    setConsoles(profile.data.consoles ?? []);
    setAvatarUrl(profile.data.avatarUrl ?? '');
    setHydrated(true);
  }, [profile.data, hydrated]);

  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const save = useMutation({
    mutationFn: async () => {
      let finalAvatar = avatarUrl || null;
      if (file) {
        const uploaded = await uploadMyAvatar(file);
        finalAvatar = uploaded.avatarUrl;
      }
      return updateMyGamerProfile({
        displayName: displayName.trim(),
        consoles,
        avatarUrl: file ? undefined : finalAvatar,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['gamer-profile'] });
      navigate('/profile', { replace: true });
    },
  });

  function toggleConsole(value: ConsoleTag) {
    setConsoles((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  const visibleAvatar = preview || avatarUrl;

  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <main className="mx-auto max-w-lg px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3 py-3">
          <Link to="/profile" className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></Link>
          <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#073B8C]">Meu jogador</p><h1 className="text-xl font-black">Editar Perfil</h1></div>
        </header>

        <section className="mt-4 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-md shadow-slate-200/50">
          <div className="flex items-center gap-4">
            <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-[1.6rem] border border-blue-200 bg-blue-50 shadow-sm">
              {visibleAvatar ? <img src={visibleAvatar} alt="Preview do avatar" className="h-full w-full object-cover" /> : <UserRound className="h-10 w-10 text-[#073B8C]" />}
            </div>
            <div className="min-w-0 flex-1"><p className="text-sm font-black">Preview instantâneo</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Sua foto aparece aqui no celular antes do upload.</p></div>
          </div>

          <label className="mt-4 flex min-h-13 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-200 bg-blue-50 px-4 text-sm font-black text-[#073B8C]">
            <ImagePlus className="h-5 w-5" /><span className="truncate">{file ? file.name : 'Escolher foto da galeria'}</span>
            <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const selected = event.target.files?.[0] ?? null; setFile(selected); if (selected) setAvatarUrl(''); }} />
          </label>
          <p className="mt-2 text-[11px] font-medium text-slate-400">JPG/JPEG, PNG ou WEBP · máximo 5 MB.</p>

          <div className="mt-5 flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#073B8C]" /><p className="text-xs font-black uppercase tracking-wider text-slate-500">Ícones padrão</p></div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {BUILT_IN_AVATARS.map((avatar) => {
              const selected = !file && avatarUrl === avatar.url;
              return <button key={avatar.url} type="button" onClick={() => { setFile(null); setAvatarUrl(avatar.url); }} className={`relative aspect-square overflow-hidden rounded-2xl border bg-white p-2 shadow-sm ${selected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}><img src={avatar.url} alt={avatar.name} className="h-full w-full rounded-xl object-cover" />{selected && <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-white"><Check className="h-3.5 w-3.5" /></span>}</button>;
            })}
          </div>

          <label className="mt-6 block text-xs font-black uppercase tracking-wider text-slate-500">Nome de jogador</label>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-blue-400 focus:bg-white" placeholder="Seu nome no Chavea" />

          <p className="mt-6 text-xs font-black uppercase tracking-wider text-slate-500">Onde você joga?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {CONSOLE_OPTIONS.map((consoleName) => {
              const selected = consoles.includes(consoleName);
              return <button key={consoleName} type="button" onClick={() => toggleConsole(consoleName)} className={`min-h-10 rounded-full border px-4 text-xs font-black transition ${selected ? 'border-[#073B8C] bg-[#073B8C] text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600'}`}>{selected ? '✓ ' : ''}{consoleName}</button>;
            })}
          </div>

          {save.isError && <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">{profileError(save.error)}</p>}
          <button disabled={displayName.trim().length < 2 || save.isPending || profile.isLoading} onClick={() => save.mutate()} className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#073B8C] font-black text-white shadow-md disabled:opacity-40">{save.isPending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}{save.isPending ? 'Salvando…' : 'Salvar Perfil'}</button>
        </section>
      </main>
    </div>
  );
}

function profileError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível salvar seu perfil.';
  if (error.code === 'INVALID_PROFILE_INPUT') return 'Confira seu nome e as plataformas selecionadas.';
  if (error.code === 'IMAGE_REQUIRED') return 'O celular não entregou a imagem corretamente. Selecione a foto novamente.';
  if (error.code === 'IMAGE_TOO_LARGE') return 'A foto deve ter no máximo 5 MB.';
  if (error.code === 'INVALID_IMAGE') return 'Use uma imagem JPG/JPEG, PNG ou WEBP válida.';
  if (error.code === 'STORAGE_NOT_CONFIGURED') return 'O upload de imagens ainda não está configurado no servidor.';
  if (error.code === 'STORAGE_UPLOAD_FAILED') return 'A imagem não pôde ser gravada no Storage. O erro foi registrado no servidor.';
  if (error.code === 'NETWORK_ERROR') return 'Sem comunicação com o servidor. Tente novamente.';
  return 'Não foi possível salvar seu perfil. O erro foi registrado no servidor.';
}
