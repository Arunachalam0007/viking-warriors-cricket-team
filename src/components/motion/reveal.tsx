"use client";

import { animate, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, type ComponentProps } from "react";

const OFFSET = 48;
/** Gap between one card starting and the next */
const STAGGER = 0.09;
/** Cards past this many wait no longer, so long lists don't crawl */
const MAX_TURN = 14;

/** The element that sits in the grid: the card itself, or the link/div wrapping only it. */
function gridItem(el: HTMLElement) {
  let item = el;
  for (let i = 0; i < 3 && item.parentElement && item.parentElement.children.length === 1; i++) item = item.parentElement;
  return item;
}

/**
 * A div that animates in as soon as it mounts. Cards in the left half of their row slide
 * left → right, cards in the right half slide right → left, and full-width cards rise up.
 * Cards go one by one: across each row, then down the page.
 * Used by <Card> so every screen's cards animate.
 */
export function RevealDiv({ style, ...props }: ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    const el = ref.current;
    const item = el && gridItem(el);
    const row = item?.parentElement;
    if (!el || !item || !row) return;
    if (reduceMotion) {
      el.style.opacity = "1";
      return;
    }
    const box = item.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    const fullWidth = box.width > rowBox.width * 0.75;
    const leftHalf = box.left + box.width / 2 < rowBox.left + rowBox.width / 2;
    const x = fullWidth ? 0 : leftHalf ? -OFFSET : OFFSET;
    const y = fullWidth ? OFFSET / 2 : 0;
    // One by one in reading order: count the cards above, or to the left in the same row.
    const turn = [...document.querySelectorAll<HTMLElement>("[data-slot=card]")].filter((other) => {
      if (other === el) return false;
      const r = gridItem(other).getBoundingClientRect();
      return Math.abs(r.top - box.top) < 4 ? r.left < box.left : r.top < box.top;
    }).length;
    const delay = Math.min(turn, MAX_TURN) * STAGGER;
    const controls = animate(
      el,
      { opacity: [0, 1], x: [x, 0], y: [y, 0] },
      { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }
    );
    return () => controls.stop();
  }, [reduceMotion]);

  // Hidden until the animation starts, so cards never flash in their final spot first.
  return <div ref={ref} style={{ opacity: 0, ...style }} {...props} />;
}
