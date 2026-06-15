// Heuristic language detection shared by the syntax-highlighting editor and the
// note "Get Info" pane. detectCodeLanguage returns a language only when there's
// a real code signal (null otherwise); detectLanguage falls back to markdown so
// the highlighter always has something to render.

export const COMMON_LANGS = [
  "markdown", "bash", "shell", "javascript", "typescript", "python",
  "json", "yaml", "html", "css", "go", "rust", "java", "c", "cpp",
  "sql", "ruby", "php", "swift", "kotlin", "toml", "dockerfile",
  "xml", "graphql", "tsx", "jsx",
];

const LABELS: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  tsx: "TypeScript (TSX)",
  jsx: "JavaScript (JSX)",
  python: "Python",
  json: "JSON",
  yaml: "YAML",
  html: "HTML",
  css: "CSS",
  go: "Go",
  rust: "Rust",
  java: "Java",
  c: "C",
  cpp: "C++",
  sql: "SQL",
  ruby: "Ruby",
  php: "PHP",
  swift: "Swift",
  kotlin: "Kotlin",
  toml: "TOML",
  dockerfile: "Dockerfile",
  xml: "XML",
  graphql: "GraphQL",
  bash: "Shell",
  shell: "Shell",
  perl: "Perl",
  markdown: "Markdown",
};

export function languageLabel(lang: string): string {
  return LABELS[lang] ?? lang.charAt(0).toUpperCase() + lang.slice(1);
}

/** Returns a programming/markup language when the body clearly is code, else null. */
export function detectCodeLanguage(code: string): string | null {
  const lines = code.split("\n");
  const first = lines[0]?.trim() ?? "";
  if (!first) return null;

  if (first.startsWith("#!")) {
    if (/python/.test(first)) return "python";
    if (/node|deno|bun/.test(first)) return "javascript";
    if (/bash|\/sh|zsh/.test(first)) return "bash";
    if (/ruby/.test(first)) return "ruby";
    if (/perl/.test(first)) return "perl";
  }

  if (first === "{" || first === "[") {
    try { JSON.parse(code); return "json"; } catch { /* not json */ }
  }

  if (first.startsWith("---") && lines.length > 1 && /^\w+:\s/.test(lines[1] ?? ""))
    return "yaml";

  if (/^<(!DOCTYPE|html|div|span|head|body|script|style)\b/i.test(first)) return "html";
  if (/^<\?xml/.test(first)) return "xml";

  if (/^(import|export)\s/.test(first) && /from\s+['"]/.test(first)) return "typescript";
  if (/^(const|let|var|function|class|interface|type)\s/.test(first)) return "typescript";
  if (/^(import|from)\s/.test(first) || /^def\s|^class\s/.test(first))
    return "python";
  if (/^(package\s|func\s|import\s+\()/.test(first)) return "go";
  if (/^(use\s|fn\s|pub\s|mod\s|struct\s|impl\s|let\s+mut\s)/.test(first)) return "rust";
  if (/^(public|private|protected)\s+(class|static|void|int|String)/.test(first)) return "java";
  if (/^#include\s/.test(first) || /^int\s+main\s*\(/.test(first)) return "cpp";
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/i.test(first)) return "sql";
  if (/^(FROM|RUN|CMD|COPY|EXPOSE|WORKDIR|ENTRYPOINT)\s/.test(first)) return "dockerfile";
  if (/^\[[\w.-]+\]\s*$/.test(first)) return "toml";

  if (/^(sudo|apt|brew|npm|pip|curl|wget|chmod|chown|mkdir|cd|ls|cat|echo|export|source|tar|scp|rsync|gpg|ssh|git|docker|rm|cp|mv|touch|grep|sed|awk|find)\s/.test(first))
    return "bash";

  return null;
}

/** Like detectCodeLanguage but always returns something for the highlighter. */
export function detectLanguage(code: string): string {
  const first = code.split("\n")[0]?.trim() ?? "";
  // Markdown cues take priority for the highlighter (headings, fences, links).
  if (/^#{1,6}\s/.test(first) || /```/.test(code) || /^\*\*\w/.test(code) || /^\[.*\]\(/.test(code))
    return "markdown";
  return detectCodeLanguage(code) ?? "markdown";
}
