interface StatProps {
  value: string;
  label: string;
  className?: string;
}

export function Stat({ value, label, className = "" }: StatProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div
        className="brand-display text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight break-words"
        style={{ color: "var(--brand-orange-deep)" }}
      >
        {value}
      </div>
      <div
        className="mt-2 text-sm uppercase tracking-wider font-medium"
        style={{ color: "var(--brand-ink-soft)" }}
      >
        {label}
      </div>
    </div>
  );
}
