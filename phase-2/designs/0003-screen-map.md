# Designs 0003 — Phase 2 screen map

**Status:** Draft — text-only design notes; Figma push pending quota reset (see `bookkeeping_design.md` memory note).
**Date:** 2026-05-18
**Visual system:** inherits Phase 1 design tokens from Figma file `jM0XiV0Im9JCaXp4GrK09k`. Paper `#FAF8F5`, ink `#1A2E40`, sage income `#4F9F87`, terracotta expense `#C2664E`. Inter throughout, tabular nums on currency.

## Where these screens live

All Phase 2 routes nest under the existing Phase 1 app shell (sidebar + topbar). The sidebar gains a "Xero" section header above three new items: **Pre-reconciliation**, **Rules**, **Compose** (with sub-items Invoice / Bill). Settings gets a new tab: **Integrations**.

Tenant switcher (if user has >1 connected Xero org) sits in the topbar to the left of the user avatar.

---

## Screen 1 — Settings → Integrations

**Purpose:** Connect, disconnect, and inspect Xero connections.

**Empty state** (no connections):

A centred card on a paper background, 480px wide. Heading: "Connect your Xero". Body: 2 lines explaining what this enables (read bank transactions, publish invoices and bills, suggest categorisations). Primary button: "Connect Xero" — leads to `/api/xero/connect`. Below the button: a small ink3 line "Read about the permissions we request".

**Connected state:**

A table-style card listing each connected Xero organisation. Columns: Organisation name, Status (active / re-auth required / disconnected), Connected on, Scopes, Actions. Actions per row: "Sync now" (manual trigger), "Disconnect" (destructive). At the top of the card, a primary "Connect another organisation" button.

**Re-auth required state:**

Amber banner at top of the screen: "Your Xero connection to *Indie Studio LLC* needs to be re-authorised. We can't sync until it's reconnected." Single button: "Re-authorise". Disabled "Sync now" button on the affected row with a tooltip.

**Mobile:**

The connections list becomes stacked cards instead of a table. Each card shows org name, status pill, scope summary, and a kebab menu for actions.

**Components used:** Card (Phase 1), Button primary + destructive (Phase 1), new `ConnectionStatusPill` component (states: active / reauth / disconnected), Banner (new — amber and ink variants).

---

## Screen 2 — Pre-reconciliation queue

**Purpose:** The bookkeeper's daily landing page. Shows unreconciled bank transactions from the active Xero org with rule-driven suggestions next to each.

**Layout (desktop 1440):**

Topbar shows tenant switcher (active org), date filter (default "This month"), and a primary button "+ Compose" with a dropdown (Invoice / Bill).

Main content is a two-pane layout. Left pane (700px) is the transaction list — a Phase 1-style table with one row per unreconciled bank transaction. Columns: Date, Description, Amount (sage if positive / terracotta if negative), Suggested category (or "—" if no rule matched), Rule (badge with rule name, hover for full condition), Status (Pending / Accepted / Overridden), Action.

Right pane (480px) is the detail panel for the currently selected row — see Screen 3.

If a rule matched, the suggestion appears inline in the row with a small "Accept" button. If accepted, the row visually fades but stays visible (struck-through-ish, with a clear "Reverse" button on hover). If no rule matched, the suggested-category column shows "—" with a "+ Create rule from this" link.

Top of the list: a summary bar — "12 unreconciled · 4 with suggestions · 8 need attention". Click any segment to filter.

**Empty states:**

- No active connection → "Connect Xero in Settings → Integrations to see your bank feed here." Inline button to navigate.
- Connection active but no unreconciled transactions → "You're caught up. Last synced 4 min ago." Refresh button.
- Initial sync in progress → "We're pulling your bank history from Xero. This usually takes 2–10 minutes." Indeterminate progress bar.

**Mobile:**

Single-pane stacked list (no detail pane — tap a row to navigate to its detail screen). Summary bar at the top, transactions below, each as a card. Floating "+" FAB opens compose actionsheet (Invoice / Bill).

**Components used:** existing transaction row, new `RuleMatchBadge` (rule name + version tag), new `SuggestionInlineAction` (Accept / Override / Create-rule).

---

## Screen 3 — Bank transaction detail panel

**Purpose:** Inspect one transaction; accept or override its suggestion; see history of rule matches.

