import { useLayoutEffect, useRef, type KeyboardEvent } from "react";

const ITEM_SELECTOR = "button:not([disabled])";

function itemsIn(menu: HTMLElement | null): HTMLElement[] {
  return menu ? Array.from(menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) : [];
}

/**
 * The keyboard contract shared by every popup menu: focus moves onto the first
 * item when the menu opens, arrow keys step through the items (wrapping),
 * Home/End jump to the ends, and Escape or Tab closes the menu and hands focus
 * back to whatever opened it. Keys the menu consumes stop at the menu, so
 * app-level shortcuts — and the editor's own Escape — never fire underneath
 * an open menu.
 */
export function useMenuKeyboard<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onClose: () => void,
) {
  const menuRef = useRef<T>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
    const menu = menuRef.current;
    itemsIn(menu)[0]?.focus();
    return () => {
      if (menu?.contains(document.activeElement)) openerRef.current?.focus();
    };
  }, [open]);

  function close(event: KeyboardEvent<T>) {
    event.stopPropagation();
    onCloseRef.current();
    openerRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<T>) {
    const items = itemsIn(event.currentTarget);
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close(event);
        return;
      case "Tab":
        // Focus returns to the opener first, so the browser's own Tab then
        // lands on the element after it — as if the menu had never opened.
        close(event);
        return;
      case "Enter":
      case " ":
        event.stopPropagation();
        return;
      case "ArrowDown":
        next = (current + 1) % items.length;
        break;
      case "ArrowUp":
        next = (current - 1 + items.length) % items.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    items[next]?.focus();
  }

  return { menuRef, onKeyDown };
}
