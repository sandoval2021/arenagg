import { Controller, useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Camera, Check, ShieldCheck, Trophy, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';

type Format = 'KNOCKOUT' | 'GROUPS_KNOCKOUT' | 'LEAGUE';
type FormValues = { name: string; format: Format; requireValidation: boolean; logo?: FileList };

const formats = [
  { value: 'KNOCKOUT' as const, title: 'Mata-mata', description: 'Perdeu, está fora.', icon: Trophy },
  { value: 'GROUPS_KNOCKOUT' as const, title: 'Grupos', description: 'Fase de grupos e eliminatórias.', icon: UsersRound },
  { value: 'LEAGUE' as const, title: 'Liga', description: 'Todos contra todos.', icon: ShieldCheck },
];

async function mockCreateCompetition(values: FormValues) { await new Promise((r) => setTimeout(r, 450)); return values; }

export function CreateCompetitionPage() {
  const { register, control, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({ defaultValues: { format: 'KNOCKOUT', requireValidation: false } });
  const mutation = useMutation({ mutationFn: mockCreateCompetition });
  const selectedFormat = watch('format');

  return (
    <div className="min-h-dvh bg-white text-black">
      <main className="mx-auto max-w-lg px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3 py-3"><Link to="/" aria-label="Voltar" className="grid h-11 w-11 place-items-center rounded-2xl border border-black/5 shadow-sm"><ArrowLeft className="h-5 w-5" /></Link><div><p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">Nova competição</p><h1 className="text-xl font-black">Criar Campeonato</h1></div></header>

        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="mt-6 space-y-7">
          <section><label className="text-sm font-black" htmlFor="competition-name">Nome da Copa</label><input id="competition-name" {...register('name', { required: 'Informe o nome da competição', maxLength: 80 })} placeholder="Ex.: Champions dos Amigos" className="mt-2 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 font-semibold outline-none focus:border-[#073B8C] focus:ring-4 focus:ring-blue-50" />{errors.name && <p className="mt-1 text-xs font-bold text-[#E31B23]">{errors.name.message}</p>}</section>

          <section><p className="text-sm font-black">Formato</p><Controller name="format" control={control} render={({ field }) => <div className="mt-2 space-y-2">{formats.map(({ value, title, description, icon: Icon }) => { const selected = selectedFormat === value; return <button key={value} type="button" onClick={() => field.onChange(value)} className={`flex min-h-20 w-full items-center gap-3 rounded-2xl border p-4 text-left shadow-sm transition active:scale-[.99] ${selected ? 'border-[#073B8C] bg-blue-50/70 ring-1 ring-[#073B8C]' : 'border-zinc-200'}`}><span className={`grid h-11 w-11 place-items-center rounded-xl ${selected ? 'bg-[#073B8C] text-white' : 'bg-zinc-100'}`}><Icon className="h-5 w-5" /></span><span className="flex-1"><strong className="block text-sm font-black">{title}</strong><span className="text-xs font-medium text-zinc-500">{description}</span></span>{selected && <Check className="h-5 w-5 text-[#073B8C]" />}</button>; })}</div>} /></section>

          <section className="rounded-2xl border border-zinc-200 p-4 shadow-sm"><Controller name="requireValidation" control={control} render={({ field }) => <div className="flex items-center gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#073B8C]"><Camera className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-sm font-black">Exigir foto do placar</p><p className="mt-0.5 text-xs font-medium leading-5 text-zinc-500">O adversário deverá validar o resultado antes da classificação.</p></div><button type="button" role="switch" aria-checked={field.value} onClick={() => field.onChange(!field.value)} className={`relative h-8 w-13 shrink-0 rounded-full p-1 transition ${field.value ? 'bg-[#073B8C]' : 'bg-zinc-300'}`}><span className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${field.value ? 'translate-x-5' : 'translate-x-0'}`} /></button></div>} /></section>

          <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 text-sm font-black"><Camera className="h-5 w-5 text-[#073B8C]" />Adicionar logo<input {...register('logo')} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" /></label>

          <button disabled={mutation.isPending} type="submit" className="min-h-14 w-full rounded-2xl bg-[#073B8C] px-5 font-black text-white shadow-md transition active:scale-[.98] disabled:opacity-60">{mutation.isPending ? 'Criando...' : 'Continuar configuração'}</button>
        </form>
      </main>
    </div>
  );
}
