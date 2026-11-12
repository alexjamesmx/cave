import { type RefObject, useEffect, useLayoutEffect } from "react";

function place(el: HTMLElement) {
  // Offsets, not the box: the page's entrance animation moves the box for a moment.
  let top = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null)
    top += n.offsetTop;
  el.style.setProperty("--fill-top", `${top}px`);
}

/**
 * Sets `--fill-top` on the element, its distance from the top of the page, so its CSS can make
 * it reach the bottom of the screen: `height: calc(100dvh - var(--fill-top) - <gap>)`. It is
 * measured after every render, since what sits above can grow, and on resize.
 */
export function useFillHeight(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    if (ref.current) place(ref.current);
  });
  useEffect(() => {
    const resize = () => {
      if (ref.current) place(ref.current);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [ref]);
}
