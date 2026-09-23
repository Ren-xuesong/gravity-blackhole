import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const source = new URL('third-party/ghostty-blackhole-LICENSE.txt', root);
const destination = new URL('dist/licenses/ghostty-blackhole-MIT.txt', root);
mkdirSync(fileURLToPath(new URL('dist/licenses/', root)), { recursive: true });
copyFileSync(fileURLToPath(source), fileURLToPath(destination));
copyFileSync(fileURLToPath(new URL('node_modules/mathjax-full/LICENSE',root)),fileURLToPath(new URL('dist/licenses/MathJax-Apache-2.0.txt',root)));
