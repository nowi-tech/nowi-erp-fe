import { useEffect, useRef } from 'react';

/**
 * Open overlays (Dialog, Drawer, ConfirmDialog) in opening order. Only the
 * top one handles Escape, so a nested overlay dismisses before its host.
 */
const stack: number[] = [];
let nextId = 1;

/** While `open`, claim a slot on the stack and run `onEscape` when this overlay is on top. */
export function useEscapeWhenTop(open: boolean, onEscape: () => void) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  useEffect(() => {
    if (!open) return;
    const id = nextId++;
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === id) onEscapeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const idx = stack.lastIndexOf(id);
      if (idx >= 0) stack.splice(idx, 1);
    };
  }, [open]);
}
