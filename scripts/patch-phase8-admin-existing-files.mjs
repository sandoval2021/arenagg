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
  `enum CardRarity {\n  COMMON\n  RARE\n  EPIC\n  LEGENDARY\n}\n`,
  `enum CardRarity {\n  COMMON\n  RARE\n  EPIC\n  LEGENDARY\n}\n\nenum UserRole {\n  USER\n  ADMIN\n}\n`,
);
patch(
  'prisma/schema.prisma',
  `  passwordHash                 String?\n  isActive                     Boolean                  @default(true)\n  createdAt`,
  `  passwordHash                 String?\n  isActive                     Boolean                  @default(true)\n  role                         UserRole                 @default(USER)\n  createdAt`,
);
patch(
  'prisma/schema.prisma',
  `  inventoryCards               UserInventoryCard[]\n  stickerPacks                 UserStickerPack[]\n}\n\nmodel UserProfile`,
  `  inventoryCards               UserInventoryCard[]\n  stickerPacks                 UserStickerPack[]\n\n  @@index([role])\n}\n\nmodel UserProfile`,
);

patch(
  'apps/api/src/services/auth.service.ts',
  `  'id' | 'name' | 'displayName' | 'avatarUrl' | 'email' | 'phone'\n>;`,
  `  'id' | 'name' | 'displayName' | 'avatarUrl' | 'email' | 'phone' | 'role'\n>;`,
);
patch(
  'apps/api/src/services/auth.service.ts',
  `    email: user.email,\n    phone: user.phone,\n  };`,
  `    email: user.email,\n    phone: user.phone,\n    role: user.role,\n  };`,
);

patch(
  'apps/web/src/hooks/useAuth.tsx',
  `  email: string | null;\n  phone: string | null;\n};`,
  `  email: string | null;\n  phone: string | null;\n  role: 'USER' | 'ADMIN';\n};`,
);

patch(
  'apps/api/src/index.ts',
  `import { requireOwner } from './middleware/owner.middleware';`,
  `import { requireOwner } from './middleware/owner.middleware';\nimport { requireAdmin } from './middleware/admin.middleware';`,
);
patch(
  'apps/api/src/index.ts',
  `import { album } from './routes/album.routes';`,
  `import { album } from './routes/album.routes';\nimport { adminCards } from './routes/admin-cards.routes';`,
);
patch(
  'apps/api/src/index.ts',
  `app.use('/api/album', requireAuth);\napp.use('/api/album/*', requireAuth);\napp.use('/api/owner/*', requireAuth);`,
  `app.use('/api/album', requireAuth);\napp.use('/api/album/*', requireAuth);\napp.use('/api/admin/*', requireAuth);\napp.use('/api/admin/*', requireAdmin);\napp.use('/api/owner/*', requireAuth);`,
);
patch(
  'apps/api/src/index.ts',
  `app.route('/api/album', album);`,
  `app.route('/api/album', album);\napp.route('/api/admin/cards', adminCards);`,
);

patch(
  'apps/web/src/pages/OwnerSettingsPage.tsx',
  `  ArrowLeft,\n  ImagePlus,`,
  `  ArrowLeft,\n  FileSpreadsheet,\n  ImagePlus,`,
);
patch(
  'apps/web/src/pages/OwnerSettingsPage.tsx',
  `import { GlobalLoader } from '../components/brand/GlobalLoader';`,
  `import { GlobalLoader } from '../components/brand/GlobalLoader';\nimport { bulkImportCards, type CardBulkImportResult } from '../lib/admin-cards-api';`,
);
patch(
  'apps/web/src/pages/OwnerSettingsPage.tsx',
  `  const [name, setName] = useState('');\n  const [file, setFile] = useState<File | null>(null);`,
  `  const [name, setName] = useState('');\n  const [file, setFile] = useState<File | null>(null);\n  const [csvFile, setCsvFile] = useState<File | null>(null);\n  const [cardImportResult, setCardImportResult] = useState<CardBulkImportResult | null>(null);`,
);
patch(
  'apps/web/src/pages/OwnerSettingsPage.tsx',
  `  const remove = useMutation({\n    mutationFn: deleteOwnerDefaultShield,\n    onSuccess: async () => {\n      await Promise.all([\n        queryClient.invalidateQueries({ queryKey: ['owner', 'default-shields'] }),\n        queryClient.invalidateQueries({ queryKey: ['default-shields'] }),\n      ]);\n    },\n  });`,
  `  const remove = useMutation({\n    mutationFn: deleteOwnerDefaultShield,\n    onSuccess: async () => {\n      await Promise.all([\n        queryClient.invalidateQueries({ queryKey: ['owner', 'default-shields'] }),\n        queryClient.invalidateQueries({ queryKey: ['default-shields'] }),\n      ]);\n    },\n  });\n\n  const cardImport = useMutation({\n    mutationFn: () => {\n      if (!csvFile) throw new Error('CSV_REQUIRED');\n      return bulkImportCards(csvFile);\n    },\n    onSuccess: (result) => {\n      setCardImportResult(result);\n      setCsvFile(null);\n    },\n  });`,
);

