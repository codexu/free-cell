import type { Difficulty } from './difficulty';

type GameplayBadgeKind = Difficulty | 'daily-master' | 'daily-endgame' | 'daily-special' | 'daily-precision' | 'daily-same-suit' | 'daily-reverse';

export function GameplayBadge({ kind }: { kind: GameplayBadgeKind }) {
  return <span className={`gameplay-badge gameplay-badge-${kind}`} aria-hidden="true">
    <img src={`${import.meta.env.BASE_URL}badges/gameplay-${kind}.svg`} alt="" draggable={false} />
  </span>;
}
