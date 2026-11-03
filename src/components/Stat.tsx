import type { ReactNode } from 'react';

interface Props { label: string; value: string | number; unit?: string; children?: ReactNode; className?: string; }

/** Muted label over a big italic serif number (design-spec §5 Stat); children hold a meter or tag. */
export function Stat({ label, value, unit, children, className }: Props) {
  return (
    <div className={['stat', className ?? ''].filter(Boolean).join(' ')}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit && <span className="stat-unit"> {unit}</span>}
      </span>
      {children}
    </div>
  );
}
