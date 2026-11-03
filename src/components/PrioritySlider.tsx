import { useEffect, useId, useState } from 'react';
import { levelWord, type Level } from '../lib/priorities';

interface Props {
  label: string;
  hint: string;               // what "High" means, e.g. "Use up every pack"
  level: Level;
  disabled?: boolean;
  onCommit: (level: Level) => void;   // called on release, not while dragging
}

/** Low / Medium / High slider (design-spec §5 Priorities). Releasing it commits, which re-solves. */
export function PrioritySlider({ label, hint, level, disabled, onCommit }: Props) {
  const id = useId();
  const [value, setValue] = useState<Level>(level);
  useEffect(() => setValue(level), [level]);

  const commit = () => {
    if (value !== level) onCommit(value);
  };

  return (
    <div className="slider">
      <div className="slider-head">
        <label htmlFor={id} className="slider-label">
          {label}
        </label>
        <span className="slider-value">{levelWord(value)}</span>
      </div>
      <input
        id={id}
        className="slider-input"
        type="range"
        min={0}
        max={2}
        step={1}
        value={value}
        disabled={disabled}
        aria-valuetext={levelWord(value)}
        aria-describedby={`${id}-hint`}
        onChange={(e) => setValue(Number(e.target.value) as Level)}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <p id={`${id}-hint`} className="muted">
        {hint}
      </p>
    </div>
  );
}
