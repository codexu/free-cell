import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
// Pixi's interpreter avoids generated functions under Tauri's existing CSP.
import 'pixi.js/unsafe-eval';
import { canMove, moveBoard, picked, sequence, won, type Board, type Move, type Source, type Target } from './game';
import { createCardTextures, SUIT_PATHS, CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT, CARD_SHADOW_PADDING, CARD_CORNER_RADIUS } from './pixiCardTextures';
import { contains, layoutBoard, type BoardLayout, type CardPose, type LayoutOptions } from './pixiBoardLayout';

export type PixiBoardState = { board: Board; gameId: string; targetColumn?: number; selection: Source | null; suggestion: Move | null; disabled: boolean; paused: boolean; compact: boolean; landscape: boolean; rotated: boolean; cellsRight: boolean; large: boolean; largeText: boolean; onCard: (source: Source) => void; onTarget: (target: Target) => void; onBlank: () => void; onHintEnd: (move: Move) => void; onDrop: (source: Source, target: Target | null) => boolean; onDrag: (active: boolean, source?: Source) => void };
export interface PixiBoardController { prepare: (history?: boolean, steps?: Board[]) => void; preview: (steps: Board[]) => Promise<boolean>; cancel: () => void; }
type View = { node: Container; shadow: Sprite; face: Sprite; edge: Graphics; strokeWidth: number };
type Tween = { id: number; from: CardPose; to: CardPose; delay: number; shake?: boolean };
type HintGhost = { node: Container; from: CardPose; to: CardPose };
type Drag = { pointerId: number; from: Source; ids: number[]; downX: number; downY: number; active: boolean; original: Map<number, CardPose>; rect: DOMRect };
type Preview = { resolve: (completed: boolean) => void; duration: number; board: Board; restoring: boolean; timer: ReturnType<typeof setTimeout> | null };
const samePose = (a: CardPose, b: CardPose) => Math.abs(a.x - b.x) < .1 && Math.abs(a.y - b.y) < .1 && Math.abs(a.width - b.width) < .1;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// Card sprites and their atlas textures have the lifetime of the board. No
// DOM card cloning, per-frame React updates, filters, or layout measurements.
export class PixiBoardEngine implements PixiBoardController {
  private app = new Application();
  private canvas = document.createElement('canvas');
  private cards = new Container();
  private decorations = new Container();
  private slots = new Graphics();
  private foundationIcons: Graphics[] = [];
  private hintLayer = new Container();
  private hintGhosts: HintGhost[] = [];
  private hintStart = 0;
  private activeHint: Move | null = null;
  private playedHint: Move | null = null;
  private labelViews: Text[] = [];
  private views = new Map<number, View>();
  private textures: ReturnType<typeof createCardTextures> | null = null;
  private poses = new Map<number, CardPose>();
  private state: PixiBoardState;
  private layout: BoardLayout | null = null;
  private width = 1;
  private height = 1;
  private board: Board;
  private gameId: string;
  private pending: { history: boolean; steps: Board[] } | null = null;
  private queue: Board[] = [];
  private tweens: Tween[] = [];
  private startTime = 0;
  private duration = 0;
  private finishing = false;
  private previewSession: Preview | null = null;
  private speedPointer: number | null = null;
  private playbackRate = 1;
  private frame: number | null = null;
  private observer: ResizeObserver | null = null;
  private drag: Drag | null = null;
  private busy = false;
  private ready = false;
  private disposed = false;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private decorationKey = '';
  constructor(private host: HTMLDivElement, state: PixiBoardState, private onBusy: (value: boolean) => void) { this.state = state; this.board = state.board; this.gameId = state.gameId; }
  async init() {
    await this.app.init({ canvas: this.canvas, width: Math.max(1, this.host.clientWidth), height: Math.max(1, this.host.clientHeight), backgroundAlpha: 0, preference: 'webgl', preferWebGLVersion: 2, resolution: Math.min(3, window.devicePixelRatio || 1), autoDensity: true, antialias: true, autoStart: false, sharedTicker: false });
    if (this.disposed) { this.app.destroy(true, { children: true }); return; }
    this.ready = true;
    this.textures = createCardTextures();
    this.app.stage.eventMode = 'none'; this.cards.sortableChildren = true;
    this.decorations.addChild(this.slots); this.app.stage.addChild(this.decorations, this.cards, this.hintLayer);
    for (let id = 0; id < 52; id++) {
      const node = new Container();
      const shadow = new Sprite(this.textures.shadow);
      shadow.position.set(-CARD_SHADOW_PADDING, -CARD_SHADOW_PADDING);
      const face = new Sprite(this.textures.get(id, this.state.large, this.state.largeText));
      const edge = new Graphics();
      node.addChild(shadow, face, edge); this.cards.addChild(node); this.views.set(id, { node, shadow, face, edge, strokeWidth: 0 });
    }
    const canvas = this.canvas;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.addEventListener('pointerdown', this.pointerDown); canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp); canvas.addEventListener('pointercancel', this.pointerCancel); canvas.addEventListener('lostpointercapture', this.lostCapture);
    this.host.appendChild(canvas);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.host);
    this.reduced.addEventListener('change', this.motionPreference); document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('blur', this.blur);
    this.resize();
  }
  update(state: PixiBoardState) {
    const previous = this.state; this.state = state;
    if (!this.ready || this.disposed) return;
    if (state.paused) this.releaseSpeed();
    if (state.disabled && this.drag) this.cancelDrag();
    const geometryChanged = previous.compact !== state.compact || previous.landscape !== state.landscape || previous.rotated !== state.rotated || previous.cellsRight !== state.cellsRight || previous.large !== state.large || previous.largeText !== state.largeText;
    // A verification only borrows the sprites. React continues to supply the
    // real board throughout, so unrelated renders must not replace its queue.
    if (this.previewSession) {
      if (geometryChanged || state.gameId !== this.gameId || state.board !== this.board) this.snap();
      return;
    }
    if (state.gameId !== this.gameId) {
      this.clearAnimation(); this.cancelDrag(); this.gameId = state.gameId; this.board = state.board;
      const next = this.makeLayout(state.board); this.layout = next; this.drawDecorations(next);
      this.poses = new Map([...next.poses].map(([id, pose]) => [id, { ...pose, x: next.dealOrigin.x, y: next.dealOrigin.y, visible: true }]));
      for (const [id, pose] of this.poses) this.place(id, pose);
      this.begin(next, false, true); return;
    }
    if (geometryChanged) { this.board = state.board; this.snap(); return; }
    if (state.board !== this.board || this.pending) {
      this.board = state.board;
      const pending = this.pending; this.pending = null;
      this.finishing = !pending?.history && !!pending?.steps.length && won(state.board);
      this.queue = pending?.steps.length ? [...pending.steps] : [state.board];
      if (this.queue.at(-1) !== state.board) this.queue.push(state.board);
      this.next(pending?.history ?? false); return;
    }
    if (previous.suggestion !== state.suggestion || previous.disabled !== state.disabled) this.startHint();
  }
  prepare(history = false, steps: Board[] = []) { if (this.previewSession) return; this.clearHint(); this.pending = { history, steps }; this.setBusy(true); }
  preview(steps: Board[]): Promise<boolean> {
    if (!this.ready || this.disposed || this.busy || this.previewSession) return Promise.resolve(false);
    if (!steps.length || this.reduced.matches || document.hidden) return Promise.resolve(true);
    this.clearAnimation(); this.cancelDrag();
    // Long solutions retain real route positions and their final goal while
    // compressing the demonstration to at most 160 visual transitions.
    const stride = Math.max(1, Math.ceil(steps.length / 160));
    const frames = steps.filter((_, index) => (index + 1) % stride === 0 || index === steps.length - 1);
    return new Promise<boolean>(resolve => {
      this.previewSession = { resolve, duration: Math.max(16, Math.min(65, 2600 / frames.length)), board: this.state.board, restoring: false, timer: null };
      this.queue = [...frames, this.state.board];
      this.setBusy(true); this.next(false);
    });
  }
  cancel() { if (this.ready) this.snap(); else this.pending = null; }
  private options(): LayoutOptions { return { width: this.width, height: this.height, compact: this.state.compact, landscape: this.state.landscape, cellsRight: this.state.cellsRight, large: this.state.large, largeText: this.state.largeText }; }
  private makeLayout(board: Board) { return layoutBoard(board, this.options()); }
  private setBusy(value: boolean) { this.busy = value; this.onBusy(value); }
  private clearAnimation() { this.releaseSpeed(); this.finishing = false; this.clearHint(); this.queue = []; this.tweens = []; this.pending = null; }
  private changeSpeed(rate: number) {
    const now = performance.now();
    // Preserve the current progress when changing speed mid-flight.
    this.startTime = now - (now - this.startTime) * this.playbackRate / rate;
    this.playbackRate = rate;
  }
  private releaseSpeed() {
    const pointerId = this.speedPointer;
    this.speedPointer = null;
    this.changeSpeed(1);
    if (pointerId !== null && this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
  }
  private resize() {
    if (this.disposed || !this.ready) return;
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    if (width === this.width && height === this.height && this.layout) return;
    this.width = width; this.height = height; this.app.renderer.resize(width, height); this.snap();
  }
  private snap() {
    const preview = this.previewSession; this.previewSession = null;
    if (preview && preview.timer !== null) clearTimeout(preview.timer);
    this.clearAnimation(); this.cancelDrag();
    this.board = this.state.board; this.gameId = this.state.gameId;
    this.layout = this.makeLayout(this.board); this.poses = new Map(this.layout.poses);
    for (const [id, pose] of this.poses) this.place(id, pose);
    this.drawDecorations(this.layout); this.setBusy(false); this.startHint();
    // Finish restoration on the canvas before callers unlock the real game.
    if (preview) this.app.render();
    this.requestFrame(); preview?.resolve(false);
  }
  private clearHint() {
    for (const ghost of this.hintGhosts) ghost.node.destroy({ children: true });
    this.hintGhosts = [];
    const move = this.activeHint; this.activeHint = null;
    if (move) this.state.onHintEnd(move);
  }
  private startHint() {
    this.clearHint();
    const move = this.state.suggestion;
    if (!move || move === this.playedHint) return;
    this.playedHint = move;
    if (!this.layout || this.state.disabled || this.busy || this.drag || document.hidden || !canMove(this.state.board, move.from, move.to)) { this.state.onHintEnd(move); return; }
    this.activeHint = move;
    // Preview the resulting layout without changing the board or its real sprites.
    const destination = this.makeLayout(moveBoard(this.state.board, move));
    for (const card of picked(this.state.board, move.from)) {
      const from = this.layout.poses.get(card.id), to = destination.poses.get(card.id);
      if (!from || !to) continue;
      const node = new Container();
      const shadow = new Sprite(this.textures!.shadow);
      shadow.position.set(-CARD_SHADOW_PADDING + 4, -CARD_SHADOW_PADDING + 6); shadow.alpha = .45;
      const face = new Sprite(this.textures!.get(card.id, this.state.large, this.state.largeText));
      node.addChild(shadow, face); node.alpha = 0;
      this.hintLayer.addChild(node); this.hintGhosts.push({ node, from, to });
    }
    if (!this.hintGhosts.length) { this.clearHint(); return; }
    this.hintStart = performance.now(); this.requestFrame();
  }
  private animateHint(now: number) {
    if (!this.hintGhosts.length) return false;
    const elapsed = now - this.hintStart;
    // One demonstration: reveal at source, travel, hold at destination, fade.
    const phase = elapsed;
    if (elapsed >= (this.reduced.matches ? 2400 : 2000)) { this.clearHint(); return false; }
    const progress = this.reduced.matches ? 1 : Math.max(0, Math.min(1, (phase - 250) / 900));
    const t = progress * progress * (3 - 2 * progress);
    const alpha = this.reduced.matches ? .48 : phase < 250 ? phase / 250 * .58 : phase < 1800 ? .58 : Math.max(0, 1 - (phase - 1800) / 200) * .58;
    for (const { node, from, to } of this.hintGhosts) {
      node.position.set(mix(from.x, to.x, t), mix(from.y, to.y, t) - Math.sin(progress * Math.PI) * Math.min(18, from.width * .18));
      node.scale.set(mix(from.width, to.width, t) / CARD_TEXTURE_WIDTH, mix(from.height, to.height, t) / CARD_TEXTURE_HEIGHT);
      node.alpha = alpha;
    }
    return true;
  }
  private place(id: number, pose: CardPose, floating = false) {
    const view = this.views.get(id)!;
    view.node.position.set(pose.x, pose.y); view.node.scale.set(pose.width / CARD_TEXTURE_WIDTH, pose.height / CARD_TEXTURE_HEIGHT);
    view.node.zIndex = (floating ? 10000 : 0) + pose.order;
    view.node.visible = pose.visible || floating;
    view.face.texture = this.textures!.get(id, this.state.large, this.state.largeText);
    view.face.tint = pose.covered ? 0xb9c4b7 : 0xffffff;
    const strokeWidth = CARD_TEXTURE_WIDTH / pose.width;
    if (Math.abs(view.strokeWidth - strokeWidth) > .001) {
      view.strokeWidth = strokeWidth;
      view.edge.clear().roundRect(4, 3, CARD_TEXTURE_WIDTH - 8, CARD_TEXTURE_HEIGHT - 8, CARD_CORNER_RADIUS).stroke({ color: 0xb8bbaf, width: strokeWidth * .65, alpha: .8 });
    }
    view.edge.tint = pose.covered ? 0xd7dece : 0xffffff;
    view.shadow.position.set(-CARD_SHADOW_PADDING + (floating ? 5 : 0), -CARD_SHADOW_PADDING + (floating ? 9 : 0));
    view.shadow.alpha = floating ? 1 : .85;
  }
  private next(history: boolean) {
    const preview = this.previewSession;
    if (preview && this.queue.length === 1 && !preview.restoring) {
      preview.restoring = true;
      preview.timer = setTimeout(() => {
        if (this.previewSession !== preview) return;
        preview.timer = null; this.next(false);
      }, 260);
      return;
    }
    const board = this.queue.shift();
    if (!board) {
      if (preview) {
        this.previewSession = null; this.snap(); this.app.render(); preview.resolve(true);
      } else { this.releaseSpeed(); this.finishing = false; this.setBusy(false); this.requestFrame(); }
      return;
    }
    if (preview) preview.board = board;
    this.begin(this.makeLayout(board), history);
  }
  private begin(layout: BoardLayout, history: boolean, dealing = false) {
    this.clearHint();
    if (this.previewSession && (this.reduced.matches || document.hidden)) { this.snap(); return; }
    this.layout = layout; this.drawDecorations(layout);
    if (this.reduced.matches || document.hidden) {
      this.poses = new Map(layout.poses); for (const [id, pose] of this.poses) this.place(id, pose);
      if (this.queue.length) this.next(history); else { this.releaseSpeed(); this.finishing = false; this.setBusy(false); this.requestFrame(); }
      return;
    }
    this.tweens = [];
    for (const [id, to] of layout.poses) {
      const from = this.poses.get(id) ?? { ...to, x: layout.dealOrigin.x, y: layout.dealOrigin.y };
      if (!samePose(from, to) || dealing) {
        this.tweens.push({ id, from: { ...from, visible: true }, to, delay: dealing ? Math.floor(id / 4) * 12 : 0 });
        this.place(id, from, true);
      } else { this.poses.set(id, to); this.place(id, to); }
    }
    this.duration = this.previewSession ? this.previewSession.restoring ? 180 : this.previewSession.duration : dealing ? 360 : history ? 240 : this.queue.length ? 180 : 230;
    this.startTime = performance.now(); this.setBusy(true);
    if (!this.tweens.length) { this.next(history); return; }
    this.requestFrame();
  }
  private requestFrame() { if (this.frame === null && !this.disposed) this.frame = requestAnimationFrame(this.tick); }
  private tick = (now: number) => {
    this.frame = null;
    if (this.disposed || !this.ready) return;
    let active = false;
    for (const tween of this.tweens) {
      const fraction = Math.max(0, Math.min(1, ((now - this.startTime) * this.playbackRate - tween.delay) / this.duration));
      const t = 1 - (1 - fraction) ** 3;
      const shake = tween.shake ? Math.sin(fraction * Math.PI * 6) * 5 * Math.sin(fraction * Math.PI) : 0;
      const pose = { ...tween.to, x: mix(tween.from.x, tween.to.x, t) + shake, y: mix(tween.from.y, tween.to.y, t), width: mix(tween.from.width, tween.to.width, t), height: mix(tween.from.height, tween.to.height, t), visible: true };
      this.poses.set(tween.id, pose); this.place(tween.id, pose, true);
      if (fraction < 1) active = true;
    }
    if (this.tweens.length && !active) {
      this.tweens = [];
      this.poses = new Map(this.layout!.poses); for (const [id, pose] of this.poses) this.place(id, pose);
      this.next(false);
    }
    active = this.animateHint(now) || active;
    this.app.render();
    if (active) this.requestFrame();
  };
  private drawDecorations(layout: BoardLayout) {
    const board = this.previewSession?.board ?? this.state.board;
    const rules = board.rules;
    const priorityLocked = rules?.kind === 'suit-first' && board.foundations[rules.prioritySuit] < 13;
    const key = JSON.stringify([layout.targets, layout.labels, this.state.largeText, this.state.targetColumn, rules, priorityLocked]);
    if (key === this.decorationKey) {
      layout.labels.forEach((value, index) => {
        const label = this.labelViews[index];
        if (label) { label.text = value.text; label.position.set(value.x, value.y); }
      });
      return;
    }
    this.decorationKey = key;
    this.slots.clear();
    this.foundationIcons.forEach(icon => icon.destroy()); this.foundationIcons = [];
    this.labelViews.forEach(label => label.destroy()); this.labelViews = [];
    const label = (text: string, x: number, y: number, size: number, center = false, color = 0xb8cbb0) => {
      const node = new Text({ text, style: { fontFamily: 'Georgia, serif', fontSize: size, fill: color, wordWrap: false } });
      node.position.set(x, y); if (center) node.anchor.x = .5; this.decorations.addChild(node); this.labelViews.push(node);
      return node;
    };
    for (const item of layout.labels) label(item.text, item.x, item.y, item.size, item.center);
    const targetColumn = this.state.targetColumn === undefined ? undefined : layout.columns[this.state.targetColumn];
    if (targetColumn) {
      this.slots.roundRect(targetColumn.x + 1, targetColumn.y + 1, Math.max(1, targetColumn.width - 2), Math.max(1, targetColumn.height - 2), 5)
        .fill({ color: 0xe4c77d, alpha: .06 }).stroke({ color: 0xe4c77d, alpha: .8, width: 2 });
      label('目标', targetColumn.x + targetColumn.width / 2, targetColumn.y + targetColumn.height - (this.state.largeText ? 26 : 18), this.state.largeText ? 16 : 10, true, 0xe4c77d);
    }
    for (const { target, box } of layout.targets) {
      if (target.kind === 'column') continue;
      this.slots.roundRect(box.x + 1, box.y + 1, box.width - 2, box.height - 2, box.width * CARD_CORNER_RADIUS / CARD_TEXTURE_WIDTH).fill({ color: 0x102f25, alpha: .12 }).stroke({ color: 0xc2d4ad, alpha: .4, width: 1 });
      if (target.kind === 'cell' && rules?.kind === 'three-cells' && target.index === 3) {
        this.slots.roundRect(box.x + 2, box.y + 2, box.width - 4, box.height - 4, 4).fill({ color: 0x102f25, alpha: .65 });
        label('封印', box.x + box.width / 2, box.y + box.height * .42, Math.min(this.state.largeText ? 18 : 13, box.width * (this.state.largeText ? .4 : .25)), true, 0x9eaf9d);
        continue;
      }
      if (target.kind === 'foundation') {
        const centerX = box.x + box.width / 2;
        // Fixed vector silhouettes avoid platform emoji colors and font metrics.
        const suitSize = Math.min(22, box.width * .42, box.height * .27);
        const range = label(priorityLocked && target.index !== rules?.prioritySuit ? '待解锁' : rules?.kind === 'suit-first' && target.index === rules.prioritySuit ? '优先 A–K' : rules?.kind === 'reverse' ? 'K–A' : 'A–K', centerX, 0, Math.min(this.state.largeText ? 16 : 10, box.width * (this.state.largeText ? (priorityLocked ? .24 : .3) : .19)), true);
        const gap = Math.min(8, box.width * .12);
        const top = box.y + (box.height - suitSize - gap - range.height) / 2;
        const icon = new Graphics().svg(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><path d="${SUIT_PATHS[target.index]}" fill="#9eaf9d"/></svg>`);
        icon.position.set(centerX - suitSize / 2, top);
        icon.scale.set(suitSize / 100);
        this.decorations.addChild(icon); this.foundationIcons.push(icon);
        range.y = top + suitSize + gap;
      } else label('+', box.x + box.width / 2, box.y + box.height * .27, Math.min(30, box.width * .55), true);
    }
  }
  private hitCard(x: number, y: number): CardPose | null {
    return [...this.poses.values()].filter(pose => pose.visible && contains(pose, x, y)).sort((a, b) => b.order - a.order)[0] ?? null;
  }
  private target(x: number, y: number, from?: Source): Target | null {
    const targets = this.layout?.targets ?? [];
    const exact = targets.find(({ box }) => contains(box, x, y))?.target ?? null;
    if (!from || (exact && canMove(this.state.board, from, exact))) return exact;
    let nearest: Target | null = null, distance = Infinity;
    for (const { target, box } of targets) {
      if (!canMove(this.state.board, from, target)) continue;
      const dx = Math.max(box.x - x, 0, x - box.x - box.width), dy = Math.max(box.y - y, 0, y - box.y - box.height);
      if (dx <= 12 && dy <= 16 && Math.hypot(dx, dy) < distance) { nearest = target; distance = Math.hypot(dx, dy); }
    }
    return nearest ?? exact;
  }
  private pointerPosition(event: PointerEvent, rect: DOMRect) {
    // In the browser fallback the entire app rotates clockwise by 90 degrees.
    // Invert that rotation before hit testing or calculating a drag delta.
    return this.state.rotated
      ? { x: (event.clientY - rect.top) * this.width / rect.height, y: (rect.right - event.clientX) * this.height / rect.width }
      : { x: (event.clientX - rect.left) * this.width / rect.width, y: (event.clientY - rect.top) * this.height / rect.height };
  }

  private pointerDown = (event: PointerEvent) => {
    if (this.previewSession) return;
    if (event.isPrimary && event.button === 0 && this.busy && this.finishing && !this.state.paused) {
      event.preventDefault();
      this.speedPointer = event.pointerId; this.canvas.setPointerCapture(event.pointerId);
      this.changeSpeed(4); this.requestFrame(); return;
    }
    if (!event.isPrimary || event.button !== 0 || this.state.disabled || this.busy) return;
    this.clearHint(); this.requestFrame();
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const { x, y } = this.pointerPosition(event, rect);
    const hit = this.hitCard(x, y);
    if (!hit) { const target = this.target(x, y); if (target && (target.kind !== 'column' || !this.state.board.columns[target.index].length)) this.state.onTarget(target); else this.state.onBlank(); return; }
    const cards = picked(this.state.board, hit.source);
    // Non-movable cards still receive taps for the existing selection message.
    this.drag = { pointerId: event.pointerId, from: hit.source, ids: sequence(cards, this.state.board) ? cards.map(card => card.id) : [], downX: x, downY: y, active: false, original: new Map(this.poses), rect };
    this.canvas.setPointerCapture(event.pointerId);
  };
  private pointerMove = (event: PointerEvent) => {
    const drag = this.drag; if (!drag || event.pointerId !== drag.pointerId || !drag.ids.length) return;
    const { x, y } = this.pointerPosition(event, drag.rect);
    const dx = x - drag.downX, dy = y - drag.downY;
    if (!drag.active && Math.hypot(dx, dy) < 9) return;
    event.preventDefault();
    if (!drag.active) { drag.active = true; this.state.onDrag(true, drag.from); }
    for (const id of drag.ids) { const origin = drag.original.get(id)!; const pose = { ...origin, x: origin.x + dx, y: origin.y + dy }; this.poses.set(id, pose); this.place(id, pose, true); }
    this.requestFrame();
  };
  private pointerUp = (event: PointerEvent) => {
    if (event.pointerId === this.speedPointer) { this.releaseSpeed(); return; }
    const drag = this.drag; if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.active) { this.drag = null; this.state.onCard(drag.from); return; }
    const { x, y } = this.pointerPosition(event, drag.rect);
    this.pointerMove(event);
    const target = this.target(x, y, drag.from);
    const moved = this.state.onDrop(drag.from, target);
    this.drag = null; this.state.onDrag(false);
    if (!moved) {
      const rejected = !target || target.kind !== drag.from.kind || target.index !== drag.from.index;
      this.layout = this.makeLayout(this.state.board); this.queue = [];
      this.tweens = drag.ids.map(id => ({ id, from: this.poses.get(id)!, to: this.layout!.poses.get(id)!, shake: rejected, delay: 0 }));
      this.duration = rejected ? 300 : 180; this.startTime = performance.now(); this.setBusy(true);
      if (this.reduced.matches) this.snap(); else this.requestFrame();
    }
  };
  private cancelDrag() {
    if (!this.drag) return;
    const pointerId = this.drag.pointerId;
    this.drag = null; this.state.onDrag(false);
    if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
    if (this.layout) { this.poses = new Map(this.layout.poses); for (const [id, pose] of this.poses) this.place(id, pose); }
    this.requestFrame();
  }
  private pointerCancel = (event: PointerEvent) => { if (event.pointerId === this.speedPointer) this.releaseSpeed(); this.cancelDrag(); };
  private lostCapture = (event: PointerEvent) => { if (event.pointerId === this.speedPointer) this.releaseSpeed(); if (this.drag) this.cancelDrag(); };
  private motionPreference = () => { if (this.reduced.matches) this.snap(); };
  private visibility = () => { if (document.hidden) this.snap(); };
  private blur = () => { if (this.previewSession) this.snap(); else this.releaseSpeed(); };
  destroy() {
    if (this.disposed) return;
    if (this.previewSession) this.snap();
    this.releaseSpeed();
    this.disposed = true; this.observer?.disconnect();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.reduced.removeEventListener('change', this.motionPreference); document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('blur', this.blur);
    if (!this.ready) return;
    const canvas = this.canvas;
    canvas.removeEventListener('pointerdown', this.pointerDown); canvas.removeEventListener('pointermove', this.pointerMove); canvas.removeEventListener('pointerup', this.pointerUp); canvas.removeEventListener('pointercancel', this.pointerCancel); canvas.removeEventListener('lostpointercapture', this.lostCapture);
    this.app.destroy(true, { children: true }); this.textures?.destroy();
  }
}
