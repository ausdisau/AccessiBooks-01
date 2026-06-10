import type { ReactNode } from "react";
import { Mail, Phone } from "lucide-react";
import { MarketingStaticPage } from "@/pages/marketing-static";

type ContactPageProps = {
  onBrowseAsGuest?: () => void;
  loginModal: ReactNode;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
};

export function ContactPage(props: ContactPageProps) {
  return (
    <MarketingStaticPage
      {...props}
      title="Contact"
      description="Reach Australian Disability Ltd for support, partnerships, or accessibility feedback."
    >
      <p>
        AccessiBooks is a project of Australian Disability Ltd, a registered charity working toward a fair, dignified,
        and equal society for all people with disabilities.
      </p>
      <ul className="space-y-4 not-prose">
        <li>
          <a
            href="https://ausdis.au"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-medium underline"
            style={{ color: "var(--brand-navy)" }}
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            Visit ausdis.au
          </a>
        </li>
        <li>
          <a
            href="mailto:info@ausdis.au"
            className="inline-flex items-center gap-2 font-medium underline"
            style={{ color: "var(--brand-navy)" }}
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            info@ausdis.au
          </a>
        </li>
      </ul>
      <p>
        For accessibility issues inside the app, use the in-product feedback tools or describe the page and assistive
        technology you are using so we can reproduce the problem quickly.
      </p>
    </MarketingStaticPage>
  );
}
