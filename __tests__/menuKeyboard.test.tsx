import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useMenuKeyboard } from "@/lib/useMenuKeyboard";
import { useModalDialog } from "@/lib/useModalDialog";

it("moves menu focus and gives Escape to the menu before its enclosing dialog", () => {
  const closeDialog = vi.fn();
  function Fixture() {
    const [open, setOpen] = useState(false);
    const dialog = useModalDialog(closeDialog);
    const menu = useMenuKeyboard(open, () => setOpen(false));
    return <div ref={dialog}><button onClick={() => setOpen(true)}>Options</button>
      {open && <div role="menu" ref={menu.menuRef} onKeyDown={menu.onKeyDown}>
        <button role="menuitem">First</button><button role="menuitem">Last</button>
      </div>}
    </div>;
  }
  render(<Fixture />);
  const opener = screen.getByText("Options");
  opener.focus();
  fireEvent.click(opener);
  expect(document.activeElement).toBe(screen.getByText("First"));
  fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
  expect(document.activeElement).toBe(screen.getByText("Last"));
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(opener);
  expect(closeDialog).not.toHaveBeenCalled();
  fireEvent.keyDown(opener, { key: "Escape" });
  expect(closeDialog).toHaveBeenCalledOnce();
});
