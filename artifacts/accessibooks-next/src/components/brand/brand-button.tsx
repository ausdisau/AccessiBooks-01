import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "md" | "lg";

interface BrandButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-[var(--brand-navy)] text-[var(--brand-cream)] hover:bg-[var(--brand-navy-strong)] focus-visible:ring-[var(--brand-navy)]",
  secondary:
    "bg-[var(--brand-orange)] text-white hover:bg-[var(--brand-orange-deep)] focus-visible:ring-[var(--brand-orange-deep)]",
  outline:
    "bg-transparent border-2 border-[var(--brand-navy)] text-[var(--brand-navy)] hover:bg-[var(--brand-navy)] hover:text-[var(--brand-cream)] focus-visible:ring-[var(--brand-navy)]",
  ghost:
    "bg-transparent text-[var(--brand-navy)] hover:bg-[var(--brand-cream-deep)] focus-visible:ring-[var(--brand-navy)]",
};

const sizeStyles: Record<Size, string> = {
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-7 text-base",
};

export const BrandButton = forwardRef<HTMLButtonElement, BrandButtonProps>(
  function BrandButton(
    { variant = "primary", size = "md", className = "", leftIcon, rightIcon, children, ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        {...props}
        className={[
          "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight whitespace-nowrap",
          "transition-all duration-200 ease-out",
          "focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-cream)]",
          "disabled:opacity-50 disabled:pointer-events-none",
          "min-h-[44px]",
          variantStyles[variant],
          sizeStyles[size],
          className,
        ].join(" ")}
      >
        {leftIcon}
        {children}
        {rightIcon}
      </button>
    );
  }
);
