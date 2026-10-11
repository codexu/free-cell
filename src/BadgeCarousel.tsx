import { useLayoutEffect, useRef, useState } from 'react';
import { BadgeEmblem } from './BadgeEmblem';
import { LEVEL_TIERS } from './progression';

const VISIBLE = Math.min(5, LEVEL_TIERS.length);
const lastStart = LEVEL_TIERS.length - VISIBLE;
const firstFor = (tier: number) => Math.max(0, Math.min(tier - 2, lastStart));

export function BadgeCarousel({ currentTier, level }: { currentTier: number; level: number }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(currentTier);
  const activeRef = useRef(currentTier);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouse = useRef<{ pointer: number; x: number; left: number } | null>(null);
  const focus = (tier: number) => { activeRef.current = tier; setActive(tier); };
  const navigate = (tier: number) => {
    const next = Math.max(0, Math.min(LEVEL_TIERS.length - 1, tier));
    focus(next);
    const node = viewport.current;
    node?.scrollTo({ left: firstFor(next) * node.clientWidth / VISIBLE, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const updateFocus = () => {
    const node = viewport.current;
    if (!node || !node.clientWidth) return;
    const first = Math.max(0, Math.min(lastStart, Math.round(node.scrollLeft / (node.clientWidth / VISIBLE))));
    // At either end keep the first/last selected rank visible without padding.
    const previous = activeRef.current;
    focus(first === 0 && previous < 2 ? previous : first === lastStart && previous >= LEVEL_TIERS.length - 2 ? previous : first + 2);
  };
  useLayoutEffect(() => {
    const node = viewport.current!;
    let width = 0;
    activeRef.current = currentTier; setActive(currentTier);
    const align = () => {
      if (!node.clientWidth || node.clientWidth === width) return;
      width = node.clientWidth;
      node.scrollLeft = firstFor(activeRef.current) * width / VISIBLE;
    };
    align();
    const observer = new ResizeObserver(align); observer.observe(node);
    return () => { observer.disconnect(); if (settle.current) clearTimeout(settle.current); };
  }, [currentTier]);
  return <section className="badge-carousel" aria-label="等级徽章轮播" aria-roledescription="轮播">
    <div className="badge-carousel-items" ref={viewport} tabIndex={0} role="group" aria-label="左右滑动浏览等级徽章" onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); navigate(activeRef.current + (event.key === 'ArrowLeft' ? -1 : 1)); }
    }} onScroll={() => {
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => { if (!mouse.current) updateFocus(); }, 140);
    }} onPointerDown={event => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      mouse.current = { pointer: event.pointerId, x: event.clientX, left: event.currentTarget.scrollLeft };
      event.currentTarget.dataset.dragging = 'true';
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={event => {
      const drag = mouse.current;
      if (drag?.pointer === event.pointerId) event.currentTarget.scrollLeft = drag.left + drag.x - event.clientX;
    }} onPointerUp={event => {
      if (mouse.current?.pointer !== event.pointerId) return;
      mouse.current = null; delete event.currentTarget.dataset.dragging;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      const step = event.currentTarget.clientWidth / VISIBLE;
      event.currentTarget.scrollTo({ left: Math.round(event.currentTarget.scrollLeft / step) * step, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      updateFocus();
    }} onLostPointerCapture={event => { mouse.current = null; delete event.currentTarget.dataset.dragging; }} onPointerCancel={event => { mouse.current = null; delete event.currentTarget.dataset.dragging; }}>
      {LEVEL_TIERS.map((item, tier) => <div key={item.level} className={`badge-carousel-item ${level >= item.level ? 'unlocked' : ''} ${tier === active ? 'centered' : ''}`}>
        <BadgeEmblem tier={tier} earned={level >= item.level} /><b>{item.title}</b><span>Lv.{item.level}</span><small>{tier === currentTier ? '当前等级' : level >= item.level ? '已解锁' : '未解锁'}</small>
      </div>)}
    </div>
    <span className="badge-carousel-status" role="status" aria-live="polite">{LEVEL_TIERS[active].title}，第 {active + 1} 个徽章，共 {LEVEL_TIERS.length} 个</span>
  </section>;
}
