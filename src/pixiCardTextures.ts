import { Rectangle, Texture } from 'pixi.js';
import { rankName, type Card } from './game';

export const CARD_TEXTURE_WIDTH = 256;
export const CARD_TEXTURE_HEIGHT = 366;
export const CARD_SHADOW_PADDING = 20;
export const CARD_HEADER_TOP = 18;
export const CARD_LABEL_RATIO = .297;
export const CARD_LARGE_LABEL_RATIO = .324;
export const CARD_CORNER_RADIUS = 22;
export const SUIT_PATHS = [
  'M50 4a20 20 0 0 0-15 33A22 22 0 1 0 41 72c-1 12-5 17-13 22h44c-8-5-12-10-13-22a22 22 0 1 0 6-35A20 20 0 0 0 50 4Z',
  'M50 3 91 50 50 97 9 50Z',
  'M50 92C39 77 8 57 8 31 8 5 39 0 50 23 61 0 92 5 92 31c0 26-31 46-42 61Z',
  'M50 3C38 22 8 37 8 60c0 23 27 32 39 14-1 10-5 15-15 22h36c-10-7-14-12-15-22 12 18 39 9 39-14C92 37 62 22 50 3Z',
];
function roundedCard(context: CanvasRenderingContext2D) {
  // Use explicit paths rather than Canvas roundRect for older WebViews.
  const x = 4, y = 3, w = 248, h = 358, r = CARD_CORNER_RADIUS;
  context.beginPath(); context.moveTo(x + r, y); context.lineTo(x + w - r, y);
  context.quadraticCurveTo(x + w, y, x + w, y + r); context.lineTo(x + w, y + h - r);
  context.quadraticCurveTo(x + w, y + h, x + w - r, y + h); context.lineTo(x + r, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - r); context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y); context.closePath();
}
function paperGrain() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法生成纸面纹理');
  const pixels = context.createImageData(64, 64);
  let seed = 617;
  for (let index = 0; index < pixels.data.length; index += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 90 + (seed >>> 24) % 100;
    pixels.data[index] = value; pixels.data[index + 1] = value; pixels.data[index + 2] = value - 8;
    pixels.data[index + 3] = 14;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}
