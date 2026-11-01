// Assembles the public Grok Bot Wallpaper site into one folder: the landing page at its root, the live wallpaper at
// face/ with its demo data next to it. The same tree goes to GitHub Pages (.github/workflows/pages.yml) and to
// https://0xcodila.com/grokbot-wallpaper/ (rea-home/scripts/deploy.mjs). Only these files go out: no journal, keys or
// source art. A new file the wallpaper needs is added here, once, for both sites.
//   node landing/assemble.mjs <out-dir>
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..');
const out = path.resolve(process.argv[2] || '_site');
const parts = [
  // [from, to, which files]
  ['landing', '.', /^(index\.html|icon\.png|og\.png)$/],
  ['landing/fonts', 'fonts', /\.woff2$/],
  ['landing/media', 'media', /\.(mp4|jpg)$/],
  ['web/face', 'face', /^(index\.html|face\.css|face\.js)$/],
  ['assets/face', 'assets/face', /^(sphere(-black)?\.png|eye-.+\.png|eyes\.json|grain\.png)$/],
  ['assets/blobs/thumbs', 'assets/blobs/thumbs', /\.png$/],
  ['web/data', 'data', /^demo-(state|looks)\.json$/],
];

let total = 0;
for (const [from, to, keep] of parts) {
  const src = path.join(repo, from), dst = path.join(out, to);
  const files = fs.existsSync(src) ? fs.readdirSync(src).filter((f) => keep.test(f)) : [];
  if (!files.length) throw new Error(`nothing to copy from ${from}/ (expected ${keep})`);
  fs.mkdirSync(dst, { recursive: true });
  for (const f of files) fs.copyFileSync(path.join(src, f), path.join(dst, f));
  total += files.length;
}
console.log(`assembled ${total} files into ${out}`);
