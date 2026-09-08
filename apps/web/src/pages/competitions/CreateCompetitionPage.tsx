import { useState } from 'react';
import { ArrowLeft, Camera, Check, Shield, Trophy, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';

type Format = 'KNOCKOUT' | 'GROUPS_KNOCKOUT' | 'LEAGUE';
const formats = [
  { value: 'KNOCKOUT' as const, title: 'Mata-mata', description: 'Perdeu, está fora.', icon: Trophy },
  { value: 'GROUPS_KNOCKOUT' as const, title: 'Grupos + Mata-mata', description: 'Classificação e fase final.', icon: UsersRound },
  { value: 'LEAGUE' as const, title: 'Liga', description: 'Todos contra todos.', icon: Shield },
];

export function CreateCompetitionPage() {
  const [name, setName] = useState('');
  const [format, setFormat] = useState<Format>('KNOCKOUT');
  const [logo, setLogo] = useState<string>();

  function handleLogo(file?: File) {
    if (!file || !file.type.startsWith('image/')) return;
    setLogo(URL.createObjectURL(file));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Passo 4 conectará esta intenção à mutation/API. A UI não contém regra de domínio.
    console.info({ name, format });
  }

  return (
    <div className="min-h-dvh bg-white text-black">
      <main className="mx-auto max-w-lg px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3 py-3"><Link to="/" aria-label="Voltar" className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 shadow-sm"><ArrowLeft className="h-5 w-5" /></Link><div><p className="text-xs font-bold uppercase tracking-wider text-[#073B8C]">Nova competição</p><h1 className="text-xl font-black">Criar Campeonato</h1></div></header>

        <form onSubmit={handleSubmit} className="mt-6 space-y-7">
          <section><label className="text-sm font-extrabold" htmlFor="competition-name">Nome da Copa</label><input id="competition-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Ex.: Champions dos Amigos" className="mt-2 min-h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none transition placeholder:text-slate-400 focus:border-[#073B8C] focus:ring-4 focus:ring-blue-50" /></section>

          <section><p className="text-sm font-extrabold">Logo</p><div className="mt-2 flex items-center gap-4"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">{logo ? <img src={logo} alt="Prévia da logo" className="h-full w-full object-cover" /> : <Trophy className="h-8 w-8 text-[#073B8C]" />}</div><label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold shadow-sm"><Camera className="h-4 w-4" />Escolher imagem<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => handleLogo(e.target.files?.[0])} /></label></div></section>

          <section><p className="text-sm font-extrabold">Formato</p><div className="mt-2 space-y-2">{formats.map(({ value, title, description, icon: Icon }) => { const selected = format === value; return <button key={value} type="button" onClick={() => setFormat(value)} className={`flex min-h-20 w-full items-center gap-3 rounded-2xl border p-4 text-left shadow-sm transition ${selected ? 'border-[#073B8C] bg-blue-50/70 ring-1 ring-[#073B8C]' : 'border-slate-200 bg-white'}`}><span className={`grid h-11 w-11 place-items-center rounded-xl ${selected ? 'bg-[#073B8C] text-white' : 'bg-slate-100 text-black'}`}><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="block text-sm font-extrabold">{title}</strong><span className="text-xs font-medium text-slate-500">{description}</span></span>{selected && <Check className="h-5 w-5 text-[#073B8C]" />}</button>; })}</div></section>

          <button type="submit" className="min-h-14 w-full rounded-2xl bg-[#073B8C] px-5 font-extrabold text-white shadow-md transition active:scale-[.98]">Continuar configuração</button>
        </form>
      </main>
    </div>
  );
}
