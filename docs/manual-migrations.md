# Manual migrations

Procedures an admin runs by hand when the scripted migration can't (usually
because the API token lacks admin scope for custom-field creation).

## Add the `Estimated Budget` custom field to every `01. Budget` list

**Why:** the dashboard's Budget Outlook view tracks each trade as three
numbers — Estimated Budget, Finalized Lowest Bid, New Budget. `Estimated
Budget` is a stored ClickUp custom field; the other two are derived. Until
this field exists the dashboard renders `—` for Estimated and falls back to
allocated for New Budget.

**Scripted path (try first):** `npm run migrate:estimated-budget` — see
`scripts/add-estimated-budget-field.ts`. If it reports permission failures,
use the steps below.

**Manual path:**

ClickUp custom fields can be shared across lists in a Space, so you only need
to create the field once and apply it to each `01. Budget` list.

1. Open any project folder under the **Active Projects** space
   (`90173230172`) and open its **`01. Budget`** list.
2. Click the **`+`** at the right end of the column header row → **New
   field** (or **Custom Fields** → **Create field**).
3. Set **Field type** = **Money**, **Name** = exactly `Estimated Budget`
   (no emoji, exact casing — the dashboard matches the field by this name),
   currency **USD**, precision **2 decimals**. Save.
4. In the field's settings, choose **Add to other Lists** (or **Apply to
   Locations**) and select the **`01. Budget`** list of every other project
   folder under the Active Projects space. If ClickUp scopes the field to the
   Space automatically, confirm it appears on each `01. Budget` list.
5. Spot-check 2–3 project folders: open their `01. Budget` list and confirm
   the `Estimated Budget` column is present and editable.

The field can be left empty — the dashboard treats an empty `Estimated
Budget` as "unknown" (renders `—`), not `$0`. A genuine `$0` line item
(e.g. DOT Meeting) should have `0` typed in explicitly.

Once the field exists, the team backfills values from the SharePoint
"Budget Outlook" xlsx; the dashboard picks them up on the next 60s refresh.
