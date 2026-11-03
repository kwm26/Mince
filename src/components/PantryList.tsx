import { EmptyState } from './EmptyState';
import { UseSoonTag } from './UseSoonTag';

export interface PantryRow {
  id: string;
  name: string;
  amount: string;      // already formatted, e.g. "2 cups"
  daysLeft: number;
  daysLeftLabel: string;
  useSoon: boolean;
}

/** What's on hand, soonest to turn first. Rows are reading layer; only use-soon items get a tag. */
export function PantryList({ rows }: { rows: PantryRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="Nothing on hand yet">This fridge is empty.</EmptyState>;
  }
  return (
    <ul className="pantry-list">
      {rows.map((row) => (
        <li key={row.id} className="pantry-row">
          <span className="pantry-name">{row.name}</span>
          <span className="pantry-amount">{row.amount}</span>
          <span className="pantry-left">
            {row.useSoon ? <UseSoonTag>{row.daysLeftLabel}</UseSoonTag> : <span className="muted">{row.daysLeftLabel}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
