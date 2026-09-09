import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, Check, Link2, ShieldCheck, Trophy, UsersRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, createCompetition, type CompetitionFormat } from '../../lib/api';

type FormValues = {
  name: string;
  format: CompetitionFormat;
  requireValidation: boolean;
};

const formats = [
  { value: 'KNOCKOUT' as const, title: 'Mata-mata', description: 'Perdeu, está fora. Rápido e direto.', icon: Trophy },
  { value: 'GROUPS_KNOCKOUT' as const, title: 'Grupos', description: 'Fase de grupos para a resenha render mais.', icon: UsersRound },
  { value: 'LEAGUE' as const, title: 'Liga', description: 'Todos contra todos. Que vença o mais constante.', icon: ShieldCheck },
];

function createError(error: unknown): string {
  if (error instanceof ApiError && error.code === 'INVALID_INPUT') return 'Confira o nome e o formato do campeonato.';
  return 'Não foi possível criar a copa agora. Tente novamente.';
}

export function CreateCompetitionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { register, control, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: { format: 'KNOCKOUT', requireValidation: true },
  });
  const mutation = useMutation({
    mutationFn: (values: FormValues) => createCompetition({
      name: values.name,
      type: values.format,
      requireValidation: values.requireValidation,
      legFormat: 'SINGLE',
      matchPace: 'QUICK',
    }),
    onSuccess: async (competition) => {
      await queryClient.invalidateQueries({ queryKey: ['competitions', 'mine'] });
      navigate(`/competitions/${competition.id}`, { replace: true });
    },
  });
  const selectedFormat = watch('format');

  return (
    <div className="min-h-dvh bg-white text-black">
      <main className="mx-auto max-w-lg px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3 py-3">
          <Link to="/competitions" aria-label="Voltar" className="grid h-11 w-11 place-items-center rounded-2xl border border-black/5 shadow-sm"><ArrowLeft className="h-5 w-5" /></Link>
          <div><p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">Nova competição</p><h1 className="text-xl font-black">Criar Campeonato</h1></div>
        </header>

        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="mt-6 space-y-7">
          <section>
            <label className="text-sm font-black" htmlFor="competition-name">Nome da Copa</label>
            <input id="competition-name" {...register('name', { required: 'Informe o nome da competição', minLength: { value: 3, message: 'Use pelo menos 3 caracteres' }, maxLength: 80 })} placeholder="Ex.: Champions dos Amigos" className="mt-2 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 font-semibold outline-none focus:border-[#073B8C] focus:ring-4 focus:ring-blue-50" />
            {errors.name && <p className="mt-1 text-xs font-bold text-[#E31B23]">{errors.name.message}</p>}
          </section>

          <section>
            <p className="text-sm font-black">Formato</p>
            <Controller name="format" control={control} render={({ field }) => (
              <div className="mt-2 space-y-2">
                {formats.map(({ value, title, description, icon: Icon }) => {
                  const selected = selectedFormat === value;
                  return (
                    <button key={value} type="button" onClick={() => field.onChange(value)} className={`flex min-h-20 w-full items-center gap-3 rounded-2xl border p-4 text-left shadow-sm transition active:scale-[.99] ${selected ? 'border-[#073B8C] bg-blue-50/70 ring-1 ring-[#073B8C]' : 'border-zinc-200'}`}>
                      <span className={`grid h-11 w-11 place-items-center rounded-xl ${selected ? 'bg-[#073B8C] text-white' : 'bg-zinc-100'}`}><Icon className="h-5 w-5" /></span>
                      <span className="flex-1"><strong className="block text-sm font-black">{title}</strong><span className="text-xs font-medium text-zinc-500">{description}</span></span>
                      {selected && <Check className="h-5 w-5 text-[#073B8C]" />}
                    </button>
                  );
                })}
              </div>
            )} />
          </section>

          <section className="rounded-2xl border border-zinc-200 p-4 shadow-sm">
            <Controller name="requireValidation" control={control} render={({ field }) => (
              <div className="flex items-center gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#073B8C]"><Camera className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1"><p className="text-sm font-black">Exigir foto do placar</p><p className="mt-0.5 text-xs font-medium leading-5 text-zinc-500">Ajuda a evitar resultado errado e discussão no grupo. 📸</p></div>
                <button type="button" role="switch" aria-checked={field.value} onClick={() => field.onChange(!field.value)} className={`relative h-8 w-13 shrink-0 rounded-full p-1 transition ${field.value ? 'bg-[#073B8C]' : 'bg-zinc-300'}`}><span className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${field.value ? 'translate-x-5' : 'translate-x-0'}`} /></button>
              </div>
            )} />
          </section>

          <div className="flex gap-3 rounded-2xl bg-blue-50 p-4 text-sm font-semibold leading-6 text-[#073B8C]"><Link2 className="mt-0.5 h-5 w-5 shrink-0" /><p>Depois de criar, você recebe o botão <strong>Convidar Amigos</strong> para mandar a copa no grupo.</p></div>

          {mutation.isError && <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-[#E31B23]">{createError(mutation.error)}</p>}

          <button disabled={mutation.isPending} type="submit" className="min-h-14 w-full rounded-2xl bg-[#073B8C] px-5 font-black text-white shadow-md transition active:scale-[.98] disabled:opacity-60">{mutation.isPending ? 'Criando...' : 'Criar e convidar amigos'}</button>
        </form>
      </main>
    </div>
  );
}
