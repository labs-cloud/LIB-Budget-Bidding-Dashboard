# LIB Budget & Bidding Dashboard — Build Brief

**Repo:** https://github.com/labs-cloud/LIB-Budget-Bidding-Dashboard
**Sibling reference:** https://github.com/labs-cloud/LIB-Plans-Permit-Dashboard (same stack, same patterns — reuse aggressively)
**Notion design page:** https://www.notion.so/35f31e50091a814181c1cf0e823719c0
**Notion SOP:** https://www.notion.so/35e31e50091a8141b073fed29d642ca8
**ClickUp SOP (authoritative):** https://leadit.clickup.com/9017603275/v/dc/8cqvd6b-305837

If anything below conflicts with the ClickUp SOP doc, the ClickUp SOP wins — update this brief, then build.

## 0. Skills to load before you start

Before reading the rest of this brief, run `/plugins` (or check available skills) and load whichever of these are installed. They're optional — none are blockers — but each meaningfully helps a specific phase of the build. If a skill isn't installed, skip it silently; don't ask the user to install anything.

**Engineering plugin** (highest leverage for this build):
- `engineering:system-design` — invoke once at the start to think through API client / data fetching / route structure before writing code
- `engineering:architecture` — invoke when picking between the three lowest-bid automation implementations (§6) and writing a one-page ADR for the decision
- `engineering:testing-strategy` — invoke before writing tests for the lowest-bid automation logic; covers MIN-across-children, tied minimums, award-reversed edge cases
- `engineering:documentation` — invoke for the repo's README and the inline JSDoc on the ClickUp client
- `engineering:deploy-checklist` — invoke right before the first `vercel deploy` (env vars, secrets, build settings)
- `engineering:debug` — keep handy for ClickUp API quirks (rate limits, custom field ID resolution)
- `engineering:code-review` — invoke as a self-review pass before opening a PR

**Design plugin** (for matching the mockups):
- `design:design-system` — invoke when wiring up the CSS variables + status pill component; helps lock token naming
- `design:design-handoff` — invoke once with the two mockup HTML files as input to produce a component-by-component spec sheet
- `design:accessibility-review` — invoke after the Portfolio Matrix is rendering; WCAG 2.1 AA check (color contrast on status pills, keyboard nav across the matrix, screen reader on the bid grid)

**Productivity plugin:**
- `productivity:memory-management` — turn on at the start so you carry workspace IDs, list IDs, and the canonical status names across sessions without re-discovering them

If you have the `data:` skills available, you don't need them — there's no SQL or warehouse work in this project.

## 1. Goal

Replace Brady's `All Jobs Status (Bidding Status).csv` (portfolio scan) and per-project `<project> - Bidding Status.xlsx` sheets with a live, ClickUp-backed dashboard, embedded inside ClickUp via iframe. Every interactive element deep-links into ClickUp so the team sees-and-acts in one flow.

## 2. Stack — locked

