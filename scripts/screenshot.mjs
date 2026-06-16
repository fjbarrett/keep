// Capture a screenshot of the deployed app with seeded guest data and a code
// note open (showing syntax highlighting) so the README image demonstrates a
// real feature rather than the empty guest state. Archives it under
// screenshots/ and refreshes docs/screenshot.png.
//
// Usage: node scripts/screenshot.mjs [url]
import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const url = (process.argv[2] || process.env.KEEP_URL || "https://keeptxt.com").replace(/\/$/, "");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_ID = "deec0de1";
const now = Date.now();
const day = 86400_000;

const note = (id, body, extra = {}) => ({
  id, title: "", summary: null, color: null, body,
  pinned: false, archived: false, trashed: false, markdown: false, highlight: false,
  tags: [], shareToken: null, createdAt: now, updatedAt: now, ...extra,
});

// Generic sample content only — this ships in a public README, so nothing here
// should resemble a real user's notes. Newest first; the code note is opened.
const guestNotes = [
  note(DEMO_ID, `export function greet(name: string): string {\n  const hour = new Date().getHours();\n  const part = hour < 12 ? "morning" : "evening";\n  return \`Good \${part}, \${name}!\`;\n}\n\nconst message = greet("world");\nconsole.log(message);`, { highlight: true, color: "green", updatedAt: now }),
  note("a1b2c3d4", "Reading list\n- The Pragmatic Programmer\n- Designing Data-Intensive Applications\n- A Philosophy of Software Design", { color: "pink", pinned: true, updatedAt: now - day }),
  note("b2c3d4e5", "Release notes\n\nColor labels and vanity share links shipped this week. Split view and image uploads are next.", { color: "orange", updatedAt: now - 2 * day }),
  note("c3d4e5f6", "# Weekend project\n\n- [x] Pick a name\n- [ ] Sketch the API\n- [ ] Wire up storage", { color: "blue", markdown: true, updatedAt: now - 5 * day }),
  note("d4e5f6a7", "Grocery list\nCoffee, oats, olive oil, lemons, a good loaf of bread", { updatedAt: now - 20 * day }),
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript((data) => {
  localStorage.setItem("keep.guestNotes.v1", data);
  localStorage.setItem("keep.shortcutsSeen", "1"); // don't auto-open the shortcuts sheet
  localStorage.setItem("theme", "dark"); // the app's signature dark theme
}, JSON.stringify(guestNotes));

const page = await ctx.newPage();
await page.goto(`${url}/note/${DEMO_ID}`, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000); // let Shiki paint + the entrance animation settle

const ts = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
fs.mkdirSync(path.join(root, "screenshots"), { recursive: true });
const archive = path.join(root, "screenshots", `keep-${ts}.png`);
await page.screenshot({ path: archive });
fs.copyFileSync(archive, path.join(root, "docs", "screenshot.png"));
await browser.close();
console.log(`Archived ${archive} and refreshed docs/screenshot.png`);
