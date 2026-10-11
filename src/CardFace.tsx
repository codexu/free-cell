import { memo, type CSSProperties } from 'react';
import { rankName, red, type Card } from './game';

const PATHS = [
  'M50 4a20 20 0 0 0-15 33A22 22 0 1 0 41 72c-1 12-5 17-13 22h44c-8-5-12-10-13-22a22 22 0 1 0 6-35A20 20 0 0 0 50 4Z',
  'M50 3 91 50 50 97 9 50Z',
  'M50 92C39 77 8 57 8 31 8 5 39 0 50 23 61 0 92 5 92 31c0 26-31 46-42 61Z',
  'M50 3C38 22 8 37 8 60c0 23 27 32 39 14-1 10-5 15-15 22h36c-10-7-14-12-15-22 12 18 39 9 39-14C92 37 62 22 50 3Z',
];
// Cache one independent SVG image per suit; card movement cannot affect its paths.
// The standalone images need explicit colors because they do not inherit page CSS.
const CARD_ART = PATHS.map((path, suit) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><path d="${path}" fill="${suit === 1 || suit === 2 ? '#c6263c' : '#17212b'}"/></svg>`
)}`);

export const PlayingCard = memo(function PlayingCard({ card, covered = false, style }: { card: Card; covered?: boolean; style?: CSSProperties }) {
  return <div style={style} className={`playing-card ${red(card) ? 'red' : 'black'} ${card.rank === 10 ? 'rank-ten' : ''} ${covered ? 'covered' : ''}`}>
    <span className="card-header"><b>{rankName(card.rank)}</b><img className="header-suit" src={CARD_ART[card.suit]} alt="" aria-hidden="true" draggable={false} decoding="sync" /></span>
    <img className="single-suit" src={CARD_ART[card.suit]} alt="" aria-hidden="true" draggable={false} decoding="sync" />
  </div>;
});
