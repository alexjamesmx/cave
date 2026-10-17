import type { KeyboardEvent, MouseEvent } from "react";

// A row's own controls keep their action: Paid, checkboxes, links, drag handles.
const CONTROLS =
  "a[href],button,input,select,textarea,label,summary,[role=button],[role=checkbox],[data-row-control]";

/** Whether Enter or Space on a focused row opens it. */
export const isOpenKey = (key: string) => key === "Enter" || key === " ";

/**
 * Props that make a whole row open its item: a click or tap anywhere on it, or Enter and
 * Space when the row itself has focus. A click on one of the row's controls, or one that
 * ends a text selection inside the row, does nothing here.
 */
export function rowOpen(open: () => void) {
  return {
    tabIndex: 0,
    "data-row": "",
    onClick(e: MouseEvent<HTMLElement>) {
      const row = e.currentTarget;
      const control = e.target instanceof Element ? e.target.closest(CONTROLS) : null;
      if (control && control !== row && row.contains(control)) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && row.contains(selection.anchorNode)) return;
      open();
    },
    onKeyDown(e: KeyboardEvent<HTMLElement>) {
      if (e.target !== e.currentTarget || !isOpenKey(e.key)) return;
      e.preventDefault();
      open();
    },
  };
}
