import fs from 'node:fs';

const path = 'apps/api/src/services/profile-stats.service.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(
  'await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${competitionId}))`;',
  'await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${competitionId}))`;',
);
content = content.replace(
  'await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;',
  'await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;',
);
if (content.includes('$queryRaw`SELECT pg_advisory_xact_lock')) {
  throw new Error('Unsafe pg_advisory_xact_lock $queryRaw remains in profile-stats.service.ts');
}
fs.writeFileSync(path, content);
console.log('Reward path advisory locks hardened.');
