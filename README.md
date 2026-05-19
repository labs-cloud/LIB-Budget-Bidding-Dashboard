# LIB Budget & Bidding Dashboard

Live, ClickUp-backed Budget & Bidding dashboard for Lead It Builders. Replaces
Brady's `All Jobs Status (Bidding Status).csv` (portfolio scan) and the
per-project `<project> - Bidding Status.xlsx` sheets with a single dashboard
embedded inside ClickUp via iframe.

- **Production:** https://lib-budget-bidding-dashboard.vercel.app
- **Build brief:** [`AGENTS.md`](./AGENTS.md)
- **ClickUp SOP (authoritative):** https://leadit.clickup.com/9017603275/v/dc/8cqvd6b-305837

## Stack

- Next.js 14 (App Router) on Vercel
- React Server Components fetch ClickUp REST directly with `fetch({ next: { revalidate: 60 } })`
- Tailwind for layout · CSS variables drive theming (`data-theme="light"|"dark"` on `<html>`)
- Vitest for the lowest-bid automation tests

## Views

1. **Portfolio Bidding Matrix** (`/`) — trade × project grid of 2-letter status pills
2. **Per-Project Bid Grid** (`/project/[folderId]`) — sub 1–4 with $ + status, Updated Budget column, Award Δ
3. **Coordinator Worklist** (v1.5, deferred)

Add `?embed=1` to either view to hide the frame chrome and render flush — that's
what the ClickUp Dashboard embed widget loads.

## Lowest-bid → Updated Budget automation

The dashboard owns this automation in v1 (per SOP §11). For every Budget task:

1. Filter eligible bids: skip `No Bid / Declined`, `Needs Rebid`, `Not Started`, and any null / zero `Bid/Contracted Amount`.
2. If any bid is `Awarded` → that wins.
3. Else → `MIN(Bid/Contracted Amount)`. Tie-break by most recent `Date Updated`, then `orderindex`.
4. No eligible bids → fall back to `Budget Allocated`.
5. `Trade Type = Set` → `Updated Budget = Budget Allocated` (no bidding loop).
6. Writes only happen when the value actually changed. **`Budget Allocated` is never overwritten.**
7. Posts a ClickUp comment on the Budget task summarizing the change.

It runs on a **Vercel cron every 5 minutes** (`vercel.json`) and is also exposed
opportunistically on dashboard refresh. Implementation: [`lib/clickup/budgetAutomation.ts`](./lib/clickup/budgetAutomation.ts).
Tests: [`lib/clickup/budgetAutomation.test.ts`](./lib/clickup/budgetAutomation.test.ts) — covers MIN-across-children,
tied minimums, award reversal, and Set-type pinning.

## SOP sync health

The dashboard also runs a read-only Budget → Bidding sync health check. It
flags true SOP contradictions like active Biddable trades with missing generated
Bidding tasks, Set trades with Bidding tasks, active bidding without Budget
Allocated, and unlinked Bidding tasks. Blank or Pending Trade Type is tracked
separately as setup work, not as broken sync. These show inline in the dashboard
and in `/api/budget/refresh` totals, but the app does not create or repair
ClickUp tasks; `Updated Budget` remains the only write.

## Local development

```bash
git clone https://github.com/labs-cloud/LIB-Budget-Bidding-Dashboard.git
cd LIB-Budget-Bidding-Dashboard
cp .env.example .env.local      # fill in CLICKUP_API_TOKEN
npm install
npm run dev
```

Without a `CLICKUP_API_TOKEN`, the dashboard renders against realistic
fixtures from `lib/clickup/mockData.ts` so you can develop and preview without a token.

Required env vars:

| Variable | Default | Notes |
|----------|---------|-------|
| `CLICKUP_API_TOKEN` | — | Personal API token. **Required for live data.** |
| `CLICKUP_WORKSPACE_ID` | `9017603275` | leadit.clickup.com workspace |
| `CLICKUP_ACTIVE_PROJECTS_SPACE_ID` | `90173230172` | Source of the project folders |
| `CLICKUP_MASTER_PROJECTS_LIST_ID` | `901710536629` | Used for the folder-name cross-check warning |
| `CRON_SECRET` | — | Optional shared secret protecting `/api/budget/refresh` |
| `NEXT_PUBLIC_DASHBOARD_URL` | — | Used in embed deep-links |

## Scripts

```bash
npm run dev      # local dev server
npm run build    # next build
npm run start    # next start
npm run lint     # next lint
npm run test     # vitest run
```

## Deploy

```bash
vercel link
vercel env add CLICKUP_API_TOKEN production
vercel deploy --prod
```

The cron is declared in [`vercel.json`](./vercel.json); Vercel picks it up
automatically on the next deploy.

## Repo layout

```
app/
  page.tsx                          # View 1 — Portfolio Matrix (landing)
  project/[id]/page.tsx             # View 2 — Per-Project Bid Grid
  api/budget/refresh/route.ts       # Cron + on-demand automation runner
components/
  StatusPill.tsx
  SubCell.tsx
  AwardDeltaChip.tsx
  ThemeToggle.tsx
  KpiCard.tsx
  RefreshOnFocus.tsx
  EmbedClass.tsx
lib/
  clickup/
    client.ts                       # Typed ClickUp REST client
    types.ts                        # Statuses, trades, custom field names, domain types
    budgetAutomation.ts             # Lowest-bid logic + tests
    mockData.ts                     # Token-less fallback fixtures
  data.ts                           # Live/mock loader for views
  formatting.ts                     # fmt($), delta classification, etc.
  matrix.ts                         # Portfolio Matrix shape + KPI rollups
styles/
  globals.css                       # CSS variables + Tailwind
mockups/
  bb_portfolio_matrix_v2.html       # Visual target for View 1
  bb_per_project_grid_v2.html       # Visual target for View 2
```