function paintPaper(context: CanvasRenderingContext2D, grain: HTMLCanvasElement) {
  roundedCard(context);
  const paper = context.createLinearGradient(20, 3, 230, 361);
  paper.addColorStop(0, '#ffffff'); paper.addColorStop(.45, '#fffef9'); paper.addColorStop(1, '#f0ede2');
  context.fillStyle = paper; context.fill();
  context.save(); context.clip();
  const sheen = context.createRadialGradient(65, 30, 0, 65, 30, 290);
  sheen.addColorStop(0, 'rgba(255,255,255,.55)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = sheen; context.fillRect(0, 0, CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT);
  const texture = context.createPattern(grain, 'repeat');
  if (texture) { context.fillStyle = texture; context.fillRect(0, 0, CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT); }
  // A shallow lip inside the same silhouette suggests paper thickness,
  // without an inset rectangle that would look like a second card face.
  const lip = context.createLinearGradient(0, 347, 0, 361);
  lip.addColorStop(0, 'rgba(104,108,91,0)'); lip.addColorStop(.7, 'rgba(104,108,91,.045)'); lip.addColorStop(1, 'rgba(104,108,91,.24)');
  context.fillStyle = lip; context.fillRect(0, 347, CARD_TEXTURE_WIDTH, 14);
  const light = context.createLinearGradient(0, 3, 0, 12);
  light.addColorStop(0, 'rgba(255,255,255,.9)'); light.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = light; context.fillRect(0, 3, CARD_TEXTURE_WIDTH, 9);
  context.restore();
}
type InkBounds = { x: number; y: number; width: number; height: number };
function suitBounds(paths: Path2D[]): InkBounds[] {
  // Measure the four silhouettes once: their 100×100 view boxes contain
  // different amounts of empty space, especially above the heart.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 400;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法测量花色轮廓');
  return paths.map(path => {
    context.clearRect(0, 0, 400, 400);
    context.save(); context.scale(4, 4); context.fill(path); context.restore();
    const pixels = context.getImageData(0, 0, 400, 400).data;
    let left = 400, top = 400, right = 0, bottom = 0;
    for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) {
      if (pixels[(y * 400 + x) * 4 + 3] < 128) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
    }
    return { x: left / 4, y: top / 4, width: (right - left) / 4, height: (bottom - top) / 4 };
  });
}
function suit(context: CanvasRenderingContext2D, path: Path2D, bounds: InkBounds, x: number, y: number, size: number) {
  const scale = size / bounds.height;
  context.save();
  context.translate(x + (size - bounds.width * scale) / 2 - bounds.x * scale, y - bounds.y * scale);
  context.scale(scale, scale); context.fill(path); context.restore();
}
function rank(context: CanvasRenderingContext2D, value: string, label: number) {
  context.font = `800 ${label}px Arial, Helvetica, sans-serif`;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  const metrics = context.measureText(value);
  // Match the visible ink height to the suit, rather than the font's em box.
  const ascent = metrics.actualBoundingBoxAscent || label * .73;
  const descent = metrics.actualBoundingBoxDescent || 0;
  const scaleY = label / (ascent + descent);
  const available = CARD_TEXTURE_WIDTH - label - 28;
  const left = metrics.actualBoundingBoxLeft || 0;
  const width = left + (metrics.actualBoundingBoxRight || metrics.width);
  const scaleX = Math.min(scaleY, available / Math.max(1, width));
  context.save(); context.translate(12 + left * scaleX, CARD_HEADER_TOP + ascent * scaleY);
  context.scale(scaleX, scaleY); context.fillText(value, 0, 0); context.restore();
}
export function createCardTextures() {
  const paths = SUIT_PATHS.map(path => new Path2D(path));
  const bounds = suitBounds(paths);
  const grain = paperGrain();
  // A separate padded texture keeps the shadow outside the face's atlas frame.
  // It can cast onto the exposed strip of the card underneath without clipping.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = CARD_TEXTURE_WIDTH + CARD_SHADOW_PADDING * 2;
  shadowCanvas.height = CARD_TEXTURE_HEIGHT + CARD_SHADOW_PADDING * 2;
  const shadowContext = shadowCanvas.getContext('2d');
  if (!shadowContext) throw new Error('无法生成纸牌阴影');
  shadowContext.translate(CARD_SHADOW_PADDING, CARD_SHADOW_PADDING);
  roundedCard(shadowContext);
  shadowContext.shadowColor = 'rgba(0, 18, 10, .46)';
  shadowContext.shadowBlur = 12; shadowContext.shadowOffsetY = 4;
  shadowContext.fillStyle = '#000'; shadowContext.fill();
  shadowContext.shadowColor = 'transparent';
  shadowContext.globalCompositeOperation = 'destination-out';
  shadowContext.fill();
  const shadow = Texture.from(shadowCanvas);
  const atlases: Texture[] = [];
  const textures: Texture[][] = [];
  for (const large of [false, true]) {
    const canvas = document.createElement('canvas');
    canvas.width = CARD_TEXTURE_WIDTH * 13; canvas.height = CARD_TEXTURE_HEIGHT * 4;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法生成牌面纹理');
    for (let id = 0; id < 52; id++) {
      const card: Card = { id, rank: Math.floor(id / 4) + 1, suit: id % 4 };
      context.save(); context.translate((card.rank - 1) * CARD_TEXTURE_WIDTH, card.suit * CARD_TEXTURE_HEIGHT);
      paintPaper(context, grain);
      // The board draws one screen-sized border separately; baking it into
      // the face would shrink it below a pixel on narrow mobile cards.
      context.fillStyle = card.suit === 1 || card.suit === 2 ? '#c6263c' : '#17212b';
      // Rank and header suit have the same size. Only one central suit.
      const label = CARD_TEXTURE_WIDTH * (large ? CARD_LARGE_LABEL_RATIO : CARD_LABEL_RATIO);
      rank(context, rankName(card.rank), label);
      suit(context, paths[card.suit], bounds[card.suit], CARD_TEXTURE_WIDTH - label - 12, CARD_HEADER_TOP, label);
      const emblem = CARD_TEXTURE_WIDTH * .495;
      suit(context, paths[card.suit], bounds[card.suit], (CARD_TEXTURE_WIDTH - emblem) / 2, CARD_TEXTURE_HEIGHT * .60 - emblem / 2, emblem);
      context.restore();
    }
    const atlas = Texture.from(canvas); atlases.push(atlas);
    textures.push(Array.from({ length: 52 }, (_, id) => new Texture({ source: atlas.source, frame: new Rectangle(Math.floor(id / 4) * CARD_TEXTURE_WIDTH, id % 4 * CARD_TEXTURE_HEIGHT, CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT) })));
  }
  return { shadow, get: (id: number, large: boolean) => textures[large ? 1 : 0][id], destroy: () => { textures.flat().forEach(texture => texture.destroy(false)); atlases.forEach(texture => texture.destroy(true)); shadow.destroy(true); } };
}
