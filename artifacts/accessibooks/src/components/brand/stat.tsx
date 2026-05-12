interface StatProps {
  value: string;
  label: string;
  className?: string;
}

export function Stat({ value, label, className = "" }: StatProps) {
  return (
    <div className={className}>
      <div
        className="brand-display text-4xl sm:text-5xl font-bold leading-none"
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
