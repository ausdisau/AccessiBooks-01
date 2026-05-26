interface BrandWordmarkProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
  tagline?: string;
}

const sizeMap = {
  sm: { word: "text-xl", tag: "text-[10px]" },
  md: { word: "text-2xl", tag: "text-xs" },
  lg: { word: "text-3xl sm:text-4xl", tag: "text-xs" },
  xl: { word: "text-5xl sm:text-6xl md:text-7xl", tag: "text-sm" },
};

export function BrandWordmark({
  className = "",
  size = "md",
  showTagline = false,
  tagline = "Audiobooks for everyone",
}: BrandWordmarkProps) {
  const s = sizeMap[size];
  return (
    <div className={`inline-flex flex-col leading-none ${className}`}>
      <span
        className={`brand-display font-semibold ${s.word}`}
        style={{ color: "var(--brand-navy)" }}
      >
        Accessi<span style={{ color: "var(--brand-orange-deep)" }}>Books</span>
      </span>
      {showTagline && (
        <span
          className={`mt-2 uppercase tracking-[0.18em] font-medium ${s.tag}`}
          style={{ color: "var(--brand-ink-soft)" }}
        >
          {tagline}
        </span>
      )}
    </div>
  );
}
