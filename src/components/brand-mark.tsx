import * as React from "react";

/** SautiSafe brand mark: the microphone logo (voice reporting). */
export function BrandMark({
  className,
  ...props
}: React.SVGProps<SVGSVGElement>) {
  // Render the logo via an <img> so it stays in sync with /public/icon.svg
  // (the favicon + PWA icon). Wrap in an SVG-shaped span for sizing.
  return (
    <img
      src="/icon.svg"
      alt="SautiSafe logo"
      className={className}
      {...(props as React.ImgHTMLAttributes<HTMLImageElement>)}
    />
  );
}
