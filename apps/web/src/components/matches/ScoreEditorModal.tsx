import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Camera, X } from 'lucide-react';

interface ScoreForm { homeScore: number; awayScore: number; evidence?: FileList }
interface Props { open: boolean; homeTeam: string; awayTeam: string; requireValidation: boolean; onClose: () => void; onSubmitted?: () => void }

async function mockSubmitScore(values: ScoreForm) { await new Promise((r) => setTimeout(r, 500)); return values; }

export function ScoreEditorModal({ open, homeTeam, awayTeam, requireValidation, onClose, onSubmitted }: Props) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ScoreForm>();
  const mutation = useMutation({ mutationFn: mockSubmitScore, onSuccess: () => { reset(); onSubmitted?.(); onClose(); } });
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Registrar placar">
      <button className="absolute inset-0" aria-label="Fechar" onClick={onClose} />
      <section className="relative w-full max-w-lg rounded-t-[2rem] bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-zinc-200" />
        <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">Resultado</p><h2 className="text-xl font-black">Registrar placar</h2></div><button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100" aria-label="Fechar"><X className="h-5 w-5" /></button></div>

        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="mt-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3"><label className="text-center text-sm font-black"><span className="mb-2 block truncate">{homeTeam}</span><input type="number" inputMode="numeric" min={0} max={99} {...register('homeScore', { required: true, valueAsNumber: true, min: 0, max: 99 })} className="h-20 w-full rounded-2xl border border-zinc-200 text-center text-3xl font-black outline-none focus:border-[#073B8C] focus:ring-4 focus:ring-blue-50" /></label><span className="pb-6 text-lg font-black text-zinc-300">×</span><label className="text-center text-sm font-black"><span className="mb-2 block truncate">{awayTeam}</span><input type="number" inputMode="numeric" min={0} max={99} {...register('awayScore', { required: true, valueAsNumber: true, min: 0, max: 99 })} className="h-20 w-full rounded-2xl border border-zinc-200 text-center text-3xl font-black outline-none focus:border-[#073B8C] focus:ring-4 focus:ring-blue-50" /></label></div>
          {(errors.homeScore || errors.awayScore) && <p className="mt-2 text-center text-xs font-bold text-[#E31B23]">Informe um placar válido.</p>}

          {requireValidation && <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><p className="text-sm font-black">Comprove o resultado</p><p className="mt-1 text-xs font-medium leading-5 text-zinc-600">Tire uma foto nítida da TV ou monitor mostrando o placar final.</p><label className="mt-3 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-[#073B8C] shadow-sm"><Camera className="h-5 w-5" />Tirar foto do placar<input type="file" accept="image/*" capture="environment" {...register('evidence', { required: requireValidation })} className="sr-only" /></label>{errors.evidence && <p className="mt-2 text-xs font-bold text-[#E31B23]">A foto é obrigatória nesta competição.</p>}</div>}

          <button type="submit" disabled={mutation.isPending} className="mt-6 min-h-14 w-full rounded-2xl bg-[#073B8C] px-5 font-black text-white shadow-md active:scale-[.98] disabled:opacity-60">{mutation.isPending ? 'Enviando...' : requireValidation ? 'Enviar para validação' : 'Salvar resultado'}</button>
        </form>
      </section>
    </div>
  );
}
