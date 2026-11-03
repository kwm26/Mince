import { useEffect, useId, useState } from 'react';
import { IconButton } from './Button';
import { MinusIcon, PlusIcon } from './icons';

interface Props {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

/** − [value] + with 48px buttons and a typed field that commits on blur or Enter. */
export function Stepper({ label, value, unit, min, max, step, onChange }: Props) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && draft.trim() !== '') onChange(Math.min(max, Math.max(min, n)));
    else setDraft(String(value));
  };

  return (
    <div className="stepper">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="stepper-row">
        <IconButton label={`${step} ${unit} less`} onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min}>
          <MinusIcon size={22} />
        </IconButton>
        <span className="stepper-value">
          <input
            id={id}
            className="field-input stepper-input"
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
          />
          <span className="stepper-unit">{unit}</span>
        </span>
        <IconButton label={`${step} ${unit} more`} onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max}>
          <PlusIcon size={22} />
        </IconButton>
      </div>
    </div>
  );
}
