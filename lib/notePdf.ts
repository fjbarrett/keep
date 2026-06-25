import type { jsPDF } from "jspdf";
import type { Token, Tokens } from "marked";

/**
 * Renders Markdown tokens (from `marked`'s lexer) to a jsPDF document with real
 * typographic formatting — headings, bold/italic, lists, blockquotes, code,
 * links and tables — rather than dumping the raw `#`/`*` syntax as plain text.
 *
 * The type is set in Helvetica (jsPDF's built-in standard font, the closest
 * freely-embeddable match to Helvetica Neue) with Courier for code. Everything
 * is laid out by hand because jsPDF's text helpers don't understand styled runs.
 */

// ── Palette (RGB) ─────────────────────────────────────────────────────────
const BODY = [38, 38, 40];
const HEADING = [17, 18, 20];
const MUTED = [122, 124, 132];
const LINK = [43, 96, 242];
const RULE = [228, 229, 233];
const CODE_TEXT = [40, 42, 48];
const CODE_BG = [244, 245, 247];
const QUOTE_BAR = [202, 204, 210];
const TABLE_HEAD_BG = [247, 248, 250];

// ── Metrics (points) ──────────────────────────────────────────────────────
const MARGIN = 64;
const BODY_SIZE = 11;
const CODE_SIZE = 9.5;
const LINE = 1.5; // line-height ratio
const PARA_GAP = 9;
const LIST_GAP = 7;
const LIST_ITEM_GAP = 3;
const CODE_GAP = 10;
const TABLE_GAP = 10;
const HEADING_SIZES = [22, 17, 13.5, 12, 11, 10];

type Style = {
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  del?: boolean;
  link?: string;
};

type Run = { text: string; style: Style; br?: boolean };

type Atom =
  | { type: "word"; text: string; style: Style }
  | { type: "space"; style: Style }
  | { type: "break" };

type Ctx = {
  doc: jsPDF;
  y: number;
  pageW: number;
  pageH: number;
  margin: number;
  textColor: number[];
  paraGap: number;
  first: boolean;
};

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

