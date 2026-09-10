import fs from 'node:fs';
import path from 'node:path';

function replaceOnce(file, before, after) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes(after)) return false;
  if (!content.includes(before)) throw new Error(`Patch target not found: ${file}`);
  content = content.replace(before, after);
  fs.writeFileSync(file, content);
  return true;
}

replaceOnce(
  'apps/api/src/routes/competition-start-v2.routes.ts',
  `      };\n    });\n\n    if (!result.ok) {`,
  `      };\n    }, { maxWait: 15000, timeout: 30000 });\n\n    if (!result.ok) {`,
);

replaceOnce(
  'apps/web/src/pages/competitions/CompetitionDetailPageLight.tsx',
  `<TeamAvatar name={participant.teamName} logoUrl={participant.teamLogoUrl ?? participant.team?.logoUrl ?? undefined} />`,
  `<TeamAvatar name={participant.teamName} logoUrl={participant.team?.logoUrl ?? participant.user.avatarUrl ?? participant.teamLogoUrl ?? undefined} />`,
);

replaceOnce(
  'apps/web/src/pages/EditProfilePage.tsx',
  `    onSuccess: async () => {\n      await queryClient.invalidateQueries({ queryKey: ['gamer-profile'] });\n      navigate('/profile', { replace: true });\n    },`,
  `    onSuccess: async () => {\n      await Promise.all([\n        queryClient.invalidateQueries({ queryKey: ['gamer-profile'] }),\n        queryClient.invalidateQueries({ queryKey: ['competition'] }),\n      ]);\n      navigate('/profile', { replace: true });\n    },`,
);

replaceOnce(
  'apps/web/src/hooks/useAuth.tsx',
  `import { API_URL, apiRequest } from '../lib/api';`,
  `import { apiRequest } from '../lib/api';`,
);

replaceOnce(
  'apps/web/src/hooks/useAuth.tsx',
  `  await sleep(250);\n  const second = await apiRequest<AuthSessionResponse>('/api/auth/me');\n  if (second.user) {\n    writeKnownSession(true);\n    return second;\n  }\n\n  await sleep(500);\n  const third = await apiRequest<AuthSessionResponse>('/api/auth/me');\n  if (third.user) writeKnownSession(true);\n  return third;`,
  `  const delays = [250, 750, 1500, 2500] as const;\n  let latest = first;\n  for (const delay of delays) {\n    await sleep(delay);\n    latest = await apiRequest<AuthSessionResponse>('/api/auth/me');\n    if (latest.user) {\n      writeKnownSession(true);\n      return latest;\n    }\n  }\n  return latest;`,
);

replaceOnce(
  'apps/web/src/hooks/useAuth.tsx',
  `    googleLoginUrl: \`${'${API_URL}'}/api/auth/google\`,`,
  `    googleLoginUrl: '/api/auth/google',`,
);

const migrationDir = 'prisma/migrations/20260910090000_qa_avatar_bucket_public';
const migrationPath = path.join(migrationDir, 'migration.sql');
if (!fs.existsSync(migrationPath)) {
  fs.mkdirSync(migrationDir, { recursive: true });
  fs.writeFileSync(migrationPath, `DO $$\nBEGIN\n  IF to_regclass('storage.buckets') IS NOT NULL THEN\n    UPDATE storage.buckets\n    SET public = true,\n        file_size_limit = CASE\n          WHEN file_size_limit IS NULL OR file_size_limit < 10485760 THEN 10485760\n          ELSE file_size_limit\n        END\n    WHERE id = 'escudos';\n  END IF;\nEND $$;\n`);
}

console.log('Critical QA hotfix patches applied.');
