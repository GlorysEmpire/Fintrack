# FinTrack — Launch checklist (Postgres + Vercel)

## Why Postgres
Vercel serverless cannot use SQLite files. PostgreSQL (Neon or Vercel Postgres) is the production database.

---

## 1. Create a Postgres database (5 min)

### Option A — Neon (recommended free start)
1. Go to https://console.neon.tech and sign up  
2. **New project** → name `fintrack`  
3. Copy the **connection string** (starts with `postgresql://…`)  

### Option B — Vercel Postgres
1. Vercel dashboard → your project → **Storage** → **Create Database** → Postgres  
2. Connect to the project → pull env vars  

---

## 2. Local setup

### Local Postgres (already works on this machine)

```bash
brew services start postgresql@16
# DB name: fintrack  ·  user: your macOS username  ·  no password on socket auth
```

`apps/web/.env` should look like:
```
DATABASE_URL="postgresql://prophetglory@localhost:5432/fintrack?schema=public"
SESSION_SECRET="fintrack-dev-secret-change-in-production"
AUTH_DEV_SHOW_CODE="true"
```

Then:
```bash
cd ~/Projects/personal/fintrack
npm install
npm run build -w @fintrack/domain
cd apps/web && npx prisma migrate deploy && cd ../..
npm run dev
```

Open http://localhost:3456 — login code appears on screen (dev) and in the terminal.

### Or use Neon for local + prod (same URL shape)

Paste Neon connection string into `DATABASE_URL` and run `npx prisma migrate deploy` from `apps/web`.

---

## 3. Real email (production)

1. Sign up at https://resend.com  
2. Create an API key  
3. (Later) verify your domain; for testing Resend’s `onboarding@resend.dev` works to **your** signup email only  

In `.env` / Vercel:
```
RESEND_API_KEY=re_...
EMAIL_FROM="FinTrack <onboarding@resend.dev>"
AUTH_DEV_SHOW_CODE=false
```

---

## 4. Deploy to Vercel

### Recommended dashboard settings (monorepo)
| Setting | Value |
|---------|--------|
| **Root Directory** | repository root (not `apps/web`) |
| **Install Command** | `npm install` |
| **Build Command** | `npm run vercel-build` (from `vercel.json`) |
| **Framework** | Next.js (auto) — if prompted, point at `apps/web` |

If Vercel can’t find Next automatically, set **Root Directory** to `apps/web` and:
- Install: `cd ../.. && npm install`
- Build: `cd ../.. && npm run build -w @fintrack/domain && cd apps/web && npx prisma generate && npx prisma migrate deploy && next build`

### First time (CLI)
```bash
# From repo root
npm i -g vercel   # if needed
vercel login
vercel
```

### Environment variables (Production)
| Name | Value |
|------|--------|
| `DATABASE_URL` | Neon/Vercel Postgres URL (`?sslmode=require`) |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `AUTH_DEV_SHOW_CODE` | `false` |
| `RESEND_API_KEY` | Resend key |
| `EMAIL_FROM` | Your from-address |
| `XAI_API_KEY` | optional |

### Build pipeline
```
npm run vercel-build
→ build @fintrack/domain
→ prisma generate + prisma migrate deploy + next build
```
Commit `apps/web/prisma/migrations/` so production can migrate.

---

## 5. Smoke test on production URL

1. Open `https://your-app.vercel.app`  
2. Request login code → **check email** (not the page)  
3. Onboarding → default plan  
4. Log income → expense → open Inbox  
5. AI Advisor (offline or live if `XAI_API_KEY` set)  

---

## 6. Optional later
- Custom domain  
- Export/import JSON  
- Household sharing  
- App Store (Expo)  

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Prisma` can't connect | Check `DATABASE_URL`, SSL (`?sslmode=require` for Neon) |
| Migrate fails on Vercel | Ensure migrations folder is committed (`apps/web/prisma/migrations`) |
| No login email | Set `RESEND_API_KEY`; check Resend logs |
| Domain package missing | Build from monorepo root; `transpilePackages` already set |
| Cookie not set on HTTPS | `secure: true` in production (already handled) |
