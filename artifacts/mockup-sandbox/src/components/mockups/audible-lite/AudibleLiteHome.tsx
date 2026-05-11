import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Search, BookOpen, TrendingUp, Headphones } from "lucide-react";

const ORANGE = "#F8991C";
const ORANGE_DARK = "#E68A0F";
const INK = "#0B1320";
const PAGE_BG = "#FFFFFF";
const SOFT = "#F4F6F8";
const PALE_BLUE = "#E8EEF6";
const BORDER = "#E5E7EB";
const MUTED = "#5A6473";

type Cover = { title: string; author: string; hue: number };

const COVERS_LISTENING: Cover[] = [
  { title: "Project Hail Mary", author: "Andy Weir", hue: 28 },
  { title: "Yesteryear", author: "Cory Caine Burke", hue: 45 },
  { title: "Fury Bound", author: "Sadie Sorensen", hue: 285 },
  { title: "HP & the Deathly Hallows", author: "J.K. Rowling", hue: 220 },
  { title: "HP & the Half-Blood Prince", author: "J.K. Rowling", hue: 200 },
  { title: "Fanwreck", author: "Lena Dunham", hue: 12 },
];

const COVERS_HP: Cover[] = [
  { title: "Philosopher's Stone", author: "J.K. Rowling", hue: 215 },
  { title: "Chamber of Secrets", author: "J.K. Rowling", hue: 25 },
  { title: "Prisoner of Azkaban", author: "J.K. Rowling", hue: 270 },
  { title: "Goblet of Fire", author: "J.K. Rowling", hue: 195 },
  { title: "Order of the Phoenix", author: "J.K. Rowling", hue: 340 },
  { title: "Half-Blood Prince", author: "J.K. Rowling", hue: 230 },
];

const COVERS_ONLY: Cover[] = [
  { title: "Fantastia", author: "Various", hue: 35 },
  { title: "Lonely Hearts Radio", author: "Annie Hartnett", hue: 18 },
  { title: "Can't Hurt Me", author: "David Goggins", hue: 0 },
  { title: "Wide Awake", author: "Andie Mitchell", hue: 195 },
  { title: "Sapiens", author: "Yuval N. Harari", hue: 22 },
];

const COVERS_TRENDING: Cover[] = [
  { title: "Fury Bound", author: "Sadie Sorensen", hue: 280 },
  { title: "Platform Decay", author: "Martha Wells", hue: 0 },
  { title: "Three Reasons for Revenge", author: "Steve McTiernan", hue: 25 },
  { title: "Yesteryear", author: "Cory Caine Burke", hue: 45 },
  { title: "Devla", author: "Vesna Main", hue: 350 },
  { title: "The Heart You Kept", author: "T.J. Klune", hue: 20 },
];

const FAQS = [
  { q: "How does the free trial work?", a: "Start a 30-day free trial. You'll get 1 audiobook to keep, plus access to thousands of Audible Originals and podcasts. Cancel anytime in the first 30 days and you won't be charged." },
  { q: "What do I get with an Audible membership?", a: "Each month you get 1 credit good for any audiobook regardless of price, exclusive Audible Originals, and unlimited access to thousands of podcasts." },
  { q: "How much does Audible cost?", a: "Audible Plus is $7.95/month. Audible Premium Plus is $14.95/month. Both come with a 30-day free trial." },
  { q: "What is the Plus Catalogue?", a: "The Plus Catalogue is a vast library of audiobooks, Audible Originals, podcasts, sleep tracks, guided wellness programs, and theatrical performances available for unlimited listening." },
  { q: "What happens to audiobooks in my Library if I cancel?", a: "Any audiobook purchased with a credit or with cash is yours to keep forever, even if you cancel your membership." },
];

