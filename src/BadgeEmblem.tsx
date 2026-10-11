const RANK_BADGES = ['seedling', 'card-fan', 'heart-bloom', 'scroll', 'open-book', 'quill', 'woven-ribbon', 'compass', 'bridge', 'gold-key', 'guardian', 'hourglass', 'helm', 'firebird', 'owl', 'royal-crown', 'shooting-star', 'lotus-jewel', 'champion-cup', 'lion', 'winged-ace', 'solar-wheel', 'moon-swan', 'golden-castle', 'diamond-orbit'];
const CHALLENGE_BADGES = ['monthly-bud', 'monthly-blossom', 'monthly-harvest', 'monthly-perfect'];

// Original standalone SVG illustrations. An image isolates each asset's
// gradient IDs and keeps artwork fixed across card movement and rerenders.
export function BadgeEmblem({ tier, earned = true, variant = 'rank' }: { tier: number; earned?: boolean; variant?: 'rank' | 'challenge' }) {
  const badges = variant === 'challenge' ? CHALLENGE_BADGES : RANK_BADGES;
  const index = Math.max(0, Math.min(badges.length - 1, tier));
  return <span className={`badge-emblem ${earned ? '' : 'badge-locked'}`} aria-hidden="true">
    <img className="badge-art" src={`${import.meta.env.BASE_URL}badges/${badges[index]}.svg`} alt="" draggable={false} />
  </span>;
}
