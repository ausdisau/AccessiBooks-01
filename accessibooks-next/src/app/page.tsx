export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          AccessiBooks · Next.js
        </p>
        <h1
          className="text-5xl font-bold tracking-tight md:text-6xl"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Hello from the new Next.js app.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          This is the scaffold for the AccessiBooks rebuild. Tailwind tokens,
          self-hosted fonts (Inter, Fraunces, Atkinson Hyperlegible,
          OpenDyslexic), and shadcn-ready utilities are wired up. Open this
          project directly in Cursor and start building from here.
        </p>
        <div className="flex flex-wrap gap-3 pt-4">
          <span className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Next.js 15 · App Router
          </span>
          <span className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground">
            Tailwind v3
          </span>
          <span className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground">
            shadcn/ui ready
          </span>
        </div>
      </div>
    </main>
  );
}
