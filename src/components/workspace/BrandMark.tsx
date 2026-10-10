/** QueryPad mark: two tables joined by a key — the thing the app is about. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2.5" y="5" width="11" height="15" rx="2.5" fill="none" stroke="var(--brand-ink, var(--ink))" strokeWidth="2" />
      <rect x="18.5" y="12" width="11" height="15" rx="2.5" fill="none" stroke="var(--brand-ink, var(--ink))" strokeWidth="2" />
      <path d="M2.5 10h11M18.5 17h11" stroke="var(--brand-ink, var(--ink))" strokeWidth="2" />
      <path d="M13.5 14.5h2.5a2.5 2.5 0 012.5 2.5v4" fill="none" stroke="var(--join)" strokeWidth="2.25" strokeLinecap="round" />
      <circle cx="13.5" cy="14.5" r="2" fill="var(--join)" />
    </svg>
  );
}
