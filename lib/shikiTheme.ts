// Syntax theme built from the app's brand palette (blue primary, pink, green,
// orange). The background is transparent so the highlighted <pre> shows through
// onto whichever surface the editor sits on. Tuned for the dark UI.
//
// Typed loosely because Shiki's strict ThemeRegistrationRaw requires `settings`,
// but the VS Code-style `tokenColors` form is what actually applies our scopes.
export const keepPaletteTheme = {
  name: "keep-palette",
  type: "dark" as const,
  colors: {
    "editor.foreground": "#ececee",
    "editor.background": "#00000000",
  },
  // Uses the lighter end of each palette ramp so code reads softly on the dark UI.
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#717179", fontStyle: "italic" } },
    {
      scope: ["keyword", "storage", "storage.type", "storage.modifier", "keyword.control", "keyword.operator.new", "constant.language", "variable.language"],
      settings: { foreground: "#fb70a1" },
    },
    { scope: ["entity.name.tag", "keyword.operator.expression"], settings: { foreground: "#fb4082" } },
    {
      scope: ["string", "string.quoted", "string.template", "punctuation.definition.string", "constant.other.symbol"],
      settings: { foreground: "#b7fc71" },
    },
    { scope: ["constant.numeric", "constant", "constant.character", "support.constant", "keyword.other.unit"], settings: { foreground: "#ffd272" } },
    { scope: ["entity.name.function", "support.function", "meta.function-call.generic", "variable.function"], settings: { foreground: "#7c9df5" } },
    { scope: ["entity.name.type", "entity.name.class", "support.type", "support.class", "entity.other.inherited-class"], settings: { foreground: "#9ffc41" } },
    { scope: ["entity.other.attribute-name", "variable.parameter"], settings: { foreground: "#ffd272" } },
    { scope: ["variable", "variable.other", "meta.definition.variable", "support.variable"], settings: { foreground: "#ececee" } },
    { scope: ["punctuation", "meta.brace", "meta.delimiter", "keyword.operator"], settings: { foreground: "#8f8f98" } },
    { scope: ["markup.heading", "entity.name.section"], settings: { foreground: "#7c9df5", fontStyle: "bold" } },
    { scope: ["markup.bold"], settings: { foreground: "#ffd272", fontStyle: "bold" } },
    { scope: ["markup.italic"], settings: { foreground: "#b7fc71", fontStyle: "italic" } },
    { scope: ["markup.inline.raw", "markup.fenced_code"], settings: { foreground: "#9ffc41" } },
    { scope: ["markup.underline.link", "string.other.link"], settings: { foreground: "#7c9df5" } },
  ],
};
