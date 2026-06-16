// Capture a short clip (+ frames) of the sidebar selection animation, for
// attaching an animated demo to a PR / commit.
//
// IMPORTANT: running `next dev` in the main checkout shares `.next` with any
// other dev server and corrupts it. Capture from an isolated git worktree:
//
//   git worktree add -f /tmp/keep-capture main
//   ln -s "$(pwd)/node_modules" /tmp/keep-capture/node_modules
//   cp .env.local /tmp/keep-capture/.env.local      # optional, for a clean boot
//   (cd /tmp/keep-capture && PORT=3005 npm run dev &)
//   npx --yes playwright install ffmpeg             # one-time, for video
//   node scripts/capture-anim.mjs http://localhost:3005 /tmp/keep-anim
//
// Outputs a .webm plus scratch frame-start/mid/settled.png into <outDir> (kept
// in /tmp, not committed). The raw capture usually carries a few partly-painted
// "gray" frames at load/teardown — run the cleaner before committing, then keep
// only the cleaned .webm under screenshots/pr/:
//
//   scripts/clean-anim.sh /tmp/keep-anim/<file>.webm screenshots/pr/<name>.webm
//
// Clean up the worktree afterwards:
//   git worktree remove --force /tmp/keep-capture
import { chromium } from "playwright-core";

const url = (process.argv[2] || "http://localhost:3005").replace(/\/$/, "");
const outDir = process.argv[3] || "/tmp/keep-anim";
const now = Date.now();
const day = 86400_000;

const note = (id, body, extra = {}) => ({
  id, title: "", summary: null, color: null, body,
  pinned: false, archived: false, trashed: false, markdown: false, highlight: false,
  tags: [], shareToken: null, createdAt: now, updatedAt: now, ...extra,
});

const ids = ["an000001", "an000002", "an000003", "an000004", "an000005", "an000006"];
const bodies = [
  "export function greet(name) {\n  return `Hi ${name}`;\n}",
  "# Weekend project\n\n- [ ] sketch the api",
  "Reading list\n- Designing Data-Intensive Applications",
  "SELECT * FROM notes WHERE pinned = true;",
  "Grocery list\nCoffee, oats, lemons",
  "Ideas\n- springy selection\n- in-place switch",
];
const colors = ["green", "orange", "pink", "red", "blue", "yellow"];
const guestNotes = ids.map((id, i) =>
  note(id, bodies[i], { color: colors[i], highlight: i === 0, markdown: i === 1, updatedAt: now - i * day }),
);

// Render at 2x and record at a large size so the clip is crisp (Playwright
// otherwise scales the video down to fit 800x800).
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
  recordVideo: { dir: outDir, size: { width: 1600, height: 1000 } },
});
await ctx.addInitScript((d) => {
  localStorage.setItem("keep.guestNotes.v1", d);
  localStorage.setItem("keep.shortcutsSeen", "1");
  localStorage.setItem("theme", "dark");
}, JSON.stringify(guestNotes));

const page = await ctx.newPage();
const clip = { x: 0, y: 0, width: 440, height: 760 };
await page.goto(`${url}/note/${ids[0]}`, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${outDir}/frame-start.png`, clip });

// Slow, deliberate pacing so each slide + settle is easy to watch.
for (const i of [4, 1, 5, 2, 0]) {
  await page.locator(`[data-note-id="${ids[i]}"] button`).first().click();
  await page.waitForTimeout(1700);
}
await page.locator(`[data-note-id="${ids[3]}"] button`).first().click();
await page.waitForTimeout(120);
await page.screenshot({ path: `${outDir}/frame-mid.png`, clip });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/frame-settled.png`, clip });

await page.close();
await ctx.close(); // flush the video
await browser.close();
console.log(`captured clip + frames to ${outDir}`);
