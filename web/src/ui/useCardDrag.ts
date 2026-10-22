import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/** Where a dragged card would land: a column (`data-column`) and a slot among its cards. */
interface DropTarget {
  column: string;
  index: number;
}

interface DragState extends DropTarget {
  id: string;
  dx: number;
  dy: number;
}

const MOUSE_SLOP = 5;
const TOUCH_SLOP = 8;
const LONG_PRESS_MS = 350;

/** The column under a point and the slot before the first card whose middle is below it. */
function targetAt(x: number, y: number, dragged: string): DropTarget | undefined {
  // The dragged card follows the pointer, so look past it to what lies beneath.
  const under = document
    .elementsFromPoint(x, y)
    .find((el) => !el.closest(`[data-card="${CSS.escape(dragged)}"]`));
  const column = under?.closest<HTMLElement>("[data-column]");
  if (!column) return undefined;
  const cards = [...column.querySelectorAll<HTMLElement>("[data-card]")].filter(
    (c) => c.dataset.card !== dragged,
  );
  const index = cards.findIndex((c) => {
    const box = c.getBoundingClientRect();
    return y < box.top + box.height / 2;
  });
  return { column: column.dataset.column ?? "", index: index === -1 ? cards.length : index };
}

/**
 * Drag and drop for board cards with pointer events, so mouse and touch share one path. A
 * mouse drag starts after a few pixels; a touch drag after a long press, so a swipe still
 * scrolls the board. A drag ends in `onDrop`; the click it would cause is swallowed.
 */
export function useCardDrag(onDrop: (id: string, target: DropTarget) => void) {
  const [drag, setDrag] = useState<DragState>();
  const pending = useRef<{
    id: string;
    x: number;
    y: number;
    touch: boolean;
    timer?: ReturnType<typeof setTimeout>;
  }>(undefined);
  const active = useRef<DragState>(undefined);
  const swallowClick = useRef(false);

  const begin = useCallback((x: number, y: number) => {
    const p = pending.current;
    if (!p) return;
    const target = targetAt(x, y, p.id);
    active.current = {
      id: p.id,
      dx: x - p.x,
      dy: y - p.y,
      ...(target ?? { column: "", index: 0 }),
    };
    setDrag(active.current);
  }, []);

  // While a touch drag is on, the page must not scroll under the finger.
  useEffect(() => {
    const block = (e: TouchEvent) => {
      if (active.current) e.preventDefault();
    };
    document.addEventListener("touchmove", block, { passive: false });
    return () => document.removeEventListener("touchmove", block);
  }, []);

  const reset = () => {
    if (pending.current?.timer) clearTimeout(pending.current.timer);
    pending.current = undefined;
    active.current = undefined;
    setDrag(undefined);
  };

  const handlers = (id: string) => ({
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      const touch = e.pointerType !== "mouse";
      pending.current = { id, x: e.clientX, y: e.clientY, touch };
      e.currentTarget.setPointerCapture(e.pointerId);
      if (touch) {
        const { clientX, clientY } = e;
        pending.current.timer = setTimeout(() => begin(clientX, clientY), LONG_PRESS_MS);
      }
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const p = pending.current;
      if (!p) return;
      const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (!active.current) {
        if (p.touch) {
          // Moving before the long press is a swipe: let the board scroll.
          if (moved > TOUCH_SLOP) reset();
          return;
        }
        if (moved < MOUSE_SLOP) return;
        begin(e.clientX, e.clientY);
      }
      const target = targetAt(e.clientX, e.clientY, p.id);
      active.current = {
        ...(active.current as DragState),
        dx: e.clientX - p.x,
        dy: e.clientY - p.y,
        ...(target ?? {}),
      };
      setDrag(active.current);
    },
    onPointerUp() {
      const done = active.current;
      reset();
      if (!done) return;
      swallowClick.current = true;
      onDrop(done.id, { column: done.column, index: done.index });
    },
    onPointerCancel: reset,
    onClickCapture(e: React.MouseEvent) {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    },
    onContextMenu(e: React.MouseEvent) {
      // A long press opens no menu on touch screens.
      if (pending.current?.touch) e.preventDefault();
    },
  });

  return { drag, handlers };
}
