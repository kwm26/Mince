/** Reading-layer empty state: a heading and one muted sentence (design-spec §5). */
export function EmptyState({ title, children }: { title: string; children: string }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p className="muted">{children}</p>
    </div>
  );
}
