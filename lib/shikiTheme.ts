// Syntax themes built from the app's brand palette. Two variants so code stays
// readable in both UI themes: lighter tones on the dark editor, darker
// saturated tones on the light editor. Backgrounds are transparent so the
// highlighted <pre> shows through onto the editor surface.

function theme(name: string, type: "dark" | "light", fg: string, c: Record<string, string>) {
  return {
    name,
    type,
    colors: { "editor.foreground": fg, "editor.background": "#00000000" },
    tokenColors: [
      { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: c.comment, fontStyle: "italic" } },
      {
        scope: ["keyword", "storage", "storage.type", "storage.modifier", "keyword.control", "keyword.operator.new", "constant.language", "variable.language"],
        settings: { foreground: c.keyword },
      },
      { scope: ["entity.name.tag", "keyword.operator.expression"], settings: { foreground: c.tag } },
      {
        scope: ["string", "string.quoted", "string.template", "punctuation.definition.string", "constant.other.symbol"],
        settings: { foreground: c.string },
      },
      { scope: ["constant.numeric", "constant", "constant.character", "support.constant", "keyword.other.unit"], settings: { foreground: c.constant } },
      { scope: ["entity.name.function", "support.function", "meta.function-call.generic", "variable.function"], settings: { foreground: c.func } },
      { scope: ["entity.name.type", "entity.name.class", "support.type", "support.class", "entity.other.inherited-class"], settings: { foreground: c.type } },
      { scope: ["entity.other.attribute-name", "variable.parameter"], settings: { foreground: c.attr } },
      { scope: ["variable", "variable.other", "meta.definition.variable", "support.variable"], settings: { foreground: fg } },
      { scope: ["punctuation", "meta.brace", "meta.delimiter", "keyword.operator"], settings: { foreground: c.punct } },
      { scope: ["markup.heading", "entity.name.section"], settings: { foreground: c.func, fontStyle: "bold" } },
      { scope: ["markup.bold"], settings: { foreground: c.constant, fontStyle: "bold" } },
      { scope: ["markup.italic"], settings: { foreground: c.string, fontStyle: "italic" } },
      { scope: ["markup.inline.raw", "markup.fenced_code"], settings: { foreground: c.string } },
      { scope: ["markup.underline.link", "string.other.link"], settings: { foreground: c.type } },
    ],
  };
}

// Lighter palette tones — read softly on the dark editor.
export const keepPaletteThemeDark = theme("keep-palette-dark", "dark", "#ececee", {
  comment: "#717179",
  keyword: "#fb70a1",
  tag: "#fb4082",
  string: "#b7fc71",
  constant: "#ffd272",
  func: "#7c9df5",
  type: "#9ffc41",
  attr: "#ffd272",
  punct: "#8f8f98",
});

// Darker, saturated palette tones — readable on the light editor background.
export const keepPaletteThemeLight = theme("keep-palette-light", "light", "#211f1b", {
  comment: "#8a857a",
  keyword: "#c2185b",
  tag: "#ad1457",
  string: "#2e7d00",
  constant: "#b36b00",
  func: "#1565c0",
  type: "#00695c",
  attr: "#b36b00",
  punct: "#6e6a61",
});
