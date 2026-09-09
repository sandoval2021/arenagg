import { buildPushPayload } from '@block65/webcrypto-web-push';
import type { PrismaClient } from '@prisma/client';
import type { Env } from '../types/env';

const VAPID_SUBJECT = 'https://chavea.pages.dev';
const MAX_SUBSCRIPTIONS_PER_DELIVERY = 200;

export type ChaveaPushNotification = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export function isPushConfigured(env: Env['Bindings']): boolean {
  return Boolean(env.VAPID_SERVER_PUBLIC_KEY?.trim() && env.VAPID_SERVER_PRIVATE_KEY?.trim());
}

export function getVapidPublicKey(env: Env['Bindings']): string | null {
  return env.VAPID_SERVER_PUBLIC_KEY?.trim() || null;
}

/**
 * Push é best-effort e fica fora das transações esportivas. Uma indisponibilidade
 * de FCM/APNs/Mozilla jamais pode reverter placar, check-in, chave ou MMR.
 * Endpoints expirados são removidos automaticamente (404/410).
 */
export async function sendPushToUsers(
  db: PrismaClient,
  env: Env['Bindings'],
  userIds: readonly string[],
  notification: ChaveaPushNotification,
): Promise<{ delivered: number; removed: number; failed: number }> {
  const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
  if (uniqueUserIds.length === 0 || !isPushConfigured(env)) {
    return { delivered: 0, removed: 0, failed: 0 };
  }

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: { in: uniqueUserIds } },
    orderBy: { updatedAt: 'desc' },
    take: MAX_SUBSCRIPTIONS_PER_DELIVERY,
  });
  if (subscriptions.length === 0) return { delivered: 0, removed: 0, failed: 0 };

  const vapid = {
    subject: VAPID_SUBJECT,
    publicKey: env.VAPID_SERVER_PUBLIC_KEY!.trim(),
    privateKey: env.VAPID_SERVER_PRIVATE_KEY!.trim(),
  };

  const results = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      const request = await buildPushPayload(
        {
          data: notification,
          options: { ttl: 300, urgency: 'high', topic: notification.tag.slice(0, 32) },
        },
        {
          endpoint: subscription.endpoint,
          expirationTime: null,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        vapid,
      );

      const response = await fetch(subscription.endpoint, request);
      if (response.status === 404 || response.status === 410) {
        await db.pushSubscription.deleteMany({ where: { id: subscription.id } });
        return 'removed' as const;
      }
      if (!response.ok) {
        console.warn('[push] delivery rejected', {
          status: response.status,
          endpointHost: safeEndpointHost(subscription.endpoint),
        });
        return 'failed' as const;
      }
      return 'delivered' as const;
    }),
  );

  let delivered = 0;
  let removed = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === 'rejected') {
      failed += 1;
      console.warn('[push] delivery failed', result.reason);
    } else if (result.value === 'delivered') delivered += 1;
    else if (result.value === 'removed') removed += 1;
    else failed += 1;
  }
  return { delivered, removed, failed };
}

function safeEndpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return 'invalid-endpoint';
  }
}
