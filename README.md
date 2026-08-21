# Outreach — Automated SMB Website Agent

An automated agent that finds small businesses without websites (by city and ZIP),
cold-emails them, auto-replies to responses, collects payment via Stripe
($100 setup + $25/month), and generates + deploys a templated website — with a
city-first admin UI for review and control.

## Stack

- **Admin app:** Next.js 15 (App Router, TS strict), Tailwind v4, shadcn-style UI
- **DB:** Postgres (Neon in prod) via Drizzle ORM; embedded PGlite for local dev/tests
- **Jobs:** Inngest
- **Email:** Resend (outbound + inbound parse)
- **LLM:** Anthropic Claude
- **Payments:** Stripe Payment Link (subscription mode)
- **Client sites:** static templates deployed to Cloudflare Pages

## Getting started

```bash
pnpm install
cp .env.example .env        # defaults run fully offline with fake providers
pnpm db:migrate             # applies migrations (PGlite: zero setup)
pnpm db:seed                # 2 demo cities + fake leads
pnpm dev                    # http://localhost:3000  (password: ADMIN_PASSWORD)
```

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test          # unit/integration (offline, fake providers)
pnpm test:e2e      # Playwright smoke test (offline, fake providers)
```

## Provider modes

`PROVIDER_MODE=fake` (default) swaps every external API — Places, Resend,
Anthropic, Stripe, Hunter, Cloudflare — for offline fakes so the entire
system runs with zero API keys. Set `PROVIDER_MODE=live` and fill in the
keys in `.env` to go live; boot fails with a readable message naming any
missing variable.

## Layout

```
apps/web/          Next.js admin + API routes + webhooks + Inngest functions
packages/env/      Zod-validated environment
packages/db/       Drizzle schema, migrations, seed, query helpers
packages/email/    Resend client, templates, personalization, DNS health
packages/agents/   discovery, qualification, enrichment, reply agent, sitegen
packages/sites/    client site template pack + static builder
```
