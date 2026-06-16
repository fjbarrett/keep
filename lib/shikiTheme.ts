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

// The accent palette (blue/purple/pink/red/orange/yellow/green/graphite),
// lightened for legibility on the dark editor.
export const keepPaletteThemeDark = theme("keep-palette-dark", "dark", "#ececee", {
  comment: "#8b8b94", // graphite
  keyword: "#b08bf0", // purple
  tag: "#f76aa6", // pink
  string: "#5cc47d", // green
  constant: "#f7a052", // orange
  func: "#6e94f5", // blue
  type: "#eab534", // yellow
  attr: "#f7a052", // orange
  punct: "#9a9aa2", // graphite
});

// The same accent hues, darkened for legibility on the light editor background.
export const keepPaletteThemeLight = theme("keep-palette-light", "light", "#211f1b", {
  comment: "#6e6a61", // graphite
  keyword: "#7b3fd0", // purple
  tag: "#c61f6e", // pink
  string: "#2e8b50", // green
  constant: "#bf6a14", // orange
  func: "#1e4fd0", // blue
  type: "#9a7a0a", // yellow
  attr: "#bf6a14", // orange
  punct: "#6e6a61", // graphite
});
