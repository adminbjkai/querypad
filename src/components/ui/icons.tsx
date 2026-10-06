import type { SVGProps } from "react";

/** Stroke icons drawn on a 24px grid; one component keeps the bundle and markup small. */
const PATHS = {
  play: "M7 5.5v13l11-6.5-11-6.5z",
  stop: "M7 7h10v10H7z",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z",
  table: "M4 5h16v14H4zM4 10h16M10 10v9",
  join: "M8 7a3 3 0 100 6M16 11a3 3 0 110 6M10.5 10h3a2.5 2.5 0 012.5 2.5v0M13.5 14h-3A2.5 2.5 0 018 11.5v0",
  history: "M4 12a8 8 0 102.3-5.6M4 5v3.5h3.5M12 8v4.5l3 2",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4",
  chevronRight: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3",
  download: "M12 4v12M7 11l5 5 5-5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  copy: "M9 9h10v10H9zM5 15V5h10",
  sun: "M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  puzzle: "M10 4a2 2 0 114 0v2h4v4h-2a2 2 0 100 4h2v4h-4v-2a2 2 0 10-4 0v2H6v-4H4a2 2 0 110-4h2V6h4V4z",
  users: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20a6 6 0 0112 0M16 4.5a3.5 3.5 0 010 6.5M21 20a6 6 0 00-3.5-5.5",
  refresh: "M20 11a8 8 0 00-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0014.6 4.5L20 16M20 20v-4h-4",
  chart: "M4 20h16M7 16v-5M12 16V7M17 16v-8",
  profile: "M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  command: "M9 6a3 3 0 10-3 3h12a3 3 0 10-3-3v12a3 3 0 103-3H6a3 3 0 103 3V6z",
  alert: "M12 9v4M12 17h.01M10.3 4.3L2.6 18a2 2 0 001.7 3h15.4a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z",
  sidebar: "M4 5h16v14H4zM9 5v14",
  flow: "M6 4h5v5H6zM13 15h5v5h-5zM8.5 9v3.5a2 2 0 002 2H15",
  key: "M15 9a3 3 0 11-6 0 3 3 0 016 0zM12 12v8M12 16h3M12 19h2",
  sort: "M8 5v14M5 16l3 3 3-3M16 19V5M13 8l3-3 3 3",
  sortAsc: "M12 19V5M7 10l5-5 5 5",
  sortDesc: "M12 5v14M7 14l5 5 5-5",
  filter: "M4 5h16l-6 8v5l-4 2v-7L4 5z",
  wand: "M4 20L14 10M15 4v2M19 8h-2M18.5 4.5l-1.4 1.4M12.5 4.5l1.4 1.4M18.5 11.5l-1.4-1.4",
  file: "M14 3H6v18h12V7l-4-4zM14 3v4h4",
  eraser: "M8 20h12M5 15l9-9 5 5-8 8H8l-3-3z",
  keyboard: "M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8",
  bookmark: "M7 4h10v16l-5-3.5L7 20V4z",
  folder: "M4 6h6l2 2h8v10H4z",
  insert: "M4 6h16M4 12h7M4 18h16M15 9l3 3-3 3",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  panelRight: "M4 5h16v14H4zM15 5v14",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01",
  format: "M4 6h16M4 10h10M4 14h16M4 18h10",
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className ?? ""}`}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function GithubMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.44 9.8 8.2 11.39.6.1.83-.26.83-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 016 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.58A12 12 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
