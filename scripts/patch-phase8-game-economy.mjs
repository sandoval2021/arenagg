import fs from 'node:fs';

function patch(path, before, after) {
  let content = fs.readFileSync(path, 'utf8');
  if (content.includes(after)) return;
  if (!content.includes(before)) throw new Error(`Patch target not found: ${path}`);
  content = content.replace(before, after);
  fs.writeFileSync(path, content);
}

patch(
  'prisma/schema.prisma',
  `  reputationCount     Int      @default(0)\n  consoles`,
  `  reputationCount     Int      @default(0)\n  lastLoginReward      DateTime?\n  consoles`,
);

patch(
  'apps/api/src/routes/auth.routes.ts',
  `} from '../services/auth.service';`,
  `} from '../services/auth.service';\nimport { claimDailyLoginReward } from '../services/sticker-pack-rewards.service';`,
);
patch(
  'apps/api/src/routes/auth.routes.ts',
  `function isPrismaUniqueConstraintError(error: unknown): boolean {\n  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';\n}\n`,
  `function isPrismaUniqueConstraintError(error: unknown): boolean {\n  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';\n}\n\nasync function claimDailyRewardSafely(\n  prisma: Env['Variables']['prisma'],\n  userId: string,\n): Promise<boolean> {\n  try {\n    return await claimDailyLoginReward(prisma, userId);\n  } catch (error) {\n    console.error('[auth.daily-reward] failed', {\n      userId,\n      error: error instanceof Error ? error.message : String(error),\n    });\n    // Authentication must remain available. Because lastLoginReward is only\n    // advanced in the reward transaction, a later /me bootstrap can retry.\n    return false;\n  }\n}\n`,
);
patch(
  'apps/api/src/routes/auth.routes.ts',
  `    await attachSession(c, prisma, user.id);\n    return c.json({ user: toPublicUser(user) }, 201);`,
  `    await attachSession(c, prisma, user.id);\n    const dailyPackGranted = await claimDailyRewardSafely(prisma, user.id);\n    return c.json({ user: toPublicUser(user), rewards: { dailyPackGranted } }, 201);`,
);
patch(
  'apps/api/src/routes/auth.routes.ts',
  `  await attachSession(c, prisma, user.id);\n  return c.json({ user: toPublicUser(user) });\n});\n\nauth.get('/me'`,
  `  await attachSession(c, prisma, user.id);\n  const dailyPackGranted = await claimDailyRewardSafely(prisma, user.id);\n  return c.json({ user: toPublicUser(user), rewards: { dailyPackGranted } });\n});\n\nauth.get('/me'`,
);
patch(
  'apps/api/src/routes/auth.routes.ts',
  `auth.get('/me', async (c) => {\n  const token = getCookie(c, 'chavea_session');\n  if (!token) return c.json({ user: null });\n  return c.json({ user: await getSessionUser(c.get('prisma'), token) });\n});`,
  `auth.get('/me', async (c) => {\n  const token = getCookie(c, 'chavea_session');\n  if (!token) return c.json({ user: null, rewards: { dailyPackGranted: false } });\n\n  const prisma = c.get('prisma');\n  const user = await getSessionUser(prisma, token);\n  if (!user) return c.json({ user: null, rewards: { dailyPackGranted: false } });\n\n  const dailyPackGranted = await claimDailyRewardSafely(prisma, user.id);\n  return c.json({ user, rewards: { dailyPackGranted } });\n});`,
);

patch(
  'apps/api/src/services/achievement-engine.service.ts',
  `} from '../domain/achievements/badges';`,
  `} from '../domain/achievements/badges';\nimport { creditStickerPacks } from './sticker-pack-rewards.service';`,
);
patch(
  'apps/api/src/services/achievement-engine.service.ts',
  `export async function awardBadgeCodes(\n  db: Pick<PrismaClient, 'userBadge'> | Pick<Tx, 'userBadge'>,\n  userId: string,\n  codes: readonly BadgeCode[],\n): Promise<void> {\n  const unique = uniqueCodes(codes);\n  if (unique.length === 0) return;\n  await db.userBadge.createMany({\n    data: unique.map((badgeCode) => ({ userId, badgeCode })),\n    skipDuplicates: true,\n  });\n}`,
  `async function persistBadgeCodesAndRewards(\n  tx: Tx,\n  userId: string,\n  codes: readonly BadgeCode[],\n): Promise<number> {\n  const unique = uniqueCodes(codes);\n  if (unique.length === 0) return 0;\n\n  const inserted = await tx.userBadge.createMany({\n    data: unique.map((badgeCode) => ({ userId, badgeCode })),\n    skipDuplicates: true,\n  });\n\n  // One COMMON pack per badge that was actually inserted. skipDuplicates +\n  // BatchPayload.count prevents retries/reconciliation from minting packs twice.\n  if (inserted.count > 0) {\n    await creditStickerPacks(tx, userId, 'COMMON', inserted.count);\n  }\n  return inserted.count;\n}\n\nfunction isRootPrismaClient(db: PrismaClient | Tx): db is PrismaClient {\n  return typeof (db as PrismaClient).$transaction === 'function';\n}\n\nexport async function awardBadgeCodes(\n  db: PrismaClient | Tx,\n  userId: string,\n  codes: readonly BadgeCode[],\n): Promise<void> {\n  if (uniqueCodes(codes).length === 0) return;\n\n  if (isRootPrismaClient(db)) {\n    await db.$transaction(\n      (tx) => persistBadgeCodesAndRewards(tx, userId, codes),\n      { maxWait: 5_000, timeout: 10_000 },\n    );\n    return;\n  }\n\n  await persistBadgeCodesAndRewards(db, userId, codes);\n}`,
);
patch(
  'apps/api/src/services/achievement-engine.service.ts',
  `  if (grants.length > 0) {\n    await tx.userBadge.createMany({ data: grants, skipDuplicates: true });\n  }`,
  `  if (grants.length > 0) {\n    const grantsByUser = new Map<string, BadgeCode[]>();\n    for (const grant of grants) {\n      const codes = grantsByUser.get(grant.userId) ?? [];\n      codes.push(grant.badgeCode);\n      grantsByUser.set(grant.userId, codes);\n    }\n\n    // P <= 2 on the match hot path. Keeping one createMany per player lets us\n    // attribute BatchPayload.count exactly and reward only genuinely new badges.\n    for (const [userId, codes] of grantsByUser) {\n      await persistBadgeCodesAndRewards(tx, userId, codes);\n    }\n  }`,
);

