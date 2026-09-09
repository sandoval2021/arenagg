import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Camera,
  Check,
  Coins,
  Dices,
  Gamepad2,
  Repeat2,
  ShieldCheck,
  Trophy,
  UsersRound,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, type CompetitionFormat, type TeamSelection } from '../../lib/api';
import { createCompetitionPhaseThree } from '../../lib/phase-three-api';

type CreatableFormat = Exclude<CompetitionFormat, 'ENDLESS'>;

type FormValues = {
  name: string;
  game: string;
  platform: string;
  format: CreatableFormat;
  requireValidation: boolean;
  isHomeAndAway: boolean;
  teamSelection: TeamSelection;
  maxParticipants: number;
  entryFee: string;
  firstPercent: number;
  secondPercent: number;
  thirdPercent: number;
};

const games = ['EA FC 25', 'eFootball', 'Call of Duty', 'Outros'];
const platforms = ['PS5', 'PS4', 'Xbox', 'PC', 'Mobile'];
const formats = [
  { value: 'KNOCKOUT' as const, title: 'Mata-mata', description: 'Perdeu, está fora.', icon: Trophy },
  { value: 'GROUPS_KNOCKOUT' as const, title: 'Grupos', description: 'Grupos + fase decisiva.', icon: UsersRound },
  { value: 'LEAGUE' as const, title: 'Liga', description: 'Todos contra todos.', icon: ShieldCheck },
];

function parseCurrencyToCents(value: string): number | null {
  const cleaned = value.trim().replace(/[^\d,.-]/g, '');
  if (!cleaned) return 0;
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function createError(error: unknown): string {
  if (error instanceof ApiError && error.code === 'INVALID_INPUT') return 'Confira os dados. A divisão da premiação precisa somar exatamente 100%.';
  return 'Não foi possível criar a Copa agora.';
}

export function CreateCompetitionPhaseThreePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { register, control, handleSubmit, watch, setError, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      game: 'EA FC 25',
      platform: 'PS5',
      format: 'KNOCKOUT',
      requireValidation: true,
      isHomeAndAway: false,
      teamSelection: 'FREE',
      maxParticipants: 20,
      entryFee: '0,00',
      firstPercent: 60,
      secondPercent: 30,
      thirdPercent: 10,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const entryFee = parseCurrencyToCents(values.entryFee);
      const totalPercent = values.firstPercent + values.secondPercent + values.thirdPercent;
      if (entryFee == null) {
        setError('entryFee', { message: 'Informe um valor válido.' });
        throw new ApiError(400, 'INVALID_INPUT');
      }
      if (totalPercent !== 100) {
        setError('firstPercent', { message: 'A divisão precisa somar 100%.' });
        throw new ApiError(400, 'INVALID_INPUT');
      }
      return createCompetitionPhaseThree({
        name: values.name,
        game: values.game,
        platform: values.platform,
        type: values.format,
        requireValidation: values.requireValidation,
        isHomeAndAway: values.isHomeAndAway,
        teamSelection: values.teamSelection,
        maxParticipants: values.maxParticipants,
        matchPace: 'QUICK',
        entryFee,
        prizeDistribution: `${values.firstPercent},${values.secondPercent},${values.thirdPercent}`,
      });
    },
    onSuccess: async (competition) => {
      await queryClient.invalidateQueries({ queryKey: ['competitions', 'mine'] });
      navigate(`/competitions/${competition.id}`, { replace: true });
    },
  });

  const selectedFormat = watch('format');
  const selectedTeamSelection = watch('teamSelection');
  const maxParticipants = watch('maxParticipants');
  const first = watch('firstPercent');
  const second = watch('secondPercent');
  const third = watch('thirdPercent');
  const percentTotal = first + second + third;

  return (
    <div className="min-h-dvh bg-white text-slate-950">
      <main className="mx-auto max-w-lg px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3 py-3"><Link to="/competitions" aria-label="Voltar" className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm"><ArrowLeft className="h-5 w-5" /></Link><div><p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">Nova competição</p><h1 className="text-xl font-black">Criar Campeonato</h1></div></header>

        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="mt-5 space-y-6">
          <section><label htmlFor="competition-name" className="text-sm font-black">Nome da Copa</label><input id="competition-name" {...register('name', { required: 'Informe o nome da Copa.', minLength: { value: 3, message: 'Use pelo menos 3 caracteres.' }, maxLength: 80 })} placeholder="Ex.: Champions dos Amigos" className="mt-2 min-h-14 w-full rounded-2xl border border-slate-200 px-4 font-bold outline-none focus:border-[#073B8C] focus:ring-4 focus:ring-blue-50" />{errors.name && <p className="mt-1 text-xs font-bold text-rose-600">{errors.name.message}</p>}</section>

          <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-white"><Gamepad2 className="h-5 w-5" /></span><div><p className="text-sm font-black">Jogo e plataforma</p><p className="text-xs font-semibold text-slate-500">Identidade da competição.</p></div></div><div className="mt-4 grid grid-cols-2 gap-3"><select {...register('game')} className="min-h-12 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black">{games.map((game) => <option key={game}>{game}</option>)}</select><select {...register('platform')} className="min-h-12 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black">{platforms.map((platform) => <option key={platform}>{platform}</option>)}</select></div></section>

          <section><p className="text-sm font-black">Formato</p><Controller name="format" control={control} render={({ field }) => <div className="mt-2 grid gap-2">{formats.map(({ value, title, description, icon: Icon }) => { const selected = selectedFormat === value; return <button key={value} type="button" onClick={() => field.onChange(value)} className={`flex min-h-20 items-center gap-3 rounded-2xl border p-4 text-left transition ${selected ? 'border-[#073B8C] bg-blue-50 ring-1 ring-[#073B8C]' : 'border-slate-200 bg-white'}`}><span className={`grid h-11 w-11 place-items-center rounded-xl ${selected ? 'bg-[#073B8C] text-white' : 'bg-slate-100 text-slate-500'}`}><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="block text-sm font-black">{title}</strong><span className="text-xs font-semibold text-slate-500">{description}</span></span>{selected && <Check className="h-5 w-5 text-[#073B8C]" />}</button>; })}</div>} /></section>

          <section className="rounded-3xl border border-slate-200 p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><UsersRound className="h-5 w-5" /></span><div><p className="text-sm font-black">Máximo de jogadores</p><p className="text-xs font-semibold text-slate-500">2 a 20 participantes.</p></div></div><span className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white">{maxParticipants}</span></div><Controller name="maxParticipants" control={control} render={({ field }) => <input type="range" min={2} max={20} step={1} value={field.value} onChange={(event) => field.onChange(Number(event.target.value))} className="mt-4 w-full accent-[#073B8C]" />} /></section>

          <section className="rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-yellow-50 p-5 shadow-md shadow-amber-100/50"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500 text-white"><Coins className="h-6 w-6" /></span><div><p className="text-xs font-black uppercase tracking-wider text-amber-700">A caixinha</p><h2 className="text-lg font-black">Inscrição e premiação</h2></div></div><label className="mt-4 block text-xs font-black uppercase tracking-wider text-slate-500">Valor por jogador<div className="mt-2 flex min-h-13 items-center rounded-2xl border border-amber-200 bg-white px-3"><span className="font-black text-slate-400">R$</span><input {...register('entryFee')} inputMode="decimal" className="min-w-0 flex-1 px-2 text-lg font-black outline-none" /></div></label>{errors.entryFee && <p className="mt-1 text-xs font-bold text-rose-600">{errors.entryFee.message}</p>}<div className="mt-4 grid grid-cols-3 gap-2"><PercentController name="firstPercent" label="1º" control={control} /><PercentController name="secondPercent" label="2º" control={control} /><PercentController name="thirdPercent" label="3º" control={control} /></div><p className={`mt-2 text-xs font-black ${percentTotal === 100 ? 'text-emerald-600' : 'text-rose-600'}`}>Distribuição: {percentTotal}% de 100%</p>{errors.firstPercent && <p className="mt-1 text-xs font-bold text-rose-600">{errors.firstPercent.message}</p>}</section>

          <section><p className="mb-2 text-sm font-black">Regras</p><div className="space-y-3"><ToggleController name="isHomeAndAway" control={control} icon={Repeat2} title="Jogos de ida e volta" description="Cada confronto terá duas partidas." /><div className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><Dices className="h-5 w-5" /></span><div><p className="text-sm font-black">Seleção de times</p><p className="text-xs font-semibold text-slate-500">Livre ou sorteio cego.</p></div></div><Controller name="teamSelection" control={control} render={({ field }) => <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => field.onChange('FREE')} className={`min-h-12 rounded-xl text-xs font-black ${selectedTeamSelection === 'FREE' ? 'bg-[#073B8C] text-white' : 'bg-slate-100 text-slate-600'}`}>Livre</button><button type="button" onClick={() => field.onChange('RANDOM')} className={`min-h-12 rounded-xl text-xs font-black ${selectedTeamSelection === 'RANDOM' ? 'bg-[#073B8C] text-white' : 'bg-slate-100 text-slate-600'}`}>Sorteio Cego</button></div>} /></div><ToggleController name="requireValidation" control={control} icon={Camera} title="Exigir foto do placar" description="Proteção contra resultado digitado errado." /></div></section>

          {mutation.isError && <p className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{createError(mutation.error)}</p>}
          <button type="submit" disabled={mutation.isPending || percentTotal !== 100} className="min-h-14 w-full rounded-2xl bg-[#073B8C] px-5 font-black text-white shadow-md disabled:opacity-40">{mutation.isPending ? 'Criando…' : 'Criar e convidar amigos'}</button>
        </form>
      </main>
    </div>
  );
}

