# FinTrack

Personal finance OS — custom budget waterfalls, multi-currency tracking, household sharing (soon), and a finance-native AI advisor (soon).

**Primary target:** App Store · **Now:** Web first for fast testing · **Legacy vanilla app:** `legacy/`

## Sprint 1 ✅

- Monorepo: `apps/web` + `packages/domain`
- Email one-time-code login (dev shows code on screen + terminal)
- Onboarding: default template / other templates / **skip**
- Plan engine: ordered waterfall + remainder split
- Settings: switch template, emergency **carry-over** (on by default) with clear copy

## Sprint 2 ✅

- Log **income** & **expenses** (FAB + modal, multi-currency)
- Default **8 income sources** (seeded; editable later)
- Live waterfall preview when logging income
- Dashboard: real month income / expenses / net / bucket balances
- **Soft friction**: never hard-blocks spending; overspend requires reason + confirm
- Delete mistaken transactions

## Sprint 3 ✅

- Dashboard UI closer to product screenshot: top bar, tab nav, 4 metrics, **donut + bar charts**
- Tabs: Overview · Income · Expenses · Plan settings · **AI Advisor** · **Inbox**
- **FinTrack Steward** AI — philosophy-bound coach (SpaceXAI / xAI via `XAI_API_KEY`)
- Offline rule-based coach when no API key
- **Inbox**: override spends create accountability messages

## Sprint 4 — Launch path ✅ (in progress)

- **PostgreSQL** (Prisma) instead of SQLite — ready for Vercel
- Local Postgres via Homebrew + migration `init_postgres`
- **Resend** email hook for login codes (console fallback in dev)
- `vercel.json` + **LAUNCH.md** deploy checklist
- Later optional: 2FA authenticator, blockchain identity

## Quick start (local)

```bash
# Postgres must be running (Homebrew)
brew services start postgresql@16

cd ~/Projects/personal/fintrack
cp apps/web/.env.example apps/web/.env   # if needed — already set for local Postgres
npm install
npm run build -w @fintrack/domain
cd apps/web && npx prisma migrate deploy && cd ../..
npm run dev
```

Open [http://localhost:3456](http://localhost:3456)

1. Enter any email  
2. Use the **dev code** on the page / terminal (`AUTH_DEV_SHOW_CODE=true`)  
3. Choose default plan, another template, or skip  

**Production / Vercel:** see [LAUNCH.md](./LAUNCH.md)

## Structure

```
apps/web              Next.js app (UI + API routes) + Prisma
packages/domain       Pure money math (waterfall, templates, carry-over, FX)
legacy/               Original single-page HTML/JS app
LAUNCH.md             Postgres + Vercel deploy steps
```

## Auth notes

- Email + 6-digit OTP → Postgres (`EmailOtp`, `Session`, `User`)
- Dev: code in terminal + page when `AUTH_DEV_SHOW_CODE=true`
- Prod: set `RESEND_API_KEY` + `EMAIL_FROM`; never enable `AUTH_DEV_SHOW_CODE`

## Scripts

| Command | What |
|---------|------|
| `npm run dev` | Web on port 3456 |
| `npm run db:migrate` | Create/apply migrations (dev) |
| `npm run db:deploy` | Apply migrations (CI / Vercel) |
| `npm run db:studio` | Prisma Studio |
| `npm run test:domain` | Domain unit tests |
| `npm run vercel-build` | Domain + web build for Vercel |
