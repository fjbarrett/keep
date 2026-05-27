"use client";

import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from "react";
import { createHighlighter, type Highlighter } from "shiki";

const COMMON_LANGS = [
  "markdown", "bash", "shell", "javascript", "typescript", "python",
  "json", "yaml", "html", "css", "go", "rust", "java", "c", "cpp",
  "sql", "ruby", "php", "swift", "kotlin", "toml", "dockerfile",
  "xml", "graphql", "tsx", "jsx",
];

let highlighterPromise: Promise<Highlighter> | null = null;
function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["dark-plus"],
      langs: COMMON_LANGS,
    });
  }
  return highlighterPromise;
}

function detectLanguage(code: string): string {
  const lines = code.split("\n");
  const first = lines[0]?.trim() ?? "";

  if (first.startsWith("#!")) {
    if (/python/.test(first)) return "python";
    if (/node|deno|bun/.test(first)) return "javascript";
    if (/bash|\/sh|zsh/.test(first)) return "bash";
    if (/ruby/.test(first)) return "ruby";
    if (/perl/.test(first)) return "perl";
  }

  if (/^#{1,6}\s/.test(first) || /```/.test(code) || /^\*\*\w/.test(code) || /^\[.*\]\(/.test(code))
    return "markdown";

  if (first === "{" || first === "[") {
    try { JSON.parse(code); return "json"; } catch {}
  }

  if (first.startsWith("---") && lines.length > 1 && /^\w+:\s/.test(lines[1] ?? ""))
    return "yaml";

  if (/^<(!DOCTYPE|html|div|span|head|body|script|style)\b/i.test(first)) return "html";
  if (/^<\?xml/.test(first)) return "xml";

  if (/^(import|export)\s/.test(first) && /from\s+['"]/.test(first)) return "typescript";
  if (/^(const|let|var|function|class|interface|type)\s/.test(first)) return "typescript";
  if (/^(import|from)\s/.test(first) || /^def\s|^class\s/.test(first) || (/:\s*$/.test(first) && !/\{/.test(first)))
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

  return "markdown";
}

export interface HighlightedEditorHandle {
  focus: () => void;
  getCursor: () => number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  placeholderText?: string;
}

export const HighlightedEditor = forwardRef<HighlightedEditorHandle, Props>(
  function HighlightedEditor({ value, onChange, onPaste, onDrop, placeholderText }, ref) {
    const [html, setHtml] = useState("");
    const [lang, setLang] = useState<string>(() => detectLanguage(value));
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const preRef = useRef<HTMLPreElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      getCursor: () => textareaRef.current?.selectionStart ?? 0,
    }));

    // Detect language once on mount (when toggle is pressed)
    useEffect(() => {
      setLang(detectLanguage(value));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const syncScroll = useCallback(() => {
      if (preRef.current && textareaRef.current) {
        preRef.current.scrollTop = textareaRef.current.scrollTop;
        preRef.current.scrollLeft = textareaRef.current.scrollLeft;
      }
    }, []);

    // Re-highlight on content change using the cached language
    useEffect(() => {
      const timer = setTimeout(async () => {
        try {
          const hl = await getHighlighter();
          const result = hl.codeToHtml(value || " ", {
            theme: "dark-plus",
            lang,
          });
          setHtml(result);
        } catch {
          setHtml("");
        }
      }, 300);
      return () => clearTimeout(timer);
    }, [value, lang]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
      },
      [onChange],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Tab") {
          e.preventDefault();
          const ta = e.currentTarget;
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const newValue = value.slice(0, start) + "  " + value.slice(end);
          onChange(newValue);
          requestAnimationFrame(() => {
            ta.selectionStart = ta.selectionEnd = start + 2;
          });
        }
      },
      [value, onChange],
    );

    return (
      <div className="highlighted-editor relative min-h-[320px] w-full flex-1">
        <pre
          ref={preRef}
          className="highlighted-editor-pre pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onPaste={onPaste}
          onDrop={onDrop}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          className="highlighted-editor-textarea relative z-10 min-h-[320px] w-full flex-1 resize-none border-0 bg-transparent leading-relaxed caret-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
          spellCheck={false}
        />
      </div>
    );
  },
);
