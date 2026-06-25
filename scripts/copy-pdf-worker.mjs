// Copy pdfjs's worker into public/ so it's served same-origin and untouched by
// the bundler (Terser chokes on the worker's import.meta). Runs before dev/build
// so it always matches the installed pdfjs-dist version; the copy is gitignored.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const src = "node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
const dest = "public/pdf.worker.min.mjs";

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`copied pdf worker -> ${dest}`);