function CoverTile({ cover, size = "md", widthOverride }: { cover: Cover; size?: "sm" | "md" | "lg"; widthOverride?: number }) {
  const titleSize = size === "lg" ? "text-base" : "text-[11px]";
  const bg = `linear-gradient(135deg, hsl(${cover.hue}, 70%, 32%), hsl(${(cover.hue + 30) % 360}, 65%, 18%))`;
  // Book covers are portrait (2:3 aspect). When widthOverride is set, height = width * 1.5.
  const w = widthOverride ?? (size === "lg" ? 160 : size === "sm" ? 120 : 140);
  const h = Math.round(w * 1.5);
  return (
    <div className="flex flex-col gap-1 group" style={{ width: w }}>
      <div
        className="rounded-sm shadow-md relative overflow-hidden cursor-pointer transition-transform hover:-translate-y-0.5"
        style={{ background: bg, width: w, height: h }}
      >
        <div className="absolute inset-0 p-3 flex flex-col justify-between">
          <div className={`${titleSize} font-bold leading-tight text-white drop-shadow uppercase tracking-tight`}>{cover.title}</div>
          <div className="text-[9px] text-white/80 uppercase tracking-wider">{cover.author}</div>
        </div>
        {/* corner ribbon */}
        <div
          className="absolute bottom-0 right-0 w-0 h-0"
          style={{
            borderStyle: "solid",
            borderWidth: "0 0 22px 22px",
            borderColor: `transparent transparent ${ORANGE} transparent`,
          }}
        />
      </div>
    </div>
  );
}

function CoverWithCaption({ cover, size = "md" }: { cover: Cover; size?: "sm" | "md" | "lg" }) {
  return (
    <div className="flex flex-col gap-1.5">
      <CoverTile cover={cover} size={size} />
      <div className="text-[12px] font-semibold leading-tight" style={{ color: INK }}>{cover.title}</div>
      <div className="text-[11px]" style={{ color: MUTED }}>By: {cover.author}</div>
    </div>
  );
}

function Header() {
  return (
    <header className="border-b" style={{ borderColor: BORDER, background: PAGE_BG }}>
      <div className="max-w-[1180px] mx-auto px-6 h-14 flex items-center gap-6">
        <div className="flex items-baseline gap-1">
          <span className="text-[20px] font-bold tracking-tight italic" style={{ color: INK }}>audible</span>
          <span className="text-[10px] font-semibold" style={{ color: ORANGE }}>an amazon company</span>
        </div>
        <button className="flex items-center gap-1 text-[13px] font-medium" style={{ color: INK }}>
          <BookOpen size={14} /> Browse
        </button>
        <div className="flex-1 max-w-md ml-4 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUTED }} />
          <input
            placeholder="Find your next great listen"
            className="w-full h-8 pl-8 pr-3 rounded-full border text-[12px] outline-none"
            style={{ borderColor: BORDER, background: SOFT, color: INK }}
          />
        </div>
        <button className="text-[13px]" style={{ color: INK }}>Help</button>
        <button
          className="px-4 h-8 rounded-full text-[13px] font-semibold"
          style={{ background: ORANGE, color: INK }}
        >
          Sign in
        </button>
      </div>
    </header>
  );
}