const ownerUiMarker = `        <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">\n          <div className="flex items-center justify-between gap-3">\n            <div><p className="text-xs font-black uppercase tracking-wider text-[#073B8C]">Galeria global</p><h2 className="mt-1 text-xl font-black">Escudos disponíveis</h2></div>`;
const ownerUiReplacement = `        <section className="mt-5 rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-blue-50 p-5 shadow-md shadow-amber-100/40">\n          <div className="flex items-start gap-3">\n            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700"><FileSpreadsheet className="h-6 w-6" /></span>\n            <div>\n              <p className="text-xs font-black uppercase tracking-wider text-amber-700">Cartas · Importação em massa</p>\n              <h2 className="mt-1 text-xl font-black">Importar CSV</h2>\n              <p className="mt-1 text-sm font-medium leading-6 text-slate-500">Envie até 5.000 cartas por arquivo. Duplicatas de número são ignoradas automaticamente.</p>\n            </div>\n          </div>\n\n          <div className="mt-4 rounded-2xl border border-slate-200 bg-white/85 p-3 text-[11px] font-bold leading-5 text-slate-500">\n            <p className="font-black text-slate-700">Colunas obrigatórias</p>\n            <p className="mt-1 break-words">cardNumber, name, rarity, boostType, boostValue, imageUrl</p>\n            <p className="mt-1">Opcional: <span className="font-black">albumPage</span>. Sem ela, as cartas entram na página “Importadas”. imageUrl pode ficar vazia.</p>\n          </div>\n\n          <label className="mt-4 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-amber-300 bg-white px-4 text-sm font-black text-amber-800">\n            <FileSpreadsheet className="h-5 w-5" />\n            <span className="max-w-[75%] truncate">{csvFile ? csvFile.name : 'Escolher arquivo CSV'}</span>\n            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { setCsvFile(event.target.files?.[0] ?? null); setCardImportResult(null); }} />\n          </label>\n\n          {cardImport.isError && <p className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">{cardImportError(cardImport.error)}</p>}\n          {cardImportResult && <p className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">Importação concluída: {cardImportResult.imported} novas, {cardImportResult.skippedDuplicates} duplicadas ignoradas, {cardImportResult.processed} processadas.</p>}\n\n          <button type="button" disabled={!csvFile || cardImport.isPending} onClick={() => cardImport.mutate()} className="mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 px-4 font-black text-amber-950 shadow-md disabled:opacity-40">\n            {cardImport.isPending ? <GlobalLoader mode="inline" label="Importando…" /> : <><FileSpreadsheet className="h-5 w-5" />Importar CSV</>}\n          </button>\n          <p className="mt-3 text-center text-[11px] font-semibold text-slate-400">Artes podem ser enviadas no bucket público <span className="font-black">cards-assets</span> do Supabase e a URL pública colocada no CSV.</p>\n        </section>\n\n${ownerUiMarker}`;
patch('apps/web/src/pages/OwnerSettingsPage.tsx', ownerUiMarker, ownerUiReplacement);

patch(
  'apps/web/src/pages/OwnerSettingsPage.tsx',
  `function ownerUploadError(error: unknown): string {`,
  `function cardImportError(error: unknown): string {\n  if (!(error instanceof ApiError)) return 'Não foi possível importar o CSV.';\n  const details = error.details as { message?: string } | undefined;\n  return details?.message ?? (error.code === 'ADMIN_ONLY' ? 'Esta ação é exclusiva de administradores.' : 'Falha ao importar o CSV.');\n}\n\nfunction ownerUploadError(error: unknown): string {`,
);

patch(
  'apps/web/src/pages/AlbumPage.tsx',
  `function CardArtwork({ card }: { card: AlbumCard }) {`,
  `function CardArtwork({ card }: { card: Pick<AlbumCard, 'imageUrl' | 'name'> }) {`,
);
patch(
  'apps/web/src/pages/AlbumPage.tsx',
  `{card.imageUrl ? <img src={card.imageUrl} alt={card.name} className="h-full w-full rounded-[1.1rem] object-cover" /> : <div className="grid h-full place-items-center rounded-[1.1rem] bg-white/15 p-3 text-center"><p className="text-sm font-black">{card.name}</p></div>}`,
  `<CardArtwork card={card} />`,
);

console.log('Phase 8 admin patches applied.');
