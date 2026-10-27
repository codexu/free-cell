import { sequence, type Board, type Source, type Target } from './game';
import { CARD_HEADER_TOP, CARD_TEXTURE_WIDTH, CARD_LABEL_RATIO, CARD_LARGE_LABEL_RATIO, CARD_ACCESSIBLE_LABEL_RATIO } from './pixiCardTextures';

export type Box = { x: number; y: number; width: number; height: number };
export type CardPose = Box & { source: Source; order: number; visible: boolean; covered: boolean };
export type BoardLayout = { poses: Map<number, CardPose>; targets: { target: Target; box: Box }[]; labels: { text: string; x: number; y: number; size: number; center?: boolean }[]; columns: Box[]; gaps: number[]; dealOrigin: { x: number; y: number } };
export type LayoutOptions = { width: number; height: number; compact: boolean; landscape: boolean; cellsRight: boolean; large: boolean; largeText: boolean };
export function layoutBoard(board: Board, options: LayoutOptions): BoardLayout {
  const { width, height, compact, landscape, cellsRight, large, largeText } = options;
  const poses = new Map<number, CardPose>();
  const targets: BoardLayout['targets'] = [], labels: BoardLayout['labels'] = [];
  const fitted = compact || landscape;
  const gap = landscape ? Math.max(4, Math.min(10, width * .008)) : compact ? 4 : 9;
  let columnX = 0, columnY = 0, columnAreaWidth = width, columnAreaHeight = height;
  let railWidth = 0;
  if (landscape) {
    const gutter = Math.max(10, Math.min(28, width * .02));
    // Eight tableau columns and two side piles share the same base card width.
    // Keep this reservation stable when long columns shrink the actual cards.
    railWidth = Math.max(1, (width - 2 * gutter - 7 * gap) / 10);
    columnX = railWidth + gutter;
    columnAreaWidth = Math.max(8, width - 2 * (railWidth + gutter));
  } else {
    const groupGap = compact ? 12 : 30;
    const groupWidth = (width - groupGap) / 2;
    const slotWidth = (groupWidth - 3 * gap) / 4;
    const labelHeight = largeText ? 28 : compact ? 17 : 26;
    columnY = labelHeight + slotWidth * 1.43 + (compact ? 21 : 44);
    columnAreaHeight = Math.max(1, height - columnY);
    for (const kind of ['foundation', 'cell'] as const) {
      const right = kind === 'cell' ? cellsRight : !cellsRight;
      const groupX = right ? groupWidth + groupGap : 0;
      labels.push({ text: kind === 'cell' ? '中转格' : '收牌区', x: groupX, y: 0, size: largeText ? 16 : compact ? 9 : 11 });
      for (let index = 0; index < 4; index++) targets.push({ target: { kind, index }, box: { x: groupX + index * (slotWidth + gap), y: labelHeight, width: slotWidth, height: slotWidth * 1.43 } });
    }
  }
  const baseWidth = Math.max(1, (columnAreaWidth - gap * 7) / 8);
  const longest = Math.max(1, ...board.columns.map(column => column.length));
  const font = baseWidth * (largeText ? CARD_ACCESSIBLE_LABEL_RATIO : large ? CARD_LARGE_LABEL_RATIO : CARD_LABEL_RATIO);
  // Include the header's inset so lowering it never hides its bottom under
  // the next card. Keep just two screen pixels below the exposed ink.
  const exposed = font + baseWidth * (CARD_HEADER_TOP + 4) / CARD_TEXTURE_WIDTH;
  const columnFit = (columnAreaHeight - 8 - (longest - 1) * 2) / (baseWidth * 1.43 + (longest - 1) * exposed);
  // Four full cards, a heading and three fixed gaps must fit in each side pile.
  // Apply the constraint to every card rather than resizing side piles alone.
  const pileFit = landscape ? (height - (largeText ? 29 : 21) - 3 * 6 - 4) / (4 * baseWidth * 1.43) : 1;
  const fit = Math.max(.01, Math.min(1, columnFit, pileFit));
  const cardWidth = baseWidth * fit, cardHeight = cardWidth * 1.43;
  if (landscape) {
    labels.push({ text: '收牌区', x: railWidth / 2, y: 1, size: largeText ? Math.max(10, Math.min(16, railWidth / 3)) : 10, center: true }, { text: '中转格', x: width - railWidth / 2, y: 1, size: largeText ? Math.max(10, Math.min(16, railWidth / 3)) : 10, center: true });
    for (const kind of ['foundation', 'cell'] as const) {
      const railX = kind === 'foundation' ? 0 : width - railWidth;
      const x = railX + (railWidth - cardWidth) / 2;
      for (let index = 0; index < 4; index++) targets.push({ target: { kind, index }, box: { x, y: (largeText ? 29 : 21) + index * (cardHeight + 6), width: cardWidth, height: cardHeight } });
    }
  }
  const columns: Box[] = [], gaps: number[] = [];
  board.columns.forEach((column, index) => {
    const x = columnX + index * (baseWidth + gap);
    const box = { x, y: columnY, width: baseWidth, height: columnAreaHeight }; columns.push(box);
    targets.push({ target: { kind: 'column', index }, box });
    const preferred = exposed * fit + 2;
    const strip = Math.max(0, Math.min(preferred, (columnAreaHeight - cardHeight - 8) / Math.max(1, column.length - 1))); gaps.push(strip);
    column.forEach((card, offset) => poses.set(card.id, { x: x + (baseWidth - cardWidth) / 2, y: columnY + offset * strip + 4, width: cardWidth, height: cardHeight, source: { kind: 'column', index, offset }, order: offset * 8 + index, visible: true, covered: !sequence(column.slice(offset), board) }));
    if (!fitted) labels.push({ text: String(column.length || '—'), x: x + baseWidth / 2, y: columnY + (column.length ? (column.length - 1) * strip : 0) + cardHeight + 10, size: largeText ? 16 : 11, center: true });
  });
  for (const { target, box } of targets) {
    if (target.kind === 'cell') {
      const card = board.cells[target.index];
      if (card) poses.set(card.id, { ...box, source: { ...target, offset: 0 }, order: 500 + target.index, visible: true, covered: false });
    } else if (target.kind === 'foundation') {
      const top = board.foundations[target.index];
      for (let count = 1; count <= top; count++) {
        const rank = board.rules?.kind === 'reverse' ? 14 - count : count;
        const id = (rank - 1) * 4 + target.index;
        poses.set(id, { ...box, source: { ...target, offset: 0 }, order: 600 + count * 4 + target.index, visible: count === top, covered: false });
      }
    }
  }
  return { poses, targets, labels, columns, gaps, dealOrigin: { x: width / 2 - cardWidth / 2, y: Math.max(0, columnY - cardHeight / 2) } };
}
export const contains = (box: Box, x: number, y: number) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
