import type { ReactNode } from 'react';
import { ChevronRightIcon } from './icons';
import { UseSoonTag } from './UseSoonTag';

export interface PantryRow {
  id: string;
  name: string;
  amount: string;      // already formatted, e.g. "2 cups"
  daysLeft: number;
  daysLeftLabel: string;
  useSoon: boolean;
}

interface Props {
  rows: PantryRow[];
  onSelect?: (id: string) => void;   // makes each row a 48px button that opens the item
  empty?: ReactNode;
}

/** What's on hand, soonest to turn first. Rows are reading layer; only use-soon items get a tag. */
export function PantryList({ rows, onSelect, empty }: Props) {
  if (rows.length === 0) return <>{empty ?? <p className="muted">Nothing on hand yet.</p>}</>;
  return (
    <ul className="pantry-list">
      {rows.map((row) => {
        const content = (
          <>
            <span className="pantry-name">{row.name}</span>
            <span className="pantry-amount">{row.amount}</span>
            <span className="pantry-left">
              {row.useSoon ? <UseSoonTag>{row.daysLeftLabel}</UseSoonTag> : <span className="muted">{row.daysLeftLabel}</span>}
            </span>
          </>
        );
        return (
          <li key={row.id}>
            {onSelect ? (
              <button type="button" className="pantry-row pantry-row-button" onClick={() => onSelect(row.id)} aria-label={`${row.name}, ${row.amount}, ${row.daysLeftLabel} left. Edit`}>
                {content}
                <ChevronRightIcon size={18} />
              </button>
            ) : (
              <div className="pantry-row">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
