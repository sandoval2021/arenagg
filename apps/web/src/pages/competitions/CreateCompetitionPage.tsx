import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Camera,
  Check,
  Dices,
  Gamepad2,
  Link2,
  Repeat2,
  ShieldCheck,
  Trophy,
  UsersRound,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, createCompetition, type CompetitionFormat, type TeamSelection } from '../../lib/api';

type FormValues = {
  name: string;
  game: string;
  platform: string;
  format: CompetitionFormat;
  requireValidation: boolean;
  isHomeAndAway: boolean;
  teamSelection: TeamSelection;
  maxParticipants: number;
};

const games = ['EA FC 25', 'eFootball', 'Call of Duty', 'Outros'];
const platforms = ['PS5', 'PS4', 'Xbox', 'PC', 'Mobile'];

const formats = [
  { value: 'KNOCKOUT' as const, title: 'Mata-mata', description: 'Perdeu, está fora. Rápido e direto.', icon: Trophy },
  { value: 'GROUPS_KNOCKOUT' as const, title: 'Grupos', description: 'Fase de grupos para a resenha render mais.', icon: UsersRound },
  { value: 'LEAGUE' as const, title: 'Liga', description: 'Todos contra todos. Que vença o mais constante.', icon: ShieldCheck },
];

const teamSelectionOptions = [
  {
    value: 'FREE' as const,
    title: 'Livre',
    description: 'Cada jogador escolhe e personaliza o próprio time.',
    icon: Gamepad2,
  },
  {
    value: 'RANDOM' as const,
    title: 'Sorteio Cego',
    description: 'O sistema define os times quando o sorteio for iniciado.',
    icon: Dices,
  },
];

function createError(error: unknown): string {
  if (error instanceof ApiError && error.code === 'INVALID_INPUT') return 'Confira o nome, jogo, plataforma, limite de jogadores, formato e regras do campeonato.';
  return 'Não foi possível criar a copa agora. Tente novamente.';
}

