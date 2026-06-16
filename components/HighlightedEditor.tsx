"use client";

import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from "react";
import type { Highlighter, ThemeRegistrationAny } from "shiki";
import { COMMON_LANGS, detectLanguage } from "@/lib/detectLanguage";
import { keepPaletteThemeDark, keepPaletteThemeLight } from "@/lib/shikiTheme";

function currentShikiTheme(): string {
  if (typeof document === "undefined") return "keep-palette-dark";
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "keep-palette-light"
    : "keep-palette-dark";
}

let highlighterPromise: Promise<Highlighter> | null = null;
function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({
        themes: [
          keepPaletteThemeDark as ThemeRegistrationAny,
          keepPaletteThemeLight as ThemeRegistrationAny,
        ],
        langs: COMMON_LANGS,
      }),
    );
  }
  return highlighterPromise;
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
    const [theme, setTheme] = useState<string>(currentShikiTheme);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const preRef = useRef<HTMLPreElement>(null);
    const hlRef = useRef<Highlighter | null>(null);

    // Re-highlight when the app theme flips so code stays readable in light mode.
    useEffect(() => {
      const obs = new MutationObserver(() => setTheme(currentShikiTheme()));
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      return () => obs.disconnect();
    }, []);

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

    useEffect(() => {
      if (hlRef.current) {
        try {
          setHtml(hlRef.current.codeToHtml(value || " ", { theme, lang }));
        } catch { /* lang not loaded */ }
        return;
      }
      let cancelled = false;
      getHighlighter().then((hl) => {
        hlRef.current = hl;
        if (!cancelled) {
          try {
            setHtml(hl.codeToHtml(value || " ", { theme, lang }));
          } catch { /* lang not loaded */ }
        }
      });
      return () => { cancelled = true; };
    }, [value, lang, theme]);

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
      <div className="highlighted-editor relative min-h-[320px] w-full flex-1 flex flex-col">
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
          name="note-body"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          data-form-type="other"
          className="highlighted-editor-textarea relative z-10 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent leading-relaxed caret-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
          spellCheck={false}
        />
      </div>
    );
  },
);