- **Framework:** Next.js 14+ (App Router) on Vercel
- **Styling:** Tailwind + shadcn/ui (match the P&P repo's `components/ui` setup exactly)
- **Data fetching:** Server components reading from ClickUp REST API via a typed client (port the client from `LIB-Plans-Permit-Dashboard` if it's portable; otherwise rebuild with the same shape)
- **Auth:** Personal API token, env var `CLICKUP_API_TOKEN`. No OAuth in v1.
- **Caching:** Vercel Edge cache, 60s TTL. Refresh on tab focus.
- **Polling:** Client refetches every 60s while tab is visible.
- **Writes:** **Read-only** for status/field edits. The lowest-bid → Updated Budget automation (§6) is the ONE exception — that writes back via ClickUp API.
- **Theme:** **Light default, single sun/moon toggle button top-right.** Toggle flips `data-theme` on `<html>`; all colors via CSS variables. Persist choice in `localStorage`.
- **Embed:** Option C — workspace-dashboard iframe + per-project deep links. Support `?embed=1` (hides chrome) and a full page mode.

## 3. ClickUp data contract — verbatim from the SOP

### Workspace + spaces
- Workspace: `9017603275` (leadit.clickup.com)
- Active Projects space: `90173230172`
- Each project is a folder under that space; folder name = project name (e.g. `800 Brady Ave`)

### Lists per project folder
- `01. Budget` — one task per Trade
- `02. Bidding` — one task per subcontractor invited to bid on a Trade
- `00. Project Overview` — project-level metadata
- `03. Plans`, `04. Permits`, `05. Construction`, `06. Violations & Compliance`, `07. Finance` (not read by this dashboard)

### `01. Budget` task statuses (verbatim)
1. `to budget` (initial)
2. `Open for Bidding` (Trade Type = Biddable)
3. `Budget Set` (Trade Type = Set)
4. `Bid List Confirmed` (a child Bidding task hit `Awarded`)

### `02. Bidding` task statuses — the 9-stage list (verbatim, in order)
1. `Not Started`
2. `RFP Sent`
3. `Followed Up`
4. `Bid Received`
5. `Leveling`
6. `Leveled - Pending Review`
7. `Needs Rebid`
8. `No Bid / Declined`
9. `Awarded`

### `01. Budget` custom fields read
- `Trades` — dropdown, 66 options (the Official Trades list — see §11 below)
- `Trade Type` — `Biddable` | `Set` (only two options)
- `Cost Type` — `Hard Costs` | `Soft Costs` (pre-filled; do not edit)
- `Budget Allocated` — currency (original approved estimate)
- `Updated Budget` — currency (auto-written by the lowest-bid automation — see §6)
- `Subcontractors` — list of qualified companies for this Trade
- `Start of Bidding Date` — date
- `Project ID` — short text

### `02. Bidding` custom fields read
- `Bid/Contracted Amount` — currency
- `Budget Allocated` — currency (pulled from parent Budget task)
- `Date Updated` — date
- `Followed-Up` — date
- `Award Date` — date (set on the winning bid only)
- `Link` — OneDrive URL to subcontractor folder
- `Subcontractor` — label / list relationship

### Project folder → Master Projects Board cross-reference
The folder name must match the `name` of the corresponding record in Master Projects Board list `901710536629` (Resources space). Existing Make scenarios depend on this. The dashboard does not need to write to Master Projects Board but should surface a warning banner if a Budget task's project folder name doesn't have a matching Master record.

## 4. Views to build (priority order)

### View 1 — Portfolio Bidding Matrix (landing page)
Direct replacement for `All Jobs Status (Bidding Status).csv`. Rows = Trades, columns = Projects, cell = 2-letter status pill colored per the canonical Bidding Status. KPIs on top: Bids in flight / Followed Up >5d / Leveled - Pending / Needs Rebid. Filter chips: project / trade / cost type / status. Click a cell → drill to View 2 scoped to that project + trade.

**Reference mockup:** `bb_portfolio_matrix_v2.html` in the parent folder (visual target).

### View 2 — Per-Project Bid Grid
Direct replacement for `<project> - Bidding Status.xlsx`. Rows = Trades, columns = Sub 1–4 + Updated Budget + Budget Allocated + Award Δ. Each sub cell shows: avatar + sub name + $ amount + status pill. Lowest non-disqualified bid gets a green outline ring. Hard/Soft cost stripe on the trade column. Award Δ chip is red if Updated Budget > Budget Allocated by >10%, green if more than 5% under, neutral otherwise. KPI strip: Budget Allocated (estimate) / Updated Budget (live) / Award Δ / Coverage %.

**Reference mockup:** `bb_per_project_grid_v2.html` in the parent folder (visual target).

### View 3 — Coordinator Worklist (v1.5)
Flat list of bids needing action: overdue Followed Up (>5 business days since `Date Updated` in `RFP Sent`), newly `Bid Received` with `Bid/Contracted Amount` still null, `Needs Rebid` back-and-forth. Each row deep-links to the ClickUp task.

### View 4 — Risk Surface (v2)
Award Δ heatmap; project rollups (% coverage, $ awarded vs $ estimated); trades over 10% in red. Defer to v2 unless time allows in v1.

## 5. Component inventory

Reuse the shadcn/ui primitives the P&P repo already wired up. New components specific to B&B:

- `<StatusPill code="AW" status="Awarded" />` — 2-letter colored pill mapping to the 9 Bidding statuses
- `<SubCell sub={...} amount={...} status="Awarded" isLowest={true} />` — money-first cell with sub avatar + $ + status pill
- `<AwardDeltaChip updated={...} budget={...} />` — colored chip with sign and percentage threshold logic
- `<TradeRow trade={...} costType="Hard" />` — trade column with hard/soft stripe
- `<ThemeToggle />` — sun/moon button; CSS-variable-driven
- `<KpiCard label value sublabel color />` — already exists in P&P, reuse
- `<PortfolioCell projectId tradeId code />` — clickable matrix cell that drills to View 2

## 6. Lowest-bid → Updated Budget automation (the dashboard owns this)

Per [SOP §11](https://www.notion.so/35e31e50091a8141b073fed29d642ca8), the dashboard is the owner of this automation in v1 (Option B — server-side in Next.js, not Make).

**Trigger:** every dashboard refresh; also a Vercel cron every 5 minutes as a fallback.

**Per Trade (one Budget task):**
1. Fetch all Bidding tasks where the parent Trade matches.
2. Filter to eligible: exclude `No Bid / Declined`, `Needs Rebid`, `Not Started`, and any null/zero `Bid/Contracted Amount`.
3. If an `Awarded` bid exists → its amount wins (authoritative).
4. Else → `MIN(Bid/Contracted Amount)` across eligible.
5. If no eligible bids → fall back to `Budget Allocated`.
6. If parent Trade Type = `Set` → `Updated Budget` = `Budget Allocated` (no bidding loop).
7. Write the result to `Updated Budget` on the parent Budget task via ClickUp API. **Never overwrite `Budget Allocated`.**
8. Post a comment on the Budget task: `Auto-updated to $X based on bid from <Sub> ($X, <Bidding Status>)`.

**Project rollup (computed on each refresh, not written back):**
- `Project Estimated` = SUM(Budget Allocated)
- `Project Updated` = SUM(Updated Budget)
- `Project Award Δ` = Updated − Estimated
- `Coverage %` = COUNT(Budget tasks with ≥1 Awarded child) / COUNT(Budget tasks where Trade Type = Biddable)

**Edge cases (must handle):**
- Tied minimums → pick most recently updated; tie-break by orderindex
- Award reversed → re-run; flips back to next-lowest non-disqualified
- Non-USD bids → out of scope v1; log warning and skip the trade
- $0 bid amounts → treat as null
- Folder-name mismatch with Master Projects Board → fail loudly with the same error code as Make scenario `4607672`

## 7. Design system

**CSS variables** (light defaults, dark overrides via `[data-theme="dark"]`):

```css
:root {
  --bg-page: #f1efe8;
  --bg-frame: #ffffff;
  --bg-card: #f7f7f5;
  --bg-row-alt: #fbfaf7;
  --text-primary: #1a1a1a;
  --text-secondary: #5f5e5a;
  --text-tertiary: #888780;
  --border-tertiary: rgba(0,0,0,0.10);
  --border-secondary: rgba(0,0,0,0.25);
}
[data-theme="dark"] {
  --bg-page: #0d0d0c;
  --bg-frame: #1a1a1a;
  --bg-card: #2c2c2a;
  --bg-row-alt: #232321;
  --text-primary: #f1efe8;
  --text-secondary: #b4b2a9;
  --text-tertiary: #888780;
  --border-tertiary: rgba(255,255,255,0.10);
  --border-secondary: rgba(255,255,255,0.25);
}
```

**Status pill colors (hardcoded — do NOT pull from CSS vars; they need to be the same across themes):**

| Code | Status | Background | Text |
|------|--------|------------|------|
| AW | Awarded | `#30a46c` | white |
| LV | Leveling | `#186221` | white |
| LP | Leveled - Pending Review | `#aacdab` | `#173404` |
| BR | Bid Received | `#12a594` | white |
| RS | RFP Sent | `#0091ff` | white |
| FU | Followed Up | `#ab4aba` | white |
| NR | Needs Rebid | `#ffc53d` | `#633806` |
| NS | Not Started | `#a18072` | white |
| ND | No Bid / Declined | `#e5484d` | white |

**Cost stripes (left border on trade column):** Hard `#d85a30`, Soft `#ffc53d`.

**Award Δ thresholds:** `>10%` over → red bg `#fceaea` / text `#791f1f` (dark mode: bg `#4a1b0c` / text `#f5c4b3`). `>5%` under → green bg `#eaf3de` / text `#27500a` (dark mode: bg `#173404` / text `#c0dd97`).

**Typography:** system stack (Inter / SF Pro). Tabular numerals on every $ amount.

**Density:** compact. Matrix rows ~28px tall. Per-project rows ~9�2px tall.

## 8. Repo structure

```
/app
  /(dashboard)
    page.tsx              # View 1 — Portfolio Matrix (landing)
    project/[id]/page.tsx # View 2 — Per-Project Bid Grid
    worklist/page.tsx     # View 3 — Coordinator Worklist
/components
  /ui                     # shadcn primitives (copy from P&P)
  StatusPill.tsx
  SubCell.tsx
  AwardDeltaChip.tsx
  TradeRow.tsx
  ThemeToggle.tsx
  KpiCard.tsx
/lib
  clickup/
    client.ts             # Typed ClickUp REST client
    types.ts              # Status enums, Trade enum, custom field IDs
    budgetAutomation.ts   # The lowest-bid logic from §6
  formatting.ts           # fmt($), deltaChip, etc.
/styles
  globals.css             # CSS variables + Tailwind
/api
  /budget/refresh
    route.ts              # Cron endpoint that runs the lowest-bid automation across all projects
```

## 9. Mockup HTML reference files

The two HTML mockups in the parent workspace folder are the visual target:
- `bb_portfolio_matrix_v2.html` → use as the pixel-level reference for View 1
- `bb_per_project_grid_v2.html` → use as the pixel-level reference for View 2

Match the layout, colors, spacing, and copy of these files. If you diverge, document why.

## 10. Definition of done — v1

- [ ] Vercel deploy at `lib-budget-bidding-dashboard.vercel.app` returns the Portfolio Matrix populated from live ClickUp on page load
- [ ] All 9 Bidding statuses render with the exact colors in §7
- [ ] Drill from Portfolio Matrix cell → Per-Project Grid for that project works
- [ ] Per-Project Grid shows the live `Updated Budget` column with the bolt icon and project totals row
- [ ] Lowest-bid automation runs on cron + on dashboard refresh; writes to `Updated Budget` for at least one test project end-to-end
- [ ] Theme toggle persists across reloads (localStorage)
- [ ] iframe embed of the Portfolio Matrix works inside a ClickUp Dashboard embed widget
- [ ] Deep-links from any cell open the corresponding ClickUp task
- [ ] No console errors in either theme

## 11. Trades list — Official (from ClickUp SOP)

Use this list, **verbatim**, when displaying trade names. If a Trade dropdown option in live ClickUp differs from this list, use the live dropdown value (the dropdown is the live source) but log a warning.

**Soft Cost (42):** Expediter, Surveyer, Special Inspector, Concrete Testing & Lab, MEP Shop Drawings, Site Safety Plans, Fire Extinguishers & Safety Equipment, Portable Bathrooms, Vibration Monitoring, DOT Meeting, Superintendent, Live Security, Asbestos Removal, Demolition, Tree Removal, Construction Fence, Dewatering, SOE & Foundation & Superstructure, Soil Trucking & Hauling, Foundation Waterproofing, Steel, Bricks / CMU, Scaffolding / Shed, Hoist, Roofing, Green Roof, Roof Railings / Fencing, Stucco, Windows, Balcony Doors, Main Entrance Door, Garage Door, Balcony Railings, Pavers / Hardscape, Plumbing & Sprinkler, Watermain, HVAC, Pipe Insulation, Electrical, Low Voltage, Fire Alarm, Fire Stopping

**Hard Cost (24):** Insulation, Framing, Elevator, Garbage Chutes, Interior Doors & Trim, Interior Railings, Tape / Paint, Tile Supply, Tile Installation, Wood Flooring, PTAC Units, Lighting Fixtures, Plumbing Fixtures Bathtubs, Kitchens, Appliances, Lobby / Amenity Finishes, Bike Room Tracks, Mailbox, Signage, Parking Stops & Marking, Street Restoration, Rubbish Removal, Post Construction Cleaning, GC Fee

## 12. Open questions deferred to v2

These do not block v1:

- [ ] Subcontractor master cleanup (186 labels, several near-duplicates like `Skyline` vs `skylie`)
- [ ] Multi-address projects (e.g. `940-942 Woodycrest`, `1035 & 1039 42nd St`) — one row or two in Portfolio Matrix?
- [ ] Sub leaderboard (wins per sub across portfolio)
- [ ] Exec sign-off threshold for awards (target $250k, confirm with Isaac)
- [ ] Webhooks vs polling (currently polling only)
- [ ] Write-back path for status changes (currently read-only)

## 13. Local development

```bash
git clone https://github.com/labs-cloud/LIB-Budget-Bidding-Dashboard.git
cd LIB-Budget-Bidding-Dashboard
cp .env.example .env.local
# fill in CLICKUP_API_TOKEN
npm install
npm run dev
```

`.env.local` keys:
```
CLICKUP_API_TOKEN=pk_...
CLICKUP_WORKSPACE_ID=9017603275
CLICKUP_ACTIVE_PROJECTS_SPACE_ID=90173230172
NEXT_PUBLIC_DASHBOARD_URL=https://lib-budget-bidding-dashboard.vercel.app
```

## 14. Reference systems

- **ClickUp workspace:** `9017603275`
- **Master Projects Board list:** `901710536629`
- **Subcontractors master list:** `901709498953`
- **Active Projects space:** `90173230172`
- **SharePoint root:** `leaditbuilders.sharepoint.com/sites/LeaditBuilders/Shared Documents/01_ACTIVE_PROJECTS/`
- **Make scenario (Trade Type → Bidding tasks):** `4607672`
- **Make scenario (Drive link repair):** `4811569`
