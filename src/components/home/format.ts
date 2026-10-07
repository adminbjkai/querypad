/**
 * Human-readable age of a timestamp: "just now", "4 min ago", "2 h ago", "3 d ago", then the
 * date. `compact` gives the chat-list form ("Now", "4m", "2h", "3d", "2mo").
 */
export function relativeTime(at: number, { now = Date.now(), compact = false }: { now?: number; compact?: boolean } = {}): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return compact ? "Now" : "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return compact ? `${minutes}m` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return compact ? `${hours}h` : `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return compact ? `${days}d` : `${days} d ago`;
  return compact ? `${Math.round(days / 30)}mo` : new Date(at).toLocaleDateString();
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
