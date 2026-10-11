import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Board, Card } from './game';

type Rect = { left: number; top: number; width: number; height: number };
type Location = { rect: Rect; face?: HTMLElement; node?: HTMLElement; base: string; zone: 'column' | 'cell' | 'foundation'; order: number };
type Snapshot = Map<number, Location>;
type Pending = { snapshot: Snapshot; history: boolean; steps: Board[] };
type Collection = { steps: Board[]; index: number; snapshot: Snapshot };
export type Release = { cards: Card[]; left: number; top: number; width: number; gap: number };
const EASE = 'cubic-bezier(.2, .65, .25, 1)';

function locations(board: Board, onlyCards?: Set<number>): Snapshot {
  const result: Snapshot = new Map();
  // Finish every geometry/style read before creating or animating any nodes.
  document.querySelectorAll<HTMLElement>('.table [data-card-id]').forEach(node => {
    const id = Number(node.dataset.cardId);
    if (onlyCards && !onlyCards.has(id)) return;
    const container = node.closest<HTMLElement>('[data-target]');
    const rect = node.getBoundingClientRect();
    result.set(id, {
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      face: node.querySelector<HTMLElement>('.playing-card') ?? undefined,
      node, base: getComputedStyle(node).transform,
      zone: container?.dataset.kind as Location['zone'],
      order: container?.dataset.kind === 'foundation' ? Math.floor(id / 4) + 1 : Number(node.dataset.order || 0),
    });
  });
  board.foundations.forEach((rank, suit) => {
    if (onlyCards && ![...onlyCards].some(id => id % 4 === suit && Math.floor(id / 4) < rank)) return;
    const slot = document.querySelector<HTMLElement>(`.table .foundation-slot[data-index="${suit}"]`);
    if (!slot) return;
    const rect = slot.getBoundingClientRect();
    for (let n = 1; n <= rank; n++) {
      const id = (n - 1) * 4 + suit;
      if (onlyCards && !onlyCards.has(id)) continue;
      if (!result.has(id)) result.set(id, {
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        base: 'none', zone: 'foundation', order: n,
      });
    }
  });
  return result;
}

function releasePositions(snapshot: Snapshot, release?: Release) {
  release?.cards.forEach((card, i) => {
    const source = snapshot.get(card.id);
    if (source) source.rect = { left: release.left, top: release.top + i * release.gap, width: release.width, height: release.width * 1.43 };
  });
  return snapshot;
}