function Hero() {
  // Fanned cover cluster
  const fan = [
    { title: "British Comedy", hue: 5, x: -200, y: 10, r: -14 },
    { title: "The Devoted Wife", hue: 35, x: -50, y: -30, r: -4 },
    { title: "Harry Potter Vol II", hue: 22, x: 110, y: -55, r: 6 },
    { title: "The Bone Hunter", hue: 215, x: -130, y: 140, r: -6 },
    { title: "Harry Potter Vol IV", hue: 230, x: 30, y: 120, r: 4 },
    { title: "Harry Potter Vol V", hue: 200, x: 180, y: 90, r: 12 },
  ];
  return (
    <section className="relative" style={{ background: SOFT }}>
      <div className="max-w-[1180px] mx-auto px-6 py-14 grid grid-cols-2 gap-6 items-center min-h-[420px]">
        <div className="pl-6">
          <h1 className="text-4xl font-bold leading-tight mb-3" style={{ color: INK }}>
            Get your imagination going
          </h1>
          <p className="text-[14px] mb-5" style={{ color: MUTED }}>
            The best audiobooks. The most entertainment. The podcasts you want to hear.
          </p>
          <button
            className="px-6 h-11 rounded-full text-[14px] font-semibold mb-2"
            style={{ background: ORANGE, color: INK }}
          >
            Try Standard free
          </button>
          <p className="text-[11px]" style={{ color: MUTED }}>
            Automatically renews at AUD $6.99/mo after 30 days. Cancel anytime.
          </p>
        </div>
        <div className="relative h-[360px]">
          {fan.map((c, i) => (
            <div
              key={i}
              className="absolute rounded-sm shadow-xl"
              style={{
                width: 110,
                height: 165,
                left: `calc(50% + ${c.x}px)`,
                top: `calc(50% + ${c.y}px - 82px)`,
                transform: `rotate(${c.r}deg)`,
                background: `linear-gradient(135deg, hsl(${c.hue}, 70%, 30%), hsl(${(c.hue + 30) % 360}, 65%, 14%))`,
              }}
            >
              <div className="absolute inset-0 p-2.5 flex flex-col justify-between">
                <div className="text-[10px] font-bold text-white uppercase leading-tight drop-shadow">{c.title}</div>
                <div className="text-[8px] text-white/80 uppercase tracking-wider">Audible</div>
              </div>
              <div
                className="absolute bottom-0 right-0 w-0 h-0"
                style={{ borderStyle: "solid", borderWidth: "0 0 18px 18px", borderColor: `transparent transparent ${ORANGE} transparent` }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaTiles() {
  const tiles = [
    { title: "Get your imagination going", bg: ORANGE, color: INK },
    { title: "Save on audiobooks with membership", bg: "#1F2A44", color: "#fff" },
    { title: "Project Hail Mary", bg: "#5B2A86", color: "#fff" },
  ];
  return (
    <section className="bg-white">
      <div className="max-w-[920px] mx-auto px-6 -mt-8 pb-10 grid grid-cols-3 gap-4 relative z-10 items-center">
        {tiles.map((t, i) => {
          const isCenter = i === 1;
          return (
            <div
              key={i}
              className={`rounded-md px-4 flex items-center text-[13px] font-semibold cursor-pointer transition-all ${
                isCenter
                  ? "h-24 -my-1 shadow-2xl ring-2 ring-offset-2"
                  : "h-20 shadow-md hover:shadow-lg"
              }`}
              style={{
                background: t.bg,
                color: t.color,
                ...(isCenter ? { boxShadow: "0 16px 40px -8px rgba(11,19,32,0.45)" } : {}),
              }}
            >
              {t.title}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SectionHeading({ title, subtitle, align = "center" }: { title: string; subtitle?: string; align?: "left" | "center" }) {
  return (
    <div className={`mb-5 ${align === "center" ? "text-center" : "text-left"}`}>
      <h2 className="text-2xl font-bold" style={{ color: INK }}>{title}</h2>
      {subtitle && <p className="text-[13px] mt-1" style={{ color: MUTED }}>{subtitle}</p>}
    </div>
  );
}

function ListeningRow() {
  return (
    <section className="bg-white">
      <div className="max-w-[1180px] mx-auto px-6 py-10">
        <SectionHeading title="We've got what everyone's listening to" subtitle="Best sellers. New releases. That story you've been waiting for." />
        <div className="grid grid-cols-6 gap-4">
          {COVERS_LISTENING.map((c, i) => <CoverWithCaption key={i} cover={c} />)}
        </div>
      </div>
    </section>
  );
}

function HarryPotterRow() {
  return (
    <section className="bg-white">
      <div className="max-w-[1180px] mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold" style={{ color: INK }}>Harry Potter</h2>
            <p className="text-[12px]" style={{ color: MUTED }}>Full-Cast Audio Editions</p>
          </div>
          <button className="text-[12px] font-semibold" style={{ color: ORANGE_DARK }}>View all</button>
        </div>
        <div className="grid grid-cols-6 gap-4">
          {COVERS_HP.map((c, i) => <CoverWithCaption key={i} cover={c} />)}
        </div>
      </div>
    </section>
  );
}

function OnlyFromAudible() {
  return (
    <section style={{ background: "#fafafa" }}>
      <div className="max-w-[1180px] mx-auto px-6 py-12">
        <SectionHeading title="Only from Audible" subtitle="Groundbreaking Originals and exclusives from A-list celebs and emerging talent." />
        <div className="relative flex items-center justify-center gap-4 px-10">
          <button className="absolute left-0 w-9 h-9 rounded-full bg-white border flex items-center justify-center shadow-sm" style={{ borderColor: BORDER }}>
            <ChevronLeft size={18} style={{ color: INK }} />
          </button>
          {COVERS_ONLY.map((c, i) => {
            const isCenter = i === 2;
            return (
              <div key={i} className={isCenter ? "scale-110" : "opacity-80"} style={{ transition: "transform .2s" }}>
                <CoverTile cover={c} size={isCenter ? "lg" : "md"} widthOverride={isCenter ? 180 : 130} />
              </div>
            );
          })}
          <button className="absolute right-0 w-9 h-9 rounded-full bg-white border flex items-center justify-center shadow-sm" style={{ borderColor: BORDER }}>
            <ChevronRight size={18} style={{ color: INK }} />
          </button>
        </div>
      </div>
    </section>
  );
}

function TrendingRow() {
  return (
    <section className="bg-white">
      <div className="max-w-[1180px] mx-auto px-6 py-12">
        <SectionHeading title="Trending now" subtitle="With thousands of titles to explore, you'll always find what you're looking for." />
        <div className="grid grid-cols-6 gap-4">
          {COVERS_TRENDING.map((c, i) => <CoverWithCaption key={i} cover={c} />)}
        </div>
      </div>
    </section>
  );
}

function MembersGetMore() {
  const items = [
    { icon: BookOpen, title: "Select 1 audiobook a month", body: "Bestsellers, new releases, hidden gems — the choice is yours each month." },
    { icon: TrendingUp, title: "Grow your Library", body: "Enjoy your selected titles throughout your membership." },
    { icon: Headphones, title: "Listen anytime, anywhere", body: "Listen at home, in the car, online or offline, whenever your are." },
  ];
  return (
    <section className="bg-white">
      <div className="max-w-[1000px] mx-auto px-6 py-14 text-center">
        <h2 className="text-2xl font-bold mb-10" style={{ color: INK }}>Members get even more</h2>
        <div className="grid grid-cols-3 gap-8 mb-10">
          {items.map((it, i) => {
            const Icon = it.icon;
            return (
              <div key={i} className="flex flex-col items-center px-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: SOFT }}>
                  <Icon size={20} style={{ color: INK }} />
                </div>
                <h3 className="text-[14px] font-semibold mb-1.5" style={{ color: INK }}>{it.title}</h3>
                <p className="text-[12px]" style={{ color: MUTED }}>{it.body}</p>
              </div>
            );
          })}
        </div>
        <button className="px-7 h-11 rounded-full text-[14px] font-semibold" style={{ background: ORANGE, color: INK }}>
          Try Standard free
        </button>
        <p className="text-[11px] mt-2" style={{ color: MUTED }}>
          Automatically renews at AUD $6.99/mo after 30 days. Cancel anytime.
        </p>
      </div>
    </section>
  );
}

function PlansPromo() {
  return (
    <section className="bg-white">
      <div className="max-w-[1000px] mx-auto px-6 pb-10">
        <div className="rounded-md px-6 py-4 flex items-center justify-between" style={{ background: PALE_BLUE }}>
          <div>
            <div className="text-[14px] font-semibold" style={{ color: INK }}>Want more options?</div>
            <div className="text-[12px]" style={{ color: MUTED }}>Find a membership that's right for you</div>
          </div>
          <button className="px-5 h-9 rounded-full text-[12px] font-semibold bg-white border" style={{ borderColor: BORDER, color: INK }}>
            See all plans
          </button>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="bg-white">
      <div className="max-w-[900px] mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold text-center mb-8" style={{ color: INK }}>Frequently asked questions</h2>
        <div className="border-t" style={{ borderColor: BORDER }}>
          {FAQS.map((f, i) => (
            <div key={i} className="border-b" style={{ borderColor: BORDER }}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between py-4 text-left"
              >
                <span className="text-[13px] font-medium" style={{ color: INK }}>{f.q}</span>
                <ChevronDown
                  size={18}
                  style={{ color: MUTED, transform: open === i ? "rotate(180deg)" : "none", transition: "transform .15s" }}
                />
              </button>
              {open === i && (
                <p className="pb-4 text-[12px] leading-relaxed" style={{ color: MUTED }}>{f.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t" style={{ borderColor: BORDER, background: SOFT }}>
      <div className="max-w-[1180px] mx-auto px-6 h-12 flex items-center justify-center gap-6 text-[11px]" style={{ color: MUTED }}>
        <span>© Copyright 2025 Audible Pty Ltd</span>
        <span>Conditions of Use</span>
        <span>Privacy Notice</span>
        <span>Help</span>
        <span>Interest-Based Ads</span>
        <span>Cookies & Internet Advertising</span>
      </div>
    </footer>
  );
}

export function AudibleLiteHome() {
  return (
    <div className="min-h-screen" style={{ background: PAGE_BG, color: INK, fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
      <Header />
      <Hero />
      <CtaTiles />
      <ListeningRow />
      <HarryPotterRow />
      <OnlyFromAudible />
      <TrendingRow />
      <MembersGetMore />
      <PlansPromo />
      <Faq />
      <Footer />
    </div>
  );
}

export default AudibleLiteHome;
