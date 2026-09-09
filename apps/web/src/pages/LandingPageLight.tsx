import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Gamepad2,
  ShieldCheck,
  Smartphone,
  Trophy,
  UsersRound,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/brand/Logo';

const features = [
  { icon: Trophy, title: 'Copas sem planilha', description: 'Crie mata-mata, ligas e campeonatos entre amigos em poucos toques.' },
  { icon: Camera, title: 'Placar com prova 📸', description: 'Ative a validação por foto e reduza aquela discussão clássica do “foi 4x1 mesmo?”.' },
  { icon: UsersRound, title: 'Convite por link', description: 'Mande o link no grupo, reúna a galera e deixe o Chavea organizar o resto.' },
];

export function LandingPageLight() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-white text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#073B8C0b_1px,transparent_1px),linear-gradient(to_bottom,#073B8C0b_1px,transparent_1px)] bg-[size:24px_24px]" />
      <div className="pointer-events-none absolute -left-36 top-24 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-[28rem] h-96 w-96 rounded-full bg-red-500/7 blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 left-1/3 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <header className="flex items-center justify-between py-3">
          <Link to="/" className="rounded-2xl px-1 py-1 transition active:scale-95" aria-label="Chavea - início">
            <Logo size="sm" />
          </Link>
          <Link to="/login" className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-extrabold text-[#073B8C] shadow-sm transition active:scale-95">Entrar</Link>
        </header>

        <section className="relative grid items-center gap-10 pb-14 pt-12 lg:grid-cols-2 lg:py-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black uppercase tracking-wider text-[#073B8C]"><Gamepad2 className="h-4 w-4" /> EA FC • e-Sports • resenha</div>
            <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.04] tracking-tight sm:text-5xl lg:text-6xl">O melhor gerenciador de campeonatos de EA FC e e-Sports! 🎮🏆</h1>
            <p className="mt-5 max-w-2xl text-base font-medium leading-7 text-slate-600 sm:text-lg">Crie copas, convide amigos e deixe as planilhas no passado. Sistema anti-fraude com foto do placar direto no celular! 📸⚽</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link to="/register" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#073B8C] px-6 font-black text-white shadow-md transition active:scale-[.98]">Criar minha conta <ArrowRight className="h-5 w-5" /></Link>
              <Link to="/login" className="flex min-h-14 items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 font-black text-[#073B8C] shadow-sm transition active:scale-[.98]">Já tenho conta</Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-slate-600"><span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Mobile-first</span><span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Sem planilha</span><span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Resultado validável</span></div>
          </div>

          <div className="mx-auto w-full max-w-md rounded-[2rem] border border-slate-200 bg-white/90 p-4 shadow-xl shadow-slate-200/70 backdrop-blur-xl">
            <div className="rounded-[1.6rem] border border-slate-200 bg-gradient-to-br from-white via-blue-50/50 to-white p-5 shadow-sm">
              <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">Final • hoje</p><h2 className="mt-1 text-xl font-black">Copa dos Amigos 🔥</h2></div><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-[#073B8C]"><Trophy /></span></div>
              <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm"><div><div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-lg">⚪</div><p className="mt-2 text-sm font-black">Real Madrid</p></div><div><p className="text-3xl font-black">4 <span className="text-slate-300">×</span> 3</p><p className="mt-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">Validado ✓</p></div><div><div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-red-50 text-lg">🔴</div><p className="mt-2 text-sm font-black">Arsenal</p></div></div>
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-[#073B8C]"><Camera className="h-5 w-5 shrink-0" /> Foto do placar anexada. Sem VAR no grupo do WhatsApp 😄</div>
            </div>
          </div>
        </section>

        <section className="py-12"><div className="text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-[#073B8C]">Organização sem sofrimento</p><h2 className="mx-auto mt-2 max-w-2xl text-3xl font-black tracking-tight">Menos discussão. Mais jogo. ⚽</h2></div><div className="mt-8 grid gap-4 md:grid-cols-3">{features.map(({ icon: Icon, title, description }) => <article key={title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-md shadow-slate-200/50"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-[#073B8C]"><Icon className="h-6 w-6" /></span><h3 className="mt-4 text-lg font-black">{title}</h3><p className="mt-2 text-sm font-medium leading-6 text-slate-600">{description}</p></article>)}</div></section>

        <section className="relative grid gap-4 overflow-hidden rounded-[2rem] border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6 shadow-lg shadow-blue-100/70 lg:grid-cols-[1fr_auto] lg:items-center lg:p-9"><div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl" /><div className="relative"><div className="flex items-center gap-2 text-[#073B8C]"><Zap className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-wider">Começa em minutos</span></div><h2 className="mt-2 text-2xl font-black sm:text-3xl">A próxima resenha merece uma chave organizada. 🏆</h2><p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">Crie o campeonato, copie o convite, mande no grupo e deixe o sorteio com a gente.</p></div><Link to="/register" className="relative flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#073B8C] px-6 font-black text-white shadow-md">Bora criar! <Smartphone className="h-5 w-5" /></Link></section>

        <footer className="mt-12 flex items-center justify-center gap-2 text-center text-xs font-semibold text-slate-500"><ShieldCheck className="h-4 w-4" /> Chavea • campeonatos de EA FC e e-Sports direto do celular</footer>
      </div>
    </main>
  );
}
