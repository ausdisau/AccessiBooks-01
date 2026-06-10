export const MARKETING_NAV_ITEMS = [
  { label: "Features", href: "/features", sectionId: "features" },
  { label: "Accessibility", href: "/accessibility", sectionId: "accessibility" },
  { label: "Audiences", href: "/audiences", sectionId: "audiences" },
  { label: "Pricing", href: "/pricing", sectionId: "pricing" },
  { label: "About", href: "/about", sectionId: "about" },
] as const;

export type MarketingSectionId = (typeof MARKETING_NAV_ITEMS)[number]["sectionId"];

export const MARKETING_FOOTER_LINKS = {
  product: [
    { label: "Features", href: "/features" },
    { label: "Accessibility", href: "/accessibility" },
    { label: "Audiences", href: "/audiences" },
    { label: "Pricing", href: "/pricing" },
  ],
  support: [
    { label: "Contact", href: "/contact" },
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ],
  organisation: [
    { label: "Australian Disability Ltd", href: "https://ausdis.au", external: true },
    { label: "Our mission", href: "/about" },
  ],
} as const;
