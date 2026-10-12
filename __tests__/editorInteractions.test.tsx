import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { mapTextOffset } from "@/lib/mapTextOffset";
import { renderSearchHits } from "@/components/renderSearchHits";
import { useMenuPresence } from "@/lib/useMenuPresence";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it("keeps a pending upload's anchor beside unchanged text after nearby edits", () => {
  expect(mapTextOffset("hello world", "new hello world", 6)).toBe(10);
  expect(mapTextOffset("hello world", "world", 8)).toBe(2);
  expect(mapTextOffset("hello world", "hello notes", 8)).toBe(11);
  expect(mapTextOffset("a😀b", "prefix a😀b", 3)).toBe(10);
  expect(mapTextOffset("remove all", "", 7)).toBe(0);
});

it("preserves literal text and exposes exactly one active search result", () => {
  const text = "literal <tag> and literal";
  const { container } = render(<div>{renderSearchHits(text, [[0, 7], [18, 25]], 1)}</div>);
  expect(container.textContent).toBe(text);
  expect(container.querySelectorAll("mark")).toHaveLength(2);
  expect(container.querySelectorAll("[data-search-active]")).toHaveLength(1);
  expect(container.querySelector("[data-search-active]")?.textContent).toBe("literal");
  expect(container.querySelector("tag")).toBeNull();
});

it("cancels a closing menu's removal when it reopens during the animation", () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ open }) => useMenuPresence(open), { initialProps: { open: true } });
  rerender({ open: false });
  expect(result.current).toEqual({ mounted: true, closing: true });
  act(() => vi.advanceTimersByTime(40));
  rerender({ open: true });
  act(() => vi.advanceTimersByTime(100));
  expect(result.current).toEqual({ mounted: true, closing: false });
  rerender({ open: false });
  act(() => vi.advanceTimersByTime(90));
  expect(result.current).toEqual({ mounted: false, closing: false });
});
