import type { ReactNode } from "react";
import { MarketingStaticPage } from "@/pages/marketing-static";

type AboutPageProps = {
  onBrowseAsGuest?: () => void;
  loginModal: ReactNode;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
};

export function AboutPage(props: AboutPageProps) {
  return (
    <MarketingStaticPage
      {...props}
      title="Our mission"
      description="Why AccessiBooks exists and who we build it for."
    >
      <p>
        AccessiBooks exists so that audiobooks and ebooks are not locked behind interfaces that only work for some
        people. We design for readers and listeners with vision, hearing, motor, and cognitive differences — and for
        families, classrooms, libraries, and support workers who need reliable, calm technology.
      </p>
      <p>
        Australian Disability Ltd funds and stewards the project as part of its broader work on digital inclusion. A
        share of paid subscriptions supports charity programs that advance accessible technology and community
        participation.
      </p>
      <p>
        Learn more about the organisation at{" "}
        <a href="https://ausdis.au" target="_blank" rel="noopener noreferrer" className="underline font-medium" style={{ color: "var(--brand-navy)" }}>
          ausdis.au
        </a>
        .
      </p>
    </MarketingStaticPage>
  );
}
