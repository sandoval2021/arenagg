import { useEffect, useState } from 'react';
import { BellOff, BellRing, CheckCircle2, Share2, Smartphone } from 'lucide-react';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushCapability,
  isIosDevice,
  isStandalonePwa,
  type PushCapability,
} from '../../lib/push-api';

const INITIAL: PushCapability = { supported: true, permission: 'default', subscribed: false };

export function PushNotificationsCard() {
  const [capability, setCapability] = useState<PushCapability>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iosNeedsInstall = isIosDevice() && !isStandalonePwa();

  useEffect(() => {
    let active = true;
    void getPushCapability()
      .then((value) => { if (active) setCapability(value); })
      .catch(() => { if (active) setCapability({ supported: false, permission: 'unsupported', subscribed: false }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function enable() {
    setSaving(true);
    setError(null);
    try {
      await enablePushNotifications();
      setCapability(await getPushCapability());
    } catch (cause) {
      setError(pushError(cause));
      setCapability(await getPushCapability().catch(() => capability));
    } finally {
      setSaving(false);
    }
  }

  async function disable() {
    setSaving(true);
    setError(null);
    try {
      await disablePushNotifications();
      setCapability(await getPushCapability());
    } catch {
      setError('Não foi possível desativar neste aparelho agora.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-5 overflow-hidden rounded-[2rem] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-cyan-50 shadow-md shadow-blue-100/50">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl shadow-sm ${capability.subscribed ? 'bg-emerald-600 text-white' : 'bg-[#073B8C] text-white'}`}>
            {capability.subscribed ? <CheckCircle2 className="h-6 w-6" /> : <BellRing className="h-6 w-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-[#073B8C]">Não perca a hora do jogo</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">Notificações do Chavea</h2>
            <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">Receba check-in do adversário, geração da chave e confirmação de W.O. mesmo com o site fechado.</p>
          </div>
        </div>

        {iosNeedsInstall && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <div className="flex gap-3">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-black">No iPhone/iPad, instale primeiro.</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">No Safari, toque em <strong>Compartilhar</strong> <Share2 className="inline h-3.5 w-3.5" /> → <strong>Adicionar à Tela de Início</strong>. Depois abra o Chavea pelo ícone e ative aqui.</p>
              </div>
            </div>
          </div>
        )}

        {!loading && !capability.supported && (
          <p className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 text-xs font-bold text-slate-500">Este navegador ainda não oferece Web Push para este modo de uso.</p>
        )}

        {!loading && capability.permission === 'denied' && (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">As notificações foram bloqueadas no navegador. Libere a permissão do Chavea nas configurações do site/aparelho e tente novamente.</p>
        )}

        {error && <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}

        <button
          type="button"
          disabled={loading || saving || !capability.supported || iosNeedsInstall}
          onClick={() => capability.subscribed ? void disable() : void enable()}
          className={`mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black shadow-sm transition active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50 ${capability.subscribed ? 'border border-slate-200 bg-white text-slate-700' : 'bg-[#073B8C] text-white'}`}
        >
          {capability.subscribed ? <BellOff className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
          {saving ? 'Salvando…' : capability.subscribed ? 'Notificações ativadas · Desativar' : 'Ativar Notificações'}
        </button>
      </div>
    </section>
  );
}

function pushError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : '';
  if (message === 'PUSH_PERMISSION_DENIED') return 'Você não autorizou as notificações neste aparelho.';
  if (message === 'PUSH_NOT_CONFIGURED') return 'O servidor de notificações ainda não está configurado.';
  if (message === 'PUSH_UNSUPPORTED') return 'Este navegador não oferece suporte a notificações neste modo.';
  return 'Não foi possível ativar as notificações agora.';
}
