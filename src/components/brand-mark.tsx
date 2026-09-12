import * as React from "react";

/** SautiSafe brand mark: a safety shield cradling a soundwave.
 *  Voice + safety, distilled. */
export function BrandMark({
  className,
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="SautiSafe logo"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id="ss-shield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.55 0.11 178)" />
          <stop offset="100%" stopColor="oklch(0.4 0.08 178)" />
        </linearGradient>
      </defs>
      {/* shield */}
      <path
        d="M24 3 6 10v13c0 9.2 6.4 17.7 18 22 11.6-4.3 18-12.8 18-22V10L24 3Z"
        fill="url(#ss-shield)"
        stroke="oklch(0.3 0.07 178)"
        strokeWidth="1.2"
      />
      {/* soundwave bars */}
      <g fill="#fff">
        <rect x="16" y="22" width="2.4" height="6" rx="1.2" opacity="0.75" />
        <rect x="20.8" y="18" width="2.4" height="14" rx="1.2" />
        <rect x="25.6" y="14" width="2.4" height="22" rx="1.2" />
        <rect x="30.4" y="20" width="2.4" height="10" rx="1.2" opacity="0.75" />
      </g>
      {/* amber caution tick at the bottom */}
      <circle cx="24" cy="35.5" r="2.4" fill="oklch(0.78 0.15 70)" />
    </svg>
  );
}
