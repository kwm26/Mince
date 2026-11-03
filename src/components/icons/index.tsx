import type { ReactNode } from 'react';

// Lucide-style line icons (design-spec §8): 24px grid, 2px round stroke, currentColor.
function Icon({ size = 18, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function ClockIcon({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </Icon>
  );
}

export function XIcon({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  );
}