patch(
  'apps/api/src/services/profile-stats.service.ts',
  `import { syncGroupStandingsForMatch } from './group-stage.service';`,
  `import { syncGroupStandingsForMatch } from './group-stage.service';\nimport { creditStickerPacks } from './sticker-pack-rewards.service';`,
);
patch(
  'apps/api/src/services/profile-stats.service.ts',
  `  if (claimed.count === 1) await awardChampionship(tx, champion.participation.userId);`,
  `  if (claimed.count === 1) {\n    await awardChampionship(tx, champion.participation.userId);\n    // championshipProfileAppliedAt is the exactly-once audit/idempotency gate.\n    // The champion reward commits in the same transaction as competition close.\n    await creditStickerPacks(tx, champion.participation.userId, 'PREMIUM', 3);\n  }`,
);

patch(
  'apps/web/src/hooks/useAuth.tsx',
  `import { createContext, useContext, type PropsWithChildren } from 'react';`,
  `import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';`,
);
patch(
  'apps/web/src/hooks/useAuth.tsx',
  `type AuthContextValue = ReturnType<typeof useAuthState>;`,
  `type AuthSessionResponse = {\n  user: AuthUser | null;\n  rewards?: { dailyPackGranted?: boolean };\n};\n\ntype AuthContextValue = ReturnType<typeof useAuthState>;`,
);
patch(
  'apps/web/src/hooks/useAuth.tsx',
  `async function loadSessionWithPwaGrace(): Promise<{ user: AuthUser | null }> {\n  const first = await apiRequest<{ user: AuthUser | null }>('/api/auth/me');`,
  `async function loadSessionWithPwaGrace(): Promise<AuthSessionResponse> {\n  const first = await apiRequest<AuthSessionResponse>('/api/auth/me');`,
);
patch(
  'apps/web/src/hooks/useAuth.tsx',
  `  const second = await apiRequest<{ user: AuthUser | null }>('/api/auth/me');`,
  `  const second = await apiRequest<AuthSessionResponse>('/api/auth/me');`,
);
patch(
  'apps/web/src/hooks/useAuth.tsx',
  `  const third = await apiRequest<{ user: AuthUser | null }>('/api/auth/me');`,
  `  const third = await apiRequest<AuthSessionResponse>('/api/auth/me');`,
);
patch(
  'apps/web/src/hooks/useAuth.tsx',
  `      apiRequest<{ user: AuthUser }>('/api/auth/login', {`,
  `      apiRequest<AuthSessionResponse & { user: AuthUser }>('/api/auth/login', {`,
);
patch(
  'apps/web/src/hooks/useAuth.tsx',
  `      apiRequest<{ user: AuthUser }>('/api/auth/register', {`,
  `      apiRequest<AuthSessionResponse & { user: AuthUser }>('/api/auth/register', {`,
);
patch(
  'apps/web/src/hooks/useAuth.tsx',
  `    isAuthenticated: Boolean(me.data?.user),\n    login,`,
  `    isAuthenticated: Boolean(me.data?.user),\n    dailyRewardGranted: Boolean(me.data?.rewards?.dailyPackGranted),\n    login,`,
);
patch(
  'apps/web/src/hooks/useAuth.tsx',
  `export function AuthProvider({ children }: PropsWithChildren) {\n  const value = useAuthState();`,
  `function DailyPackToast({ granted }: { granted: boolean }) {\n  const [visible, setVisible] = useState(false);\n\n  useEffect(() => {\n    if (!granted) return;\n    setVisible(true);\n    const timer = window.setTimeout(() => setVisible(false), 5_000);\n    return () => window.clearTimeout(timer);\n  }, [granted]);\n\n  if (!visible) return null;\n  return (\n    <div\n      className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[120] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-yellow-50 px-4 py-3 text-center text-sm font-black text-amber-950 shadow-2xl shadow-amber-200/60"\n      role="status"\n      aria-live="polite"\n    >\n      🎁 Você ganhou 1 Pacote Diário de Cartas!\n    </div>\n  );\n}\n\nexport function AuthProvider({ children }: PropsWithChildren) {\n  const value = useAuthState();`,
);
patch(
  'apps/web/src/hooks/useAuth.tsx',
  `  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;`,
  `  return (\n    <AuthContext.Provider value={value}>\n      <DailyPackToast granted={value.dailyRewardGranted} />\n      {children}\n    </AuthContext.Provider>\n  );`,
);

console.log('Phase 8 game economy patches applied.');