export function CreateCompetitionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { register, control, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      game: 'EA FC 25',
      platform: 'PS5',
      format: 'KNOCKOUT',
      requireValidation: true,
      isHomeAndAway: false,
      teamSelection: 'FREE',
      maxParticipants: 20,
    },
  });
  const mutation = useMutation({
    mutationFn: (values: FormValues) => createCompetition({
      name: values.name,
      game: values.game,
      platform: values.platform,
      type: values.format,
      requireValidation: values.requireValidation,
      isHomeAndAway: values.isHomeAndAway,
      teamSelection: values.teamSelection,
      maxParticipants: values.maxParticipants,
      matchPace: 'QUICK',
    }),
    onSuccess: async (competition) => {
      await queryClient.invalidateQueries({ queryKey: ['competitions', 'mine'] });
      navigate(`/competitions/${competition.id}`, { replace: true });
    },
  });
  const selectedFormat = watch('format');
  const selectedTeamSelection = watch('teamSelection');
  const maxParticipants = watch('maxParticipants');

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

          <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-white shadow-sm"><Gamepad2 className="h-5 w-5" /></span>
              <div><p className="text-sm font-black">Jogo e Plataforma</p><p className="text-xs font-medium text-slate-500">Essas tags aparecem nos cards da competição.</p></div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-black uppercase tracking-wider text-slate-500">
                Jogo
                <select {...register('game', { required: true })} className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none focus:border-[#073B8C] focus:ring-4 focus:ring-blue-50">
                  {games.map((game) => <option key={game} value={game}>{game}</option>)}
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-slate-500">
                Plataforma
                <select {...register('platform', { required: true })} className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none focus:border-[#073B8C] focus:ring-4 focus:ring-blue-50">
                  {platforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
                </select>
              </label>
            </div>
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

          <section className="rounded-3xl border border-zinc-200 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><UsersRound className="h-5 w-5" /></span>
                <div><p className="text-sm font-black">Máximo de Jogadores</p><p className="text-xs font-medium text-zinc-500">De 2 a 20 participantes.</p></div>
              </div>
              <span className="grid min-w-12 place-items-center rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white">{maxParticipants}</span>
            </div>
            <Controller name="maxParticipants" control={control} rules={{ min: 2, max: 20 }} render={({ field }) => (
              <div className="mt-4 grid grid-cols-[1fr_72px] items-center gap-3">
                <input aria-label="Máximo de jogadores" type="range" min={2} max={20} step={1} value={field.value} onChange={(event) => field.onChange(Number(event.target.value))} className="w-full accent-[#073B8C]" />
                <input type="number" inputMode="numeric" min={2} max={20} value={field.value} onChange={(event) => { const value = Number(event.target.value); field.onChange(Number.isFinite(value) ? Math.min(20, Math.max(2, value)) : 2); }} className="h-11 rounded-xl border border-zinc-200 text-center text-sm font-black outline-none focus:border-[#073B8C]" />
              </div>
            )} />
          </section>

          <section>
            <div className="mb-3">
              <p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">Regras da Competição</p>
              <h2 className="mt-1 text-lg font-black">Como os jogos vão funcionar?</h2>
            </div>

            <div className="space-y-3">
              <Controller name="isHomeAndAway" control={control} render={({ field }) => (
                <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 p-4 shadow-sm">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><Repeat2 className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1"><p className="text-sm font-black">Jogos de Ida e Volta</p><p className="mt-0.5 text-xs font-medium leading-5 text-zinc-500">Cada confronto terá duas partidas.</p></div>
                  <button type="button" role="switch" aria-label="Ativar jogos de ida e volta" aria-checked={field.value} onClick={() => field.onChange(!field.value)} className={`relative h-8 w-13 shrink-0 rounded-full p-1 transition ${field.value ? 'bg-[#073B8C]' : 'bg-zinc-300'}`}><span className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${field.value ? 'translate-x-5' : 'translate-x-0'}`} /></button>
                </div>
              )} />

              <div className="rounded-2xl border border-zinc-200 p-4 shadow-sm">
                <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-700"><Dices className="h-5 w-5" /></div><div><p className="text-sm font-black">Sorteio de Times</p><p className="text-xs font-medium text-zinc-500">Escolha como os times serão definidos.</p></div></div>
                <Controller name="teamSelection" control={control} render={({ field }) => (
                  <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Regra de seleção de times">
                    {teamSelectionOptions.map(({ value, title, description, icon: Icon }) => {
                      const selected = selectedTeamSelection === value;
                      return (
                        <button key={value} type="button" role="radio" aria-checked={selected} onClick={() => field.onChange(value)} className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[.99] ${selected ? 'border-[#073B8C] bg-blue-50/70 ring-1 ring-[#073B8C]' : 'border-zinc-200 bg-white'}`}>
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${selected ? 'bg-[#073B8C] text-white' : 'bg-zinc-100 text-zinc-600'}`}><Icon className="h-5 w-5" /></span>
                          <span className="min-w-0 flex-1"><strong className="block text-sm font-black">{title}</strong><span className="text-xs font-medium leading-5 text-zinc-500">{description}</span></span>
                          {selected && <Check className="h-5 w-5 shrink-0 text-[#073B8C]" />}
                        </button>
                      );
                    })}
                  </div>
                )} />
              </div>

              <Controller name="requireValidation" control={control} render={({ field }) => (
                <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 p-4 shadow-sm">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#073B8C]"><Camera className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1"><p className="text-sm font-black">Exigir foto do placar</p><p className="mt-0.5 text-xs font-medium leading-5 text-zinc-500">Ajuda a evitar resultado errado e discussão no grupo. 📸</p></div>
                  <button type="button" role="switch" aria-label="Exigir foto do placar" aria-checked={field.value} onClick={() => field.onChange(!field.value)} className={`relative h-8 w-13 shrink-0 rounded-full p-1 transition ${field.value ? 'bg-[#073B8C]' : 'bg-zinc-300'}`}><span className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${field.value ? 'translate-x-5' : 'translate-x-0'}`} /></button>
                </div>
              )} />
            </div>
          </section>

          <div className="flex gap-3 rounded-2xl bg-blue-50 p-4 text-sm font-semibold leading-6 text-[#073B8C]"><Link2 className="mt-0.5 h-5 w-5 shrink-0" /><p>Depois de criar, você recebe o botão <strong>Convidar Amigos</strong>. As partidas só serão geradas quando você tocar em <strong>Gerar Partidas e Começar!</strong>.</p></div>

          {mutation.isError && <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-[#E31B23]">{createError(mutation.error)}</p>}

          <button disabled={mutation.isPending} type="submit" className="min-h-14 w-full rounded-2xl bg-[#073B8C] px-5 font-black text-white shadow-md transition active:scale-[.98] disabled:opacity-60">{mutation.isPending ? 'Criando...' : 'Criar e convidar amigos'}</button>
        </form>
      </main>
    </div>
  );
}
