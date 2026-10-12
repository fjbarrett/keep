"use client";

import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from "react";
import type { Highlighter, ThemeRegistrationAny, BundledLanguage } from "shiki";
import { detectLanguage } from "@/lib/detectLanguage";
import { keepPaletteThemeDark, keepPaletteThemeLight } from "@/lib/shikiTheme";
import { renderSearchHits } from "./renderSearchHits";

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
        langs: [],
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
  searchMatches?: [number, number][] | null;
  activeMatch?: number;
}

export const HighlightedEditor = forwardRef<HighlightedEditorHandle, Props>(
  function HighlightedEditor(
    { value, onChange, onPaste, onDrop, placeholderText, searchMatches, activeMatch = 0 },
    ref,
  ) {
    const [rendered, setRendered] = useState({ value: "", theme: "", html: "" });
    const [lang, setLang] = useState<string>(() => detectLanguage(value));
    const [theme, setTheme] = useState<string>(currentShikiTheme);
    const html = rendered.value === value && rendered.theme === theme ? rendered.html : "";
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const preRef = useRef<HTMLPreElement>(null);

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

    // Grow to fit content so the editor hugs short notes and the outer pane,
    // not the textarea, owns vertical scrolling.
    useEffect(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }, [value]);

    useEffect(() => {
      // Long notes stay editable as plain text. Highlight only after a pause,
      // and never display tokens belonging to an older version of the body.
      if (value.length > 100_000) return;
      let cancelled = false;
      const timer = window.setTimeout(async () => {
        try {
          const hl = await getHighlighter();
          if (!hl.getLoadedLanguages().includes(lang)) await hl.loadLanguage(lang as BundledLanguage);
          if (cancelled) return;
          const html = hl.codeToHtml(value || " ", { theme, lang })
            .replace(/\n(<span class="line">)/g, "$1");
          setRendered({ value, theme, html });
        } catch { highlighterPromise = null; /* Plain text remains editable. */ }
      }, 120);
      return () => { cancelled = true; window.clearTimeout(timer); };
    }, [value, lang, theme]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
      },
      [onChange],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Tab" && e.altKey && !e.shiftKey) {
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
      <div className="highlighted-editor relative min-h-[32rem] w-full flex flex-col">
        <pre
          ref={preRef}
          className="highlighted-editor-pre pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {searchMatches && searchMatches.length > 0 && (
          <div
            aria-hidden
            className="highlighted-editor-search search-backdrop pointer-events-none absolute inset-0 z-[5] overflow-hidden"
          >
            {renderSearchHits(value, searchMatches, activeMatch)}
          </div>
        )}
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
          className="highlighted-editor-textarea relative z-10 w-full resize-none overflow-hidden border-0 bg-transparent leading-relaxed caret-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
          // Keep the text visible until the Shiki layer is actually painted —
          // otherwise a failed/slow highlight leaves only the transparent
          // textarea and the code looks invisible.
          style={
            html
              ? undefined
              : { color: "var(--color-text)", WebkitTextFillColor: "var(--color-text)" }
          }
          spellCheck={false}
        />
      </div>
    );
  },
);
