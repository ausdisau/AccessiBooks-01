# AccessiBooks (Next.js)

The new home for AccessiBooks — a Next.js 15 (App Router) rebuild of the
accessible audiobooks and e-reading platform from Australian Disability Ltd.

This repository is intentionally **standalone**. It does not depend on
any external workspace, API server, or mobile app. Open it directly in
Cursor and work in it as a normal Next.js project.

## Stack

- **Next.js 15** with the App Router and React 19
- **TypeScript** in strict mode
- **Tailwind CSS v3** with the AccessiBooks color tokens, typography
  variables, and self-hosted fonts (Inter, Fraunces, Atkinson
  Hyperlegible, OpenDyslexic)
- **shadcn/ui** ready (`components.json` is configured; run
  `pnpm dlx shadcn@latest add <component>` to pull components in)
- **ESLint** (`next/core-web-vitals` + `next/typescript`) and
  **Prettier** with `prettier-plugin-tailwindcss`
- Deploys to **Vercel** out of the box

## Open in Cursor

1. Clone or copy this folder anywhere on disk (it does not need to live
   inside the legacy monorepo).
2. In Cursor: **File → Open Folder…** and pick `accessibooks-next/`.
3. Install dependencies and start the dev server (see below).

## Local development

```bash
# install dependencies (pnpm recommended)
pnpm install

# start the dev server on http://localhost:3000
pnpm dev
```

Other scripts:

- `pnpm build` — production build
- `pnpm start` — run the production build
- `pnpm lint` — ESLint
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm format` — Prettier write

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values you need.
Nothing in the scaffold requires them yet — they are listed so that
downstream tasks (DB, auth, Stripe, email, AI, storage) can drop in
without surprises.

### Point at a local Postgres

The cleanest local setup is Postgres in Docker:

```bash
docker run --name accessibooks-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=accessibooks \
  -p 5432:5432 -d postgres:16
```

Then in `.env.local`:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/accessibooks
```

The Prisma schema and migrations will be added in a follow-up task.

## Deployment

This project is configured to deploy to **Vercel** with zero extra
config. Push it to a Git repo, import it in Vercel, and add the
environment variables from `.env.example`. The default region is
`syd1` (Sydney) to keep latency low for the Australian user base — edit
`vercel.json` to change it.

## Project layout

```
accessibooks-next/
├── public/fonts/        # self-hosted woff2/woff (Inter, Fraunces, Atkinson, OpenDyslexic)
├── src/
│   ├── app/
│   │   ├── globals.css  # Tailwind directives + AccessiBooks tokens + @font-face
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/ui/   # shadcn/ui components land here
│   └── lib/utils.ts     # `cn()` helper for class merging
├── components.json      # shadcn/ui config
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── vercel.json
└── .env.example
```
