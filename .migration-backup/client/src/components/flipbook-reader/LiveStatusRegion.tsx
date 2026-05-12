import type { LiveStatusRegionProps } from "./flipbook-types";

export function LiveStatusRegion({ message }: LiveStatusRegionProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid="flipbook-live-region"
    >
      {message}
    </div>
  );
}