**Layout:**

Slides into the right pane on desktop; full screen on mobile.

Top section: amount (large, color-coded), date, description, Xero account name, reference. Below that, "Suggested" block:

- Rule name (clickable → opens rule editor for that rule)
- Suggested values: category, contact, project, tax rate
- Actions: "Accept" (primary), "Override" (secondary, opens a small form to set different values), "Skip" (ghost)

If multiple rules matched (history view), show a list ordered by match time with: rule name, version, matched at, action taken.

Below: "Raw Xero data" collapsible — pretty-printed `raw_json` for debugging.

**Override flow:**

Clicking "Override" replaces the Suggested block with an inline form: category dropdown (search across Xero accounts), contact search (Xero contacts), project picker, tax-rate picker, note (optional). "Save override" writes the override and marks the rule match `override_at`.

**Components used:** Detail panel layout, FormField group, Combobox/Autocomplete for category/contact (search large lists — debounced).

---

## Screen 4 — Rules list

**Purpose:** See all rules in the tenant, ordered by priority, with quick controls for reordering, enabling, archiving.

**Layout:**

Topbar: "Rules" title, "Last-fired 4 min ago" subline. Primary button: "+ New rule".

Main: a sortable list (drag handle on left of each row). Per row:

- Drag handle
- Priority number (auto-managed)
- Enabled toggle
- Rule name (bold) + condition summary (e.g. "description contains 'AWS' OR description contains 'GCP'")
- Action summary (e.g. "→ Category: Software · Contact: Cloud providers")
- Mode badge: "Suggest" / "Auto-apply" (auto-apply is greyed/disabled in v1)
- Stats: "Fired 247× · 89% accepted"
- Kebab menu: Edit / Duplicate / View versions / Archive

Empty state: a centred card encouraging "Create your first rule. Start with something simple — like 'description contains \"Stripe\" → category Sales'."

**Mobile:** Same list, larger touch targets, drag-to-reorder via a long-press.

**Components used:** sortable list, toggle, rule summary line (new component `RuleSummary`).

---

## Screen 5 — Rule editor

**Purpose:** Author / edit a rule. Used both as a create flow and an edit flow.

**Layout (modal or full screen on mobile):**

Title: "New rule" or "Edit *<rule name>*".

Fields:

1. **Name** (required) — text input.
2. **Description** (optional) — text area, 2 lines.
3. **Apply to** — radio: "All my connected orgs" / "Just this org" (default: just this org).
4. **Conditions** — grouped condition builder. Each group has:
   - "ALL of these are true (AND)" header
   - One row per condition: `Field` dropdown · `Operator` dropdown · `Value` input (type-aware: text for `description`, range for `amount_cents`, etc.)
   - "+ Add condition" within the group
   - "+ Add another group (OR)" button at the bottom

The builder visualises the boolean structure clearly: each AND-group is a card with rounded border; between groups, an "OR" pill stands centred.

5. **Actions** — one or more action rows:
   - `Set` dropdown (category / contact / project / tax rate) · target picker
   - "+ Add action"

6. **Mode** — radio: "Suggest" (default, only option in v1) / "Auto-apply" (disabled with tooltip "Available once your acceptance rate is >90% for 30 days").

7. **Enabled** — toggle (default on).

Footer: "Cancel" (ghost), "Test against last 50 transactions" (secondary — shows preview of matches), "Save rule" (primary).

**Version history view:**

Tab inside the editor. Shows each `rule_versions` row as a card with version number, who edited, when, and a diff against the previous version.

**Components used:** ConditionBuilder (new — composite), ActionBuilder (new), Combobox for category/contact, version diff card.

---

## Screen 6 — Invoice composer (ACCREC)

**Purpose:** Compose a sales invoice; save draft locally; publish to Xero as DRAFT.

**Layout (desktop):**

Two-column. Left (640px): the form. Right (400px): live preview rendered to look like a Xero invoice PDF.

Form fields:

- **Contact** — Combobox searching local `xero_contacts`. If not found, "+ Create new contact" inline.
- **Date** — date picker (default today).
- **Due date** — date picker (default +14 days, configurable per tenant).
- **Reference** — text input.
- **Invoice number** — text input, auto-suggested but editable.
- **Line items** (dynamic):
  - Description, Quantity, Unit amount (currency input with tabular nums), Account (combobox of REVENUE accounts), Tax rate (combobox of `xero_tax_rates`)
  - Add/remove rows
