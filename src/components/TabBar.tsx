import type { ReactNode } from 'react';
import { CalendarIcon, LeafIcon, UtensilsIcon } from './icons';

export type Tab = 'kitchen' | 'plan' | 'cook';

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'kitchen', label: 'Kitchen', icon: <LeafIcon size={20} /> },
  { id: 'plan', label: 'Plan', icon: <CalendarIcon size={20} /> },
  { id: 'cook', label: 'Cook', icon: <UtensilsIcon size={20} /> },
];

/** Three 56px tabs on paper with a 1px rule; the active one is a primary market sign. */
export function TabBar({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="Main">
      <ul className="tabbar-list">
        {TABS.map((t) => (
          <li key={t.id}>
            <button type="button" className="tab" aria-current={t.id === active ? 'page' : undefined} onClick={() => onChange(t.id)}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
