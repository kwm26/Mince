import type { ReactNode } from 'react';
import { AlertIcon } from './icons';

interface Props {
  title: string;
  children: ReactNode;            // one muted sentence
  action?: ReactNode;             // one primary button
  extra?: ReactNode;              // e.g. a text link
  tone?: 'error';                 // error: warn-text title with an icon, never colour alone
  level?: 2 | 3;
}

/** Reading-layer state block: a heading, one muted sentence, one primary button (design-spec §5). */
export function EmptyState({ title, children, action, extra, tone, level = 2 }: Props) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div className={tone === 'error' ? 'empty-state empty-state-error' : 'empty-state'} role={tone === 'error' ? 'alert' : undefined}>
      <Heading className="empty-state-title">
        {tone === 'error' && <AlertIcon size={20} />}
        {title}
      </Heading>
      <p className="muted">{children}</p>
      {(action || extra) && (
        <div className="empty-state-actions">
          {action}
          {extra}
        </div>
      )}
    </div>
  );
}
