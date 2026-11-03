interface Props {
  value: number;
  max: number;
  label: string;          // accessible name, e.g. "Protein per day against your target"
  valueText: string;      // spoken value, e.g. "142 of 150 g"
}

/** 14px meter, 2px ink border, accent fill with an ink right edge (design-spec §5). */
export function Meter({ value, max, label, valueText }: Props) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      className="meter"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(Math.min(value, max))}
      aria-valuetext={valueText}
    >
      <span className="meter-fill" data-empty={pct === 0} style={{ width: `${pct}%` }} />
    </div>
  );
}
