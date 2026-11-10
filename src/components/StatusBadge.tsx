import { STATUS_LABEL, STATUS_TONE, type StatusKind } from '../lib/engine';
import { ArrowUpRight, CircleDashed, Equal, TrendingDown, TrendingUp } from '../ui/icons';
import { cx } from '../ui/kit';

const ICON = { insufficient: CircleDashed, ahead: TrendingUp, ontrack: TrendingUp, slow: ArrowUpRight, stall: Equal, regress: TrendingDown } as const;

/** Statut de progression d'un exercice : icône + libellé (jamais la couleur seule). */
export function StatusBadge({ kind, compact }: { kind: StatusKind; compact?: boolean }) {
  const Icon = ICON[kind];
  return (
    <span className={cx('chip', `tone-${STATUS_TONE[kind]}`)} title={STATUS_LABEL[kind]}>
      <Icon size={13} strokeWidth={2.5} />
      {!compact && STATUS_LABEL[kind]}
    </span>
  );
}
