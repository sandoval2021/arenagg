import fs from 'node:fs';
const file = 'scripts/patch-mobile-pwa-hotfix.mjs';
let content = fs.readFileSync(file, 'utf8');

function replaceRequired(before, after, label) {
  if (!content.includes(before) && !content.includes(after)) throw new Error(`${label} target not found`);
  content = content.replace(before, after);
}

replaceRequired(
  `  \`className=\"px-3 py-3 text-center\`,\n  \`className=\"px-2 py-2 text-center sm:px-3 sm:py-3\`,\n  6,`,
  `  \`className=\"px-3 py-3 text-center\`,\n  \`className=\"px-2 py-2 text-center sm:px-3 sm:py-3\`,\n  5,`,
  'Standings compact-cell count',
);

replaceRequired(
  `  \`h-10 w-10 shrink-0 rounded-xl\`,\n  \`h-8 w-8 shrink-0 rounded-lg sm:h-10 sm:w-10 sm:rounded-xl\`,\n  2,`,
  `  \`h-10 w-10 shrink-0 rounded-xl\`,\n  \`h-8 w-8 shrink-0 rounded-lg sm:h-10 sm:w-10 sm:rounded-xl\`,\n  1,`,
  'Standings team-logo count',
);

fs.writeFileSync(file, content);
