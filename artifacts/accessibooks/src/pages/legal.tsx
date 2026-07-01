import { useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

// Small helper to set document title + description while a static page is
// mounted, restoring the previous values on unmount. Keeps these public pages
// crawlable/meaningful without pulling in a full head-management library.
function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;
    let el = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    const existed = !!el;
    const prevDesc = el?.getAttribute("content") ?? "";
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "description");
      document.head.appendChild(el);
    }
    el.setAttribute("content", description);
    return () => {
      document.title = prevTitle;
      if (el) {
        if (existed) el.setAttribute("content", prevDesc);
        else el.remove();
      }
    };
  }, [title, description]);
}

const LAST_UPDATED = "1 July 2026";

function LegalShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        <p className="mt-4 text-lg text-muted-foreground">{intro}</p>
        <div className="mt-8 space-y-8 leading-relaxed">{children}</div>
        <div className="mt-12 pt-6 border-t">
          <Link href="/">
            <Button variant="outline">← Back to AccessiBooks</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{heading}</h2>
      {children}
    </section>
  );
}

const CONTACT_EMAIL = "accessibility@accessibooks.org";

export function AccessibilityStatementPage() {
  usePageMeta(
    "Accessibility Statement — AccessiBooks",
    "AccessiBooks is an accessibility-first audiobook and e-reading platform. Read about our keyboard navigation, screen-reader support, transcripts, adjustable playback, and visual customisation.",
  );
  return (
    <LegalShell
      title="Accessibility Statement"
      intro="AccessiBooks is built by Australian Disability Ltd to make audiobooks, ebooks, and magazines usable by everyone, including people who rely on assistive technology."
    >
      <Section heading="Our commitment">
        <p>
          We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 Level AA.
          Accessibility is a continuous effort, and we treat accessibility defects as
          bugs to be fixed rather than optional extras.
        </p>
      </Section>
      <Section heading="Keyboard navigation">
        <p>
          Core reading and listening flows are operable with a keyboard. A skip link
          lets keyboard and screen-reader users jump straight to the main content, and
          interactive controls are reachable in a logical order with visible focus.
        </p>
      </Section>
      <Section heading="Screen-reader support">
        <p>
          Pages use semantic headings and landmarks, and controls carry accessible
          names. Icon-only buttons include text alternatives so screen-reader users
          understand their purpose.
        </p>
      </Section>
      <Section heading="Transcripts">
        <p>
          We are expanding transcript coverage across the catalogue. Where a transcript
          exists, it is shown on the book’s detail and player view; where segments with
          timing exist, you can navigate the transcript by section. When a transcript is
          not yet available, we say so clearly rather than hiding the option.
        </p>
      </Section>
      <Section heading="Adjustable playback">
        <p>
          Audiobook playback controls are keyboard usable. Adjustable playback speed and
          related listening controls are available in the player.
        </p>
      </Section>
      <Section heading="Visual customisation">
        <p>
          AccessiBooks offers visual reading options including adjustable fonts, a
          dyslexia-friendly mode, and high-contrast themes. We honour your operating
          system’s reduced-motion preference to limit non-essential animation.
        </p>
      </Section>
      <Section heading="Known limitations">
        <p>
          Some third-party catalogue content is sourced from external providers and may
          not yet include transcripts or complete accessibility metadata. We label the
          available accessibility features per title so you can make an informed choice.
        </p>
      </Section>
      <Section heading="Contact us about accessibility">
        <p>
          If you encounter an accessibility barrier, please tell us so we can fix it.
          Email{" "}
          <a
            className="underline underline-offset-2 hover:no-underline"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
          . You can also reach our parent organisation via the{" "}
          <a
            className="underline underline-offset-2 hover:no-underline"
            href="https://www.australiandisability.org.au"
            target="_blank"
            rel="noopener noreferrer"
          >
            Australian Disability Ltd website
          </a>
          .
        </p>
      </Section>
    </LegalShell>
  );
}

