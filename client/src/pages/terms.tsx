import type { ReactNode } from "react";
import { MarketingStaticPage } from "@/pages/marketing-static";

type TermsPageProps = {
  onBrowseAsGuest?: () => void;
  loginModal: ReactNode;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
};

export function TermsPage(props: TermsPageProps) {
  return (
    <MarketingStaticPage
      {...props}
      title="Terms of Service"
      description="The rules for using AccessiBooks and our content library."
    >
      <p>
        By creating an account or using AccessiBooks you agree to use the service lawfully and respect copyright on
        third-party and partner content. Free and paid tiers are described on the pricing page and may change with
        notice.
      </p>
      <p>
        Subscriptions renew automatically until cancelled in your billing settings. Individual title purchases grant
        personal, non-transferable access. Abuse, automated scraping, or attempts to circumvent access controls may
        result in account suspension.
      </p>
      <p>
        AccessiBooks is provided &ldquo;as is&rdquo; with accessibility as a core design goal, but we cannot guarantee
        uninterrupted service. Questions about these terms can be directed through our{" "}
        <a href="/contact" className="underline font-medium" style={{ color: "var(--brand-navy)" }}>
          contact page
        </a>
        .
      </p>
      <p>Last updated: June 2026.</p>
    </MarketingStaticPage>
  );
}
