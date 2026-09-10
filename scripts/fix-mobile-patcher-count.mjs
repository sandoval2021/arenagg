import fs from 'node:fs';
const file = 'scripts/patch-mobile-pwa-hotfix.mjs';
let content = fs.readFileSync(file, 'utf8');
const needle = `  \`className=\"px-3 py-3 text-center\`,\n  \`className=\"px-2 py-2 text-center sm:px-3 sm:py-3\`,\n  6,`;
const replacement = `  \`className=\"px-3 py-3 text-center\`,\n  \`className=\"px-2 py-2 text-center sm:px-3 sm:py-3\`,\n  5,`;
if (!content.includes(needle) && !content.includes(replacement)) throw new Error('Standings compact-cell count target not found');
content = content.replace(needle, replacement);
fs.writeFileSync(file, content);
