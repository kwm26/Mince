import type { ReactNode } from 'react';

/** Bottom dock for a screen's primary action, above the tab bar, in the thumb zone. */
export function Dock({ children, split }: { children: ReactNode; split?: boolean }) {
  return <div className={split ? 'dock dock-split' : 'dock'}>{children}</div>;
}

interface HeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;              // one word may be wrapped in <Accent>
  actions?: ReactNode;
  children?: ReactNode;          // a muted sentence under the title
}

export function ScreenHeader({ eyebrow, title, actions, children }: HeaderProps) {
  return (
    <header className="screen-head">
      <div className="screen-head-row">
        <div className="screen-head-text">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
        </div>
        {actions && <div className="screen-head-actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** The one italic accent word in a screen title ("Your *kitchen*"). */
export function Accent({ children }: { children: ReactNode }) {
  return <em className="accent">{children}</em>;
}

/** One-per-screen sticker (design-spec §5), e.g. the word "share". */
export function Sticker({ children }: { children: ReactNode }) {
  return <span className="sticker">{children}</span>;
}

interface SegmentedProps<T extends string> {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}

/** Week / Map toggle, styled like the tab bar (design-spec §11). */
export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className="segment" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
