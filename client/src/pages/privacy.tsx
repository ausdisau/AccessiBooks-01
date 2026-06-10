import type { ReactNode } from "react";
import { MarketingStaticPage } from "@/pages/marketing-static";

type PrivacyPageProps = {
  onBrowseAsGuest?: () => void;
  loginModal: ReactNode;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
};

export function PrivacyPage(props: PrivacyPageProps) {
  return (
    <MarketingStaticPage
      {...props}
      title="Privacy Policy"
      description="How AccessiBooks collects, uses, and protects your information."
    >
      <p>
        AccessiBooks is operated by Australian Disability Ltd. We collect only the information needed to run your account,
        deliver content, and improve accessibility — such as your email, playback progress, and subscription status.
      </p>
      <p>
        We do not sell personal data. Usage analytics are aggregated to improve the product. Payment details are handled
        securely by Stripe and are not stored on our servers.
      </p>
      <p>
        You can request access to or deletion of your account data by contacting us through the{" "}
        <a href="/contact" className="underline font-medium" style={{ color: "var(--brand-navy)" }}>
          contact page
        </a>{" "}
        or via{" "}
        <a href="https://ausdis.au" target="_blank" rel="noopener noreferrer" className="underline font-medium" style={{ color: "var(--brand-navy)" }}>
          Australian Disability Ltd
        </a>
        .
      </p>
      <p>Last updated: June 2026.</p>
    </MarketingStaticPage>
  );
}