- **Totals row** — sub-total, tax, total, all auto-computed.

Footer: "Save draft" (ghost), "Publish to Xero as DRAFT" (primary).

**Empty state:** "Compose an invoice — we'll publish it to Xero as a draft for your review."

**Error state:** if publish fails with 4xx, an amber inline banner above the footer states the error from Xero verbatim and offers "Edit & retry".

**Mobile:** Single-column, preview collapses to a "Preview" tab.

**Components used:** new `LineItemList`, `MoneyInput` (currency-aware), `XeroContactCombobox`, `XeroAccountCombobox`, `XeroTaxRateCombobox`, `InvoicePreview`.

---

## Screen 7 — Bill composer (ACCPAY)

**Purpose:** Compose a purchase bill; attach optional receipt PDF; publish to Xero as DRAFT.

**Layout:** Mirrors Screen 6 with two differences:

1. The Account combobox filters to EXPENSE accounts (not REVENUE).
2. An **attachment slot** sits below the line items: drag-and-drop or click-to-upload, accepts a single PDF/JPG/PNG up to 10 MB (tighter than Xero's 25 MB cap). Uploaded preview thumbnail with remove action.

Footer same as Invoice composer.

**Future hook (out of scope v1):** "Or paste receipt content" — for OCR-driven extraction. Surface in the UI but disabled.

**Components used:** all of Screen 6's, plus new `FileDropzone` and `AttachmentPreview`.

---

## Screen 8 — Tenant switcher (topbar dropdown)

**Purpose:** Switch active Xero org for users with >1 connection.

**Layout:** A dropdown trigger in the topbar showing the active org name truncated to 24 chars. On click: a panel listing all connected orgs with name, status pill, and a "Manage in Settings" link at the bottom.

Persists selection in `localStorage` per user.

Hidden entirely for users with exactly one connection.

**Components used:** topbar dropdown, ConnectionStatusPill (shared with Screen 1).

---

## Cross-cutting UI patterns

### Sync status indicator

Topbar shows a small "Synced 4 min ago" line. When a sync is in progress: rotating arrow + "Syncing…". On error: red dot + "Sync failed — retry".

### Re-auth banner

Pinned banner across all Xero-aware screens when any active connection is `status='reauth_required'`. Dismissible per-session but reappears on next session until fixed.

### Audit-log surface

Every action that mutates Xero (publish, attempt-publish, retry) is logged. A simple `/audit` page lists the latest 100 events: timestamp, user, action, target, outcome. v1 doesn't need filters or search; it's there for trust.

### Loading skeletons

Every list and detail screen uses skeleton placeholders matching the layout, not spinners. Skeletons use `T.borderSub` as their background and a slow shimmer.

---

## Components inventory (new in Phase 2)

1. `ConnectionStatusPill` — variants: active, reauth-required, disconnected
2. `RuleMatchBadge` — rule name + version
3. `SuggestionInlineAction` — Accept / Override / Skip / Create-rule cluster
4. `ConditionBuilder` — composite for grouped conditions
5. `ActionBuilder` — composite for actions list
6. `RuleSummary` — single-line rule overview for the list
7. `LineItemList` — dynamic invoice/bill line items
8. `MoneyInput` — currency-aware with tabular nums
9. `XeroContactCombobox`, `XeroAccountCombobox`, `XeroTaxRateCombobox` — searchable selects against local Xero mirrors
10. `InvoicePreview` — Xero-PDF-style preview
11. `FileDropzone` + `AttachmentPreview` — receipt upload
12. `SyncStatusIndicator` — topbar sync state
13. `Banner` — amber and ink variants for re-auth and sync-fail

All built atop existing Phase 1 primitives (Button, Input, Card, Table, Badge). Visual tokens unchanged from Phase 1.

---

## What's still to do here

- Figma frames for each screen — pending Figma MCP quota reset (see memory note `bookkeeping_design.md`).
- Visual treatment for the rule **condition builder** specifically — the most novel component, worth a dedicated Figma exploration before code.
- Empty-state illustrations — defer until copy is locked.
- Accessibility audit — keyboard nav for the condition builder is the highest-risk area (drag-and-drop reordering, nested controls).
