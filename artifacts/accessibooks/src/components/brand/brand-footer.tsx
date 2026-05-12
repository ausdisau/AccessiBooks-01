import { BrandWordmark } from "./brand-wordmark";
import adLogo from "@assets/Original_on_Transparent_1778563296837.png";

interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

interface BrandFooterProps {
  columns?: FooterColumn[];
}

const defaultColumns: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Accessibility", href: "#accessibility" },
      { label: "For institutions", href: "/institutional" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Trust & safety", href: "/trust" },
      { label: "Australian Disability Ltd", href: "https://www.australiandisability.org.au", },
    ],
  },
  {
    title: "Get in touch",
    links: [
      { label: "Help & support", href: "/trust" },
      { label: "Donate", href: "https://www.australiandisability.org.au/donate" },
    ],
  },
];

export function BrandFooter({ columns = defaultColumns }: BrandFooterProps) {
  return (
    <footer
      role="contentinfo"
      className="border-t"
      style={{
        backgroundColor: "var(--brand-navy-strong)",
        borderColor: "var(--brand-navy-strong)",
        color: "var(--brand-cream)",
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 py-14 sm:py-16">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <BrandWordmark size="lg" showTagline tagline="Audiobooks & ebooks for everyone" />
            <a
              href="https://australiandisability.org"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)]"
              aria-label="Australian Disability Ltd — opens in a new tab"
            >
              <img
                src={adLogo}
                alt=""
                className="h-12 w-auto bg-white rounded-md p-1.5"
              />
              <span
                className="text-xs uppercase tracking-[0.18em] font-semibold"
                style={{ color: "color-mix(in srgb, var(--brand-cream) 80%, transparent)" }}
              >
                A project of
                <span className="block normal-case tracking-normal text-sm mt-0.5" style={{ color: "var(--brand-cream)" }}>
                  Australian Disability Ltd
                </span>
              </span>
            </a>
            <p
              className="mt-6 text-base leading-relaxed max-w-md"
              style={{ color: "color-mix(in srgb, var(--brand-cream) 80%, transparent)" }}
            >
              AccessiBooks is built and operated by Australian Disability Ltd, a registered
              charity working to make literature accessible to every reader and listener.
            </p>
            <p
              className="mt-4 text-sm font-medium"
              style={{ color: "color-mix(in srgb, var(--brand-cream) 70%, transparent)" }}
            >
              Designed to meet WCAG 2.2 AA · Keyboard friendly · Screen reader tested
            </p>
          </div>

          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">
            {columns.map((col) => (
              <div key={col.title}>
                <h2
                  className="text-xs uppercase tracking-[0.18em] font-semibold mb-4"
                  style={{ color: "color-mix(in srgb, var(--brand-cream) 70%, transparent)" }}
                >
                  {col.title}
                </h2>
                <ul className="space-y-3">
                  {col.links.map((link) => (
                    <li key={link.href + link.label}>
                      <a
                        href={link.href}
                        className="text-base transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-orange)] rounded-sm"
                        style={{ color: "var(--brand-cream)" }}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div
          className="mt-12 pt-6 border-t flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between text-sm"
          style={{
            borderColor: "color-mix(in srgb, var(--brand-cream) 18%, transparent)",
            color: "color-mix(in srgb, var(--brand-cream) 70%, transparent)",
          }}
        >
          <p>© {new Date().getFullYear()} Australian Disability Ltd. All rights reserved.</p>
          <p>Made with care in Australia.</p>
        </div>
      </div>
    </footer>
  );
}
