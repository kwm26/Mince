import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './Button';
import { XIcon } from './icons';

interface Props {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;              // the sheet's own dock: primary action in the thumb zone
  eyebrow?: string;
}

/**
 * Reading-layer bottom sheet on a native modal <dialog>: focus is trapped and restored,
 * Esc and a tap on the backdrop close it. Content mounts only while open, so each
 * opening starts fresh.
 */
export function BottomSheet({ open, title, onClose, children, footer, eyebrow }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute('open', '');
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="sheet-inner">
          <header className="sheet-head">
            <div className="sheet-title">
              {eyebrow && <p className="eyebrow">{eyebrow}</p>}
              <h2 id={titleId}>{title}</h2>
            </div>
            <IconButton label="Close" onClick={onClose}>
              <XIcon size={22} />
            </IconButton>
          </header>
          <div className="sheet-body">{children}</div>
          {footer && <div className="sheet-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