export function PrivacyPolicyPage() {
  usePageMeta(
    "Privacy Policy — AccessiBooks",
    "How AccessiBooks collects, uses, and protects your personal information and reading activity.",
  );
  return (
    <LegalShell
      title="Privacy Policy"
      intro="This policy explains what information AccessiBooks collects, how we use it, and the choices you have. It is written as clear placeholder copy and will be updated as the product evolves."
    >
      <Section heading="Information we collect">
        <p>
          We collect the information you provide when you create an account (such as your
          email address), and activity needed to run the service, such as your library,
          listening progress, subscription status, and accessibility preferences.
        </p>
      </Section>
      <Section heading="How we use information">
        <p>
          We use your information to provide the service, remember your preferences and
          progress, process subscriptions, and improve accessibility. We do not sell your
          personal information.
        </p>
      </Section>
      <Section heading="Sharing">
        <p>
          We share data with service providers that operate the platform (for example,
          payment processing and hosting) only as needed to deliver the service, and with
          consent-based recipients where you explicitly choose to share, such as a
          caregiver or therapist progress report.
        </p>
      </Section>
      <Section heading="Your choices">
        <p>
          You can update your account details and accessibility preferences at any time.
          To request access to, or deletion of, your data, contact us at{" "}
          <a
            className="underline underline-offset-2 hover:no-underline"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
      <Section heading="Changes to this policy">
        <p>
          We may update this policy over time. Material changes will be reflected by the
          “last updated” date at the top of this page.
        </p>
      </Section>
    </LegalShell>
  );
}

export function TermsOfUsePage() {
  usePageMeta(
    "Terms of Use — AccessiBooks",
    "The terms that govern your use of the AccessiBooks audiobook and e-reading platform.",
  );
  return (
    <LegalShell
      title="Terms of Use"
      intro="These terms govern your use of AccessiBooks. They are provided as clear placeholder copy and will be finalised before general release."
    >
      <Section heading="Using AccessiBooks">
        <p>
          You may use AccessiBooks to browse, stream, and read available content in line
          with your subscription and applicable licences. You agree not to misuse the
          service or attempt to disrupt it for other users.
        </p>
      </Section>
      <Section heading="Accounts">
        <p>
          You are responsible for keeping your account credentials secure and for activity
          under your account. Let us know promptly if you believe your account has been
          compromised.
        </p>
      </Section>
      <Section heading="Subscriptions and payments">
        <p>
          Paid plans are billed according to the plan you choose. Details of features and
          pricing are shown on the pricing page and may change over time.
        </p>
      </Section>
      <Section heading="Content">
        <p>
          Catalogue content is provided under a range of licences and sources. Availability
          may vary by region and can change as licences are added or expire.
        </p>
      </Section>
      <Section heading="Contact">
        <p>
          Questions about these terms? Email{" "}
          <a
            className="underline underline-offset-2 hover:no-underline"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </LegalShell>
  );
}

export function CopyrightLicensingPage() {
  usePageMeta(
    "Copyright & Licensing — AccessiBooks",
    "How AccessiBooks sources content, respects copyright, and handles licensing and takedown requests.",
  );
  return (
    <LegalShell
      title="Copyright & Licensing"
      intro="AccessiBooks brings together public-domain and licensed content from multiple sources. This page explains how we handle copyright and licensing."
    >
      <Section heading="Content sources">
        <p>
          Our catalogue includes public-domain works from sources such as LibriVox,
          Project Gutenberg, the Internet Archive, and Open Library, alongside licensed
          content. Each title retains the rights and attribution of its original source.
        </p>
      </Section>
      <Section heading="Public-domain works">
        <p>
          Public-domain recordings and texts are made available under the terms of their
          respective sources. Where a source requests attribution, we preserve it.
        </p>
      </Section>
      <Section heading="Licensed content">
        <p>
          Licensed titles are provided under agreements with rights holders and may be
          limited by region or subscription tier.
        </p>
      </Section>
      <Section heading="Copyright concerns and takedowns">
        <p>
          If you believe content on AccessiBooks infringes your copyright, contact us at{" "}
          <a
            className="underline underline-offset-2 hover:no-underline"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>{" "}
          with details of the work and the allegedly infringing material, and we will
          review the request.
        </p>
      </Section>
    </LegalShell>
  );
}
