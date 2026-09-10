import { spawnSync } from 'node:child_process';

const sql = String.raw`
INSERT INTO "ChaveaCard"
  ("id", "cardNumber", "name", "rarity", "imageUrl", "boostType", "boostValue", "albumPage", "isActive", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  n,
  'Craque Chavea #' || LPAD(n::text, 3, '0'),
  CASE
    WHEN n <= 40 THEN 'COMMON'::"CardRarity"
    WHEN n <= 47 THEN 'RARE'::"CardRarity"
    WHEN n <= 49 THEN 'EPIC'::"CardRarity"
    ELSE 'LEGENDARY'::"CardRarity"
  END,
  NULL,
  'NONE',
  0,
  CASE
    WHEN n <= 10 THEN 'Lendas'
    WHEN n <= 20 THEN 'Craques'
    WHEN n <= 30 THEN 'Camisa 10'
    WHEN n <= 40 THEN 'Defensores'
    ELSE 'Ídolos'
  END,
  true,
  NOW(),
  NOW()
FROM generate_series(1, 50) AS n
ON CONFLICT ("cardNumber") DO NOTHING;
`;

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  command,
  ['prisma', 'db', 'execute', '--schema', 'prisma/schema.prisma', '--stdin'],
  {
    cwd: new URL('..', import.meta.url),
    input: sql,
    stdio: ['pipe', 'inherit', 'inherit'],
    env: process.env,
  },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('50 cartas genéricas garantidas no catálogo do Chavea.');
