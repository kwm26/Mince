/** Warn tag that always says how long is left, never colour alone (design-spec §5). */
export function UseSoonTag({ children }: { children: string }) {
  return <span className="use-soon-tag">{children}</span>;
}
