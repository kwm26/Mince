import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { CheckIcon, PlusIcon } from './icons';

type NativeButton = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>;

interface ButtonProps extends NativeButton {
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary';
  block?: boolean;                 // full width, 56px tall (dock buttons)
  loading?: boolean;
  loadingLabel?: string;           // shown with the spinner, e.g. "Planning…"
  icon?: ReactNode;
}

/** Signal-layer button (design-spec §5): 3px ink outline, hard shadow, sinks into it on press. */
export function Button({ type = 'button', variant = 'primary', block, loading, loadingLabel = 'Working…', icon, children, className, disabled, onClick, ...rest }: ButtonProps) {
  const cls = ['btn', `btn-${variant}`, block ? 'btn-block' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button
      type={type}
      className={cls}
      aria-busy={loading || undefined}
      disabled={disabled}
      onClick={loading ? undefined : onClick}
      {...rest}
    >
      {/* Both labels stay in the layout so the button keeps its width while loading. */}
      <span className="btn-label" aria-hidden={loading || undefined}>
        {icon}
        {children}
      </span>
      {loading && (
        <span className="btn-loading">
          <Spinner />
          {loadingLabel}
        </span>
      )}
    </button>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

interface IconButtonProps extends NativeButton {
  label: string;                   // required: icon-only buttons need an accessible name
  children: ReactNode;
}

/** 48×48 icon button with an aria-label. */
export function IconButton({ label, children, className, ...rest }: IconButtonProps) {
  return (
    <button type="button" className={['icon-btn', className ?? ''].filter(Boolean).join(' ')} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

interface AddButtonProps extends Omit<NativeButton, 'children'> {
  added: boolean;
  addLabel: string;                // e.g. "Add Steak Fajita Bowls to the plan"
  addedLabel: string;              // e.g. "Steak Fajita Bowls is pinned on Tue. Change days"
}

/** Add-to-plan: primary with + when off, accent with ✓ when added; the label changes too, never colour alone. */
export function AddButton({ added, addLabel, addedLabel, className, ...rest }: AddButtonProps) {
  const label = added ? addedLabel : addLabel;
  return (
    <button
      type="button"
      className={['icon-btn', 'add-btn', className ?? ''].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      data-added={added}
      {...rest}
    >
      {added ? <CheckIcon size={22} /> : <PlusIcon size={22} />}
    </button>
  );
}

/** "Use it up →": no fill, ink text, a 3px primary underline. A button unless given an href. */
export function TextLink({ children, className, ...rest }: NativeButton) {
  return (
    <button type="button" className={['text-link', className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </button>
  );
}

export function ExternalLink({ children, className, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={['text-link', className ?? ''].filter(Boolean).join(' ')} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}
