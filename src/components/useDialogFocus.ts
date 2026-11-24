import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Move focus into a modal on open, keep Tab inside it, and restore focus on close. */
export function useDialogFocus<T extends HTMLElement>(active: boolean, dialogRef: RefObject<T | null>, initialFocus?: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!active || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.getClientRects().length > 0);
    (initialFocus?.current ?? items()[0] ?? dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusables = items();
      if (!focusables.length) { event.preventDefault(); dialog.focus(); return; }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected && previous.getClientRects().length > 0) previous.focus();
    };
  }, [active, dialogRef, initialFocus]);
}
