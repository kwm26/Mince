interface Props { label: string; value: string | number; unit?: string; }

/** Muted label over a big italic serif number (design-spec §5 Stat). */
export function Stat({ label, value, unit }: Props) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit && <span className="stat-unit"> {unit}</span>}
      </span>
    </div>
  );
}
