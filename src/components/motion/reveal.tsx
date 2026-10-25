"use client";

import { animate, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, type ComponentProps } from "react";

const OFFSET = 64;
/** Gap between one card starting and the next */
const STAGGER = 0.09;
/** Cards past this many wait no longer, so long lists don't crawl */
const MAX_TURN = 10;
const EASE = [0.22, 1, 0.36, 1] as const;

/** The element that sits in the grid: the card itself, or the link/div wrapping only it. */
function gridItem(el: HTMLElement) {
  let item = el;
  for (let i = 0; i < 3 && item.parentElement && item.parentElement.children.length === 1; i++) item = item.parentElement;
  return item;
}

const inViewport = (r: DOMRect) => r.bottom > 0 && r.top < window.innerHeight;

/**
 * Left half of its row → from the left, right half → from the right. Full-width cards (most cards
 * on a phone) alternate: from the left, then the right, and so on down the page.
 */
function direction(el: HTMLElement) {
  const item = gridItem(el);
  const box = item.getBoundingClientRect();
  const row = item.parentElement;
  const rowBox = row?.getBoundingClientRect();
  if (!rowBox || box.width > rowBox.width * 0.75) {
    const index = [...document.querySelectorAll("[data-slot=card]")].indexOf(el);
    return { x: index % 2 === 0 ? -OFFSET : OFFSET, box };
  }
  const leftHalf = box.left + box.width / 2 < rowBox.left + rowBox.width / 2;
  return { x: leftHalf ? -OFFSET : OFFSET, box };
}

/** Position in reading order among `others`: how many are above, or to the left in the same row. */
function turnAmong(box: DOMRect, others: HTMLElement[]) {
  return others.filter((o) => {
    const r = gridItem(o).getBoundingClientRect();
    return Math.abs(r.top - box.top) < 4 ? r.left < box.left : r.top < box.top;
  }).length;
}

// Cards scrolled into view in the same frame go one by one.
let scrollBatch: HTMLElement[] = [];
function queueReveal(el: HTMLElement, play: (delay: number) => void) {
  if (scrollBatch.length === 0) requestAnimationFrame(() => (scrollBatch = []));
  scrollBatch.push(el);
  const batch = scrollBatch;
  // Wait a frame so every card in this batch has joined before counting turns
  requestAnimationFrame(() => {
    const turn = turnAmong(gridItem(el).getBoundingClientRect(), batch.filter((o) => o !== el));
    play(Math.min(turn, MAX_TURN) * STAGGER);
  });
}

/**
 * A div that slides in at every screen size. Cards on screen when the page opens animate at
 * once, one by one in reading order; cards further down wait until they are scrolled into view.
 * Used by <Card> so every screen's cards animate.
 */
export function RevealDiv({ style, ...props }: ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduceMotion) {
      el.style.opacity = "1";
      return;
    }
    let stop: (() => void) | undefined;
    const play = (delay: number) => {
      const { x } = direction(el);
      const controls = animate(el, { opacity: [0, 1], x: [x, 0] }, { duration: 0.65, delay, ease: EASE });
      stop = () => controls.stop();
    };

    const { box } = direction(el);
    if (inViewport(box)) {
      // On screen now: animate immediately, in reading order among the visible cards
      const visible = [...document.querySelectorAll<HTMLElement>("[data-slot=card]")].filter(
        (o) => o !== el && inViewport(gridItem(o).getBoundingClientRect()),
      );
      play(Math.min(turnAmong(box, visible), MAX_TURN) * STAGGER);
      return () => stop?.();
    }

    // Below the fold: reveal when scrolled to
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        queueReveal(el, play);
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      stop?.();
    };
  }, [reduceMotion]);

  // Hidden until its animation starts, so cards never flash in their final spot first.
  return <div ref={ref} style={{ opacity: 0, ...style }} {...props} />;
}
