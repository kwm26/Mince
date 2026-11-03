interface Option { id: string; label: string; }

interface Props {
  label: string;           // accessible name for the group
  options: Option[];
  value: string;
  onChange: (id: string) => void;
}

/** One-of-many chips that wrap instead of scrolling (design-spec §11 lens chips). */
export function ChoiceChips({ label, options, value, onChange }: Props) {
  return (
    <div className="choice-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className="choice-chip"
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
