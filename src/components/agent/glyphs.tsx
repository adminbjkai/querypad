"use client";

import type { SVGProps } from "react";

/** Two marks the shared icon set lacks, drawn in its stroke style: approvals (shield) and plan-only (lock). */
function Glyph({ d, size = 16, className, ...rest }: SVGProps<SVGSVGElement> & { d: string; size?: number }) {
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
      <path d={d} />
    </svg>
  );
}

export const ShieldGlyph = (props: Omit<SVGProps<SVGSVGElement>, "d"> & { size?: number }) => (
  <Glyph d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3zM9.5 12l2 2 3.5-4" {...props} />
);

export const LockGlyph = (props: Omit<SVGProps<SVGSVGElement>, "d"> & { size?: number }) => (
  <Glyph d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3M12 15v2" {...props} />
);