function decode(s: string): string {
  return s
    .replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function ensure(ctx: Ctx, h: number): void {
  if (ctx.y + h > ctx.pageH - ctx.margin) {
    ctx.doc.addPage();
    ctx.y = ctx.margin;
  }
}

function setFont(doc: jsPDF, style: Style, size: number): void {
  const family = style.mono ? "courier" : "helvetica";
  const variant =
    style.bold && style.italic
      ? "bolditalic"
      : style.bold
        ? "bold"
        : style.italic
          ? "italic"
          : "normal";
  doc.setFont(family, variant);
  doc.setFontSize(style.mono ? size * 0.92 : size);
}

// ── Inline tokens → styled runs → layout atoms ────────────────────────────
function flatten(tokens: Token[], style: Style, out: Run[]): void {
  for (const t of tokens) {
    switch (t.type) {
      case "text": {
        const tt = t as Tokens.Text;
        if (tt.tokens?.length) flatten(tt.tokens, style, out);
        else out.push({ text: decode(tt.text), style });
        break;
      }
      case "escape":
        out.push({ text: decode((t as Tokens.Escape).text), style });
        break;
      case "strong":
        flatten((t as Tokens.Strong).tokens, { ...style, bold: true }, out);
        break;
      case "em":
        flatten((t as Tokens.Em).tokens, { ...style, italic: true }, out);
        break;
      case "del":
        flatten((t as Tokens.Del).tokens, { ...style, del: true }, out);
        break;
      case "codespan":
        out.push({
          text: decode((t as Tokens.Codespan).text),
          style: { ...style, mono: true },
        });
        break;
      case "link": {
        const lt = t as Tokens.Link;
        flatten(lt.tokens, { ...style, link: lt.href }, out);
        break;
      }
      case "br":
        out.push({ text: "", style, br: true });
        break;
      case "image": {
        const it = t as Tokens.Image;
        out.push({ text: decode(it.text || it.href), style: { ...style, italic: true } });
        break;
      }
      default: {
        const g = t as { tokens?: Token[]; text?: string };
        if (g.tokens) flatten(g.tokens, style, out);
        else if (g.text) out.push({ text: decode(g.text), style });
      }
    }
  }
}

function atomize(runs: Run[]): Atom[] {
  const atoms: Atom[] = [];
  for (const r of runs) {
    if (r.br) {
      atoms.push({ type: "break" });
      continue;
    }
    // Collapse soft breaks/runs of whitespace for prose; keep them verbatim for
    // inline code so spacing inside `` `...` `` survives.
    const text = r.style.mono ? r.text : r.text.replace(/\s+/g, " ");
    for (const part of text.split(/( )/)) {
      if (part === "") continue;
      if (part === " ") atoms.push({ type: "space", style: r.style });
      else atoms.push({ type: "word", text: part, style: r.style });
    }
  }
  return atoms;
}

function inlineAtoms(tokens: Token[] | undefined, base: Style): Atom[] {
  const runs: Run[] = [];
  if (tokens) flatten(tokens, base, runs);
  return atomize(runs);
}

// ── Drawing ───────────────────────────────────────────────────────────────
function drawWord(ctx: Ctx, text: string, style: Style, x: number, size: number): void {
  setFont(ctx.doc, style, size);
  const color = style.link ? LINK : ctx.textColor;
  ctx.doc.setTextColor(color[0], color[1], color[2]);
  ctx.doc.text(text, x, ctx.y, { baseline: "top" });
  if (style.link || style.del) {
    const w = ctx.doc.getTextWidth(text);
    const fs = ctx.doc.getFontSize();
    const yy = style.del ? ctx.y + fs * 0.55 : ctx.y + fs * 0.95;
    ctx.doc.setDrawColor(color[0], color[1], color[2]);
    ctx.doc.setLineWidth(0.5);
    ctx.doc.line(x, yy, x + w, yy);
  }
}

/**
 * Word-wraps styled atoms between `leftX` and `rightX`, advancing `ctx.y`. When
 * `draw` is false it only advances the cursor (used to measure heights). When
 * `paginate` is false it never adds a page (used inside a pre-measured row).
 */
function flow(
  ctx: Ctx,
  atoms: Atom[],
  leftX: number,
  rightX: number,
  size: number,
  draw: boolean,
  paginate: boolean,
): void {
  const lineH = size * LINE;
  const avail = rightX - leftX;
  let x = leftX;
  let started = false;
  let pending = 0;
  if (paginate) ensure(ctx, lineH);

  const newline = () => {
    ctx.y += lineH;
    x = leftX;
    started = false;
    pending = 0;
    if (paginate) ensure(ctx, lineH);
  };

  for (const a of atoms) {
    if (a.type === "break") {
      newline();
      continue;
    }
    if (a.type === "space") {
      if (started) {
        setFont(ctx.doc, a.style, size);
        pending += ctx.doc.getTextWidth(" ");
      }
      continue;
    }
    setFont(ctx.doc, a.style, size);
    const w = ctx.doc.getTextWidth(a.text);

    if (w > avail) {
      // A single token wider than the column (e.g. a long URL): break by char.
      if (started) newline();
      let chunk = "";
      for (const ch of a.text) {
        if (chunk && ctx.doc.getTextWidth(chunk + ch) > avail) {
          if (draw) drawWord(ctx, chunk, a.style, x, size);
          newline();
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      if (draw && chunk) drawWord(ctx, chunk, a.style, x, size);
      x += ctx.doc.getTextWidth(chunk);
      started = true;
      pending = 0;
      continue;
    }

    if (started && x + pending + w > rightX) newline();
    if (started) x += pending;
    pending = 0;
    if (draw) drawWord(ctx, a.text, a.style, x, size);
    x += w;
    started = true;
  }
  ctx.y += lineH;
}

function measureHeight(doc: jsPDF, atoms: Atom[], avail: number, size: number): number {
  const lineH = size * LINE;
  let x = 0;
  let started = false;
  let pending = 0;
  let lines = 1;
  for (const a of atoms) {
    if (a.type === "break") {
      lines++;
      x = 0;
      started = false;
      pending = 0;
      continue;
    }
    if (a.type === "space") {
      if (started) {
        setFont(doc, a.style, size);
        pending += doc.getTextWidth(" ");
      }
      continue;
    }
    setFont(doc, a.style, size);
    const w = doc.getTextWidth(a.text);
    if (w > avail) {
      if (started) lines++;
      lines += Math.max(0, Math.ceil(w / avail) - 1);
      x = w % avail;
      started = true;
      pending = 0;
      continue;
    }
    if (started && x + pending + w > avail) {
      lines++;
      x = 0;
      started = false;
      pending = 0;
    }
    if (started) x += pending;
    pending = 0;
    x += w;
    started = true;
  }
  return lines * lineH;
}

// ── Block renderers ───────────────────────────────────────────────────────
function renderHeading(ctx: Ctx, t: Tokens.Heading, leftX: number, rightX: number): void {
  const size = HEADING_SIZES[t.depth - 1] ?? BODY_SIZE;
  if (!ctx.first) ctx.y += t.depth <= 2 ? 16 : 12;
  ensure(ctx, size * LINE);
  ctx.textColor = HEADING;
  flow(ctx, inlineAtoms(t.tokens, { bold: true }), leftX, rightX, size, true, true);
  if (t.depth <= 2) {
    ctx.y += 4;
    ctx.doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    ctx.doc.setLineWidth(t.depth === 1 ? 1 : 0.5);
    ctx.doc.line(leftX, ctx.y, rightX, ctx.y);
    ctx.y += 8;
  } else {
    ctx.y += 5;
  }
}

function renderParagraph(ctx: Ctx, tokens: Token[] | undefined, leftX: number, rightX: number): void {
  ctx.textColor = BODY;
  flow(ctx, inlineAtoms(tokens, {}), leftX, rightX, BODY_SIZE, true, true);
  ctx.y += ctx.paraGap;
}

function renderList(ctx: Ctx, t: Tokens.List, leftX: number, rightX: number): void {
  let index = typeof t.start === "number" ? t.start : 1;
  const prevGap = ctx.paraGap;
  ctx.paraGap = LIST_ITEM_GAP;
  for (const item of t.items) {
    const gutter = t.ordered ? 22 : 16;
    const marker = item.task ? (item.checked ? "[x]" : "[ ]") : t.ordered ? `${index}.` : "•";
    ensure(ctx, BODY_SIZE * LINE);
    setFont(ctx.doc, {}, BODY_SIZE);
    ctx.doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    ctx.doc.text(marker, leftX, ctx.y, { baseline: "top" });
    renderBlocks(ctx, item.tokens, leftX + gutter);
    index++;
  }
  ctx.paraGap = prevGap;
  ctx.y += LIST_GAP;
}

function renderQuote(ctx: Ctx, t: Tokens.Blockquote, leftX: number): void {
  ctx.y += 4;
  const innerLeft = leftX + 14;
  const startY = ctx.y;
  const startPage = ctx.doc.getNumberOfPages();
  const prevColor = ctx.textColor;
  const prevGap = ctx.paraGap;
  ctx.textColor = MUTED;
  ctx.paraGap = 6;
  renderBlocks(ctx, t.tokens, innerLeft);
  ctx.textColor = prevColor;
  ctx.paraGap = prevGap;
  if (ctx.doc.getNumberOfPages() === startPage) {
    ctx.doc.setFillColor(QUOTE_BAR[0], QUOTE_BAR[1], QUOTE_BAR[2]);
    ctx.doc.rect(leftX, startY, 3, Math.max(0, ctx.y - startY - 6), "F");
  }
  ctx.y += 6;
}

function renderCode(ctx: Ctx, t: Tokens.Code, leftX: number, rightX: number): void {
  ctx.y += 4;
  const size = CODE_SIZE;
  const lineH = size * 1.45;
  const padX = 10;
  const padY = 8;
  setFont(ctx.doc, { mono: true }, size);
  const charW = ctx.doc.getTextWidth("0");
  const maxChars = Math.max(1, Math.floor((rightX - leftX - padX * 2) / charW));

  const lines: string[] = [];
  for (const raw of t.text.replace(/\n$/, "").split("\n")) {
    if (raw.length <= maxChars) lines.push(raw);
    else for (let i = 0; i < raw.length; i += maxChars) lines.push(raw.slice(i, i + maxChars));
  }

  const band = (h: number) => {
    ctx.doc.setFillColor(CODE_BG[0], CODE_BG[1], CODE_BG[2]);
    ctx.doc.rect(leftX, ctx.y, rightX - leftX, h, "F");
  };

  ensure(ctx, padY + lineH);
  band(padY);
  ctx.y += padY;
  for (const line of lines) {
    ensure(ctx, lineH);
    band(lineH);
    if (line) {
      setFont(ctx.doc, { mono: true }, size);
      ctx.doc.setTextColor(CODE_TEXT[0], CODE_TEXT[1], CODE_TEXT[2]);
      ctx.doc.text(line, leftX + padX, ctx.y + (lineH - size * 0.92) / 2, { baseline: "top" });
    }
    ctx.y += lineH;
  }
  band(padY);
  ctx.y += padY + CODE_GAP;
}

function renderHr(ctx: Ctx, leftX: number, rightX: number): void {
  ctx.y += 8;
  ensure(ctx, 8);
  ctx.doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
  ctx.doc.setLineWidth(0.5);
  ctx.doc.line(leftX, ctx.y, rightX, ctx.y);
  ctx.y += 12;
}

function renderTable(ctx: Ctx, t: Tokens.Table, leftX: number, rightX: number): void {
  ctx.y += 4;
  const cols = t.header.length;
  if (!cols) return;
  const colW = (rightX - leftX) / cols;
  const padX = 6;
  const padY = 5;

  const drawRow = (cells: Tokens.TableCell[], header: boolean) => {
    const cellAtoms = cells.map((c) => inlineAtoms(c.tokens, header ? { bold: true } : {}));
    let rowH = BODY_SIZE * LINE;
    for (const atoms of cellAtoms) {
      rowH = Math.max(rowH, measureHeight(ctx.doc, atoms, colW - padX * 2, BODY_SIZE));
    }
    rowH += padY * 2;
    ensure(ctx, rowH);
    const top = ctx.y;
    if (header) {
      ctx.doc.setFillColor(TABLE_HEAD_BG[0], TABLE_HEAD_BG[1], TABLE_HEAD_BG[2]);
      ctx.doc.rect(leftX, top, colW * cols, rowH, "F");
    }
    ctx.textColor = header ? HEADING : BODY;
    cellAtoms.forEach((atoms, i) => {
      const cx = leftX + i * colW;
      ctx.y = top + padY;
      flow(ctx, atoms, cx + padX, cx + colW - padX, BODY_SIZE, true, false);
    });
    ctx.y = top + rowH;
    ctx.doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    ctx.doc.setLineWidth(0.5);
    ctx.doc.line(leftX, ctx.y, leftX + colW * cols, ctx.y);
  };

  drawRow(t.header, true);
  for (const row of t.rows) drawRow(row, false);
  ctx.y += TABLE_GAP;
}

function renderBlocks(ctx: Ctx, tokens: Token[], leftX: number): void {
  const rightX = ctx.pageW - ctx.margin;
  for (const t of tokens) {
    switch (t.type) {
      case "space":
        break;
      case "heading":
        renderHeading(ctx, t as Tokens.Heading, leftX, rightX);
        break;
      case "paragraph":
        renderParagraph(ctx, (t as Tokens.Paragraph).tokens, leftX, rightX);
        break;
      case "text":
        renderParagraph(ctx, (t as Tokens.Text).tokens, leftX, rightX);
        break;
      case "list":
        renderList(ctx, t as Tokens.List, leftX, rightX);
        break;
      case "blockquote":
        renderQuote(ctx, t as Tokens.Blockquote, leftX);
        break;
      case "code":
        renderCode(ctx, t as Tokens.Code, leftX, rightX);
        break;
      case "hr":
        renderHr(ctx, leftX, rightX);
        break;
      case "table":
        renderTable(ctx, t as Tokens.Table, leftX, rightX);
        break;
      default:
        break;
    }
    ctx.first = false;
  }
}

/** Renders lexed Markdown tokens onto an existing jsPDF document. */
export function renderMarkdownPdf(doc: jsPDF, tokens: Token[]): void {
  const ctx: Ctx = {
    doc,
    y: MARGIN,
    pageW: doc.internal.pageSize.getWidth(),
    pageH: doc.internal.pageSize.getHeight(),
    margin: MARGIN,
    textColor: BODY,
    paraGap: PARA_GAP,
    first: true,
  };
  renderBlocks(ctx, tokens, MARGIN);
}
