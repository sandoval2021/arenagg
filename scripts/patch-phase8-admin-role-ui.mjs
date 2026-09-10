import fs from 'node:fs';

function replaceOrThrow(path, before, after) {
  let content = fs.readFileSync(path, 'utf8');
  if (content.includes(after)) return;
  if (!content.includes(before)) throw new Error(`Patch target not found in ${path}`);
  content = content.replace(before, after);
  fs.writeFileSync(path, content);
}

replaceOrThrow(
  'apps/web/src/pages/OwnerSettingsPage.tsx',
  `  const isOwner = auth.user?.email?.trim().toLowerCase() === PLATFORM_OWNER_EMAIL;`,
  `  const isAdmin = auth.user?.role === 'ADMIN' || auth.user?.email?.trim().toLowerCase() === PLATFORM_OWNER_EMAIL;`,
);
replaceOrThrow(
  'apps/web/src/pages/OwnerSettingsPage.tsx',
  `    enabled: isOwner,`,
  `    enabled: isAdmin,`,
);
replaceOrThrow(
  'apps/web/src/pages/OwnerSettingsPage.tsx',
  `  if (!isOwner) {`,
  `  if (!isAdmin) {`,
);
replaceOrThrow(
  'apps/web/src/pages/OwnerSettingsPage.tsx',
  `<h1 className="mt-4 text-xl font-black">Área do proprietário</h1>\n          <p className="mt-2 text-sm font-medium text-slate-500">Esta configuração geral é exclusiva do proprietário do Chavea.</p>`,
  `<h1 className="mt-4 text-xl font-black">Área administrativa</h1>\n          <p className="mt-2 text-sm font-medium text-slate-500">Esta configuração geral é exclusiva de administradores do Chavea.</p>`,
);
replaceOrThrow(
  'apps/web/src/pages/OwnerSettingsPage.tsx',
  `<p className="text-[10px] font-black uppercase tracking-[.18em] text-[#073B8C]">Proprietário Chavea</p>`,
  `<p className="text-[10px] font-black uppercase tracking-[.18em] text-[#073B8C]">Admin Chavea</p>`,
);

replaceOrThrow(
  'apps/web/src/pages/ProfilePage.tsx',
  `  const isOwner = auth.user?.email?.trim().toLowerCase() === PLATFORM_OWNER_EMAIL;`,
  `  const isAdmin = auth.user?.role === 'ADMIN' || auth.user?.email?.trim().toLowerCase() === PLATFORM_OWNER_EMAIL;`,
);
replaceOrThrow(
  'apps/web/src/pages/ProfilePage.tsx',
  `{isOwner && <Link to="/owner/settings"`,
  `{isAdmin && <Link to="/owner/settings"`,
);
replaceOrThrow(
  'apps/web/src/pages/ProfilePage.tsx',
  `<span className="block text-xs font-black uppercase tracking-wider text-blue-500">Proprietário</span>`,
  `<span className="block text-xs font-black uppercase tracking-wider text-blue-500">Admin</span>`,
);

console.log('Admin role UI patches applied.');