function PercentController({ name, label, control }: { name: 'firstPercent' | 'secondPercent' | 'thirdPercent'; label: string; control: ReturnType<typeof useForm<FormValues>>['control'] }) {
  return <Controller name={name} control={control} render={({ field }) => <label className="text-center text-[10px] font-black uppercase tracking-wider text-slate-400">{label}<div className="mt-1 flex items-center rounded-xl border border-amber-200 bg-white px-2"><input type="number" inputMode="numeric" min={0} max={100} value={field.value} onChange={(event) => field.onChange(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} className="h-11 min-w-0 w-full text-center text-sm font-black outline-none" /><span className="text-xs font-black text-slate-400">%</span></div></label>} />;
}

function ToggleController({ name, control, icon: Icon, title, description }: { name: 'isHomeAndAway' | 'requireValidation'; control: ReturnType<typeof useForm<FormValues>>['control']; icon: typeof Repeat2; title: string; description: string }) {
  return <Controller name={name} control={control} render={({ field }) => <div className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#073B8C]"><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-sm font-black">{title}</p><p className="text-xs font-semibold text-slate-500">{description}</p></div><button type="button" role="switch" aria-checked={field.value} onClick={() => field.onChange(!field.value)} className={`relative h-8 w-13 shrink-0 rounded-full p-1 transition ${field.value ? 'bg-[#073B8C]' : 'bg-slate-300'}`}><span className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${field.value ? 'translate-x-5' : ''}`} /></button></div>} />;
}