export function useCardMotion(board: Board, dealId: string) {
  const [busy, setBusy] = useState(false);
  const [visualBoard, setVisualBoard] = useState<Board | null>(null);
  const collection = useRef<Collection | null>(null);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const pending = useRef<Pending | null>(null);
  const lastDeal = useRef(dealId);
  const generation = useRef(0);
  const cleanup = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    const interrupt = () => {
      if (!busyRef.current) return;
      ++generation.current; cleanup.current?.(); cleanup.current = null;
      collection.current = null; setVisualBoard(null);
      busyRef.current = false; setBusy(false);
    };
    const onScroll = (event: Event) => {
      // Scrolling a menu is unrelated to the board's coordinates.
      if (event.target === document || event.target === document.documentElement || event.target === document.body) interrupt();
    };
    window.addEventListener('resize', interrupt);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('resize', interrupt);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  function capture(release?: Release, history = false, steps: Board[] = []) {
    pending.current = { snapshot: releasePositions(locations(board), release), history, steps };
  }

  function cancel() {
    ++generation.current; cleanup.current?.(); cleanup.current = null;
    pending.current = null; collection.current = null; setVisualBoard(null);
    busyRef.current = false; setBusy(false);
  }

  function animate(before: Snapshot | null, after: Snapshot, dealing: boolean, history = false, rejected = false, complete?: () => void) {
    cleanup.current?.(); cleanup.current = null;
    const token = ++generation.current;
    if (reduced) { if (complete) complete(); else { busyRef.current = false; setBusy(false); } return; }
    const pile = document.querySelector('.table-divider')?.getBoundingClientRect();
    // Preserve the destination stack throughout the animation. Card IDs encode
    // rank and suit, so sorting by ID can put an earlier card above its cover.
    const entries = [...after].sort(([a, x], [b, y]) => x.order - y.order || a - b);
    const plans: { node: HTMLElement; frames: Keyframe[]; duration: number; delay: number; clone: boolean; restore: () => void }[] = [];
    const layer = document.createElement('div');
    layer.className = `card-flight-layer ${document.querySelector('.app.large-ranks') ? 'large-ranks' : ''}`;
    layer.setAttribute('aria-hidden', 'true');

    for (const [id, to] of entries) {
      const from = before?.get(id);
      if (!dealing && (!from || (from.zone === 'foundation' && to.zone === 'foundation') || (Math.abs(from.rect.left - to.rect.left) < .5 && Math.abs(from.rect.top - to.rect.top) < .5 && Math.abs(from.rect.width - to.rect.width) < .5))) continue;
      const origin: Rect = dealing ? {
        left: (pile?.left ?? to.rect.left) + (pile?.width ?? 0) / 2 - to.rect.width / 2,
        top: (pile?.top ?? to.rect.top) - to.rect.height / 2,
        width: to.rect.width, height: to.rect.height,
      } : from!.rect;
      const delay = dealing ? to.order * 9 : 0;
      const duration = rejected ? 340 : history ? 220 : dealing ? 240 : 260;
      let node = to.node;
      let clone = false;
      let base = to.base === 'none' ? '' : to.base;
      let restore = () => {};
      if (node) {
        const target = node;
        const saved = { origin: target.style.transformOrigin, z: target.style.zIndex, change: target.style.willChange };
        restore = () => {
          target.classList.remove('motion-card');
          target.style.transformOrigin = saved.origin;
          target.style.zIndex = saved.z;
          target.style.willChange = saved.change;
        };
      } else {
        // Only hidden intermediate foundation cards need a temporary face.
        const originalFace = to.face || from?.face;
        if (!originalFace) continue;
        node = document.createElement('div'); node.className = 'card-flight';
        const face = originalFace.cloneNode(true) as HTMLElement;
        face.classList.remove('selected', 'hinted');
        node.append(face); layer.append(node); clone = true; base = '';
        Object.assign(node.style, { left: `${to.rect.left}px`, top: `${to.rect.top}px`, width: `${to.rect.width}px`, height: `${to.rect.height}px` });
      }
      const dx = origin.left - to.rect.left;
      const dy = origin.top - to.rect.top;
      const sx = origin.width / to.rect.width;
      const sy = origin.height / to.rect.height;
      const frames: Keyframe[] = rejected ? [
        { transform: `translate3d(${dx}px,${dy}px,0) ${base} scale(${sx},${sy})`, offset: 0 },
        { transform: `translate3d(0,0,0) ${base}`, offset: .6 },
        { transform: `translate3d(-4px,0,0) ${base}`, offset: .72 },
        { transform: `translate3d(3px,0,0) ${base}`, offset: .83 },
        { transform: `translate3d(-2px,0,0) ${base}`, offset: .92 },
        { transform: `translate3d(0,0,0) ${base}`, offset: 1 },
      ] : [
        { transform: `translate3d(${dx}px,${dy}px,0) ${base} scale(${sx},${sy})`, opacity: dealing ? 0 : 1 },
        { transform: `translate3d(0,0,0) ${base} scale(1,1)`, opacity: 1 },
      ];
      plans.push({ node, clone, restore, duration, delay, frames });
    }
    if (!plans.length) { if (complete) complete(); else { busyRef.current = false; setBusy(false); } return; }
    // Apply writes as a batch, then start compositor-only animations. New deals
    // animate the existing cards instead of cloning 52 SVG faces and shadows.
    if (layer.childElementCount) document.body.append(layer);
    plans.forEach((plan, i) => {
      plan.node.classList.add('motion-card');
      plan.node.style.transformOrigin = 'top left';
      plan.node.style.willChange = 'transform, opacity';
      plan.node.style.zIndex = String(100 + i);
    });
    const animations = plans.map(plan => plan.node.animate(plan.frames, { duration: plan.duration, delay: plan.delay, easing: EASE, fill: 'both' }));
    function dispose() {
      // Cancelling a finished FLIP reveals the already-correct destination style.
      animations.forEach(animation => animation.cancel());
      plans.forEach(plan => plan.restore()); layer.remove();
    }
    cleanup.current = dispose;
    busyRef.current = true; setBusy(true);
    animations.forEach((animation, i) => {
      void animation.finished.then(() => {
        if (generation.current !== token || plans[i].clone) return;
        animation.cancel(); plans[i].restore();
      }, () => {});
    });
    void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (generation.current !== token) return;
      dispose(); cleanup.current = null;
      if (complete) complete(); else { busyRef.current = false; setBusy(false); }
    });
  }

  useLayoutEffect(() => {
    const dealing = lastDeal.current !== dealId;
    lastDeal.current = dealId;
    const job = pending.current; pending.current = null;
    if (reduced || dealing) {
      ++generation.current; cleanup.current?.(); cleanup.current = null;
      collection.current = null; setVisualBoard(null);
      busyRef.current = false; setBusy(false);
    }
    if (!dealing && !reduced && job?.steps.length) {
      // Render each real board transition. Waiting cards stay in their columns,
      // and each foundation exposes only the cards that have already arrived.
      collection.current = { steps: job.steps, index: 0, snapshot: job.snapshot };
      busyRef.current = true; setBusy(true);
      setVisualBoard(job.steps[0]);
    } else if (dealing || job) {
      animate(job?.snapshot ?? null, locations(board), dealing, job?.history);
    }
  }, [board, dealId, reduced]);

  useLayoutEffect(() => {
    const run = collection.current;
    if (!run || !visualBoard) return;
    animate(run.snapshot, locations(visualBoard), false, false, false, () => {
      if (collection.current !== run) return;
      run.index++;
      if (run.index < run.steps.length) {
        run.snapshot = locations(visualBoard);
        setVisualBoard(run.steps[run.index]);
      } else {
        collection.current = null; setVisualBoard(null);
        busyRef.current = false; setBusy(false);
      }
    });
  }, [visualBoard]);

  useEffect(() => () => {
    ++generation.current; cleanup.current?.(); cleanup.current = null; busyRef.current = false;
  }, []);

  function returnDrag(release: Release, rejected = false) {
    // Only the dragged cards can move during a rejected drop. Keep unrelated
    // cards out of the animation even if their measured geometry fluctuates.
    const released = new Set(release.cards.map(card => card.id));
    const after = locations(board, released);
    const before = new Map([...after].map(([id, location]) => [id, { ...location, rect: { ...location.rect } }]));
    animate(releasePositions(before, release), after, false, true, rejected);
  }
  return { busy, reduced, visualBoard: visualBoard ?? board, capture, returnDrag, cancel, isBusy: () => busyRef.current };
}
