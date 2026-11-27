# UI Review — bookkeeping-app

Date: 2026-06-01
Reviewer: Claude Code (no code changes — analysis only)
Goal stated by Rafi: make the product feel **more modern and simpler**, aimed at owners with **limited technical experience** who still work with a **conventional bookkeeper**. The bar is "my mum could use this," not "an accountant could use this."

This document is observation + opportunity only. Nothing here has been implemented. Items are prioritised so a follow-up card can pick the highest-leverage changes first.

---

## 1. Scope of what was reviewed

Read in full: the design tokens / global CSS (`app/globals.css`), root + app shells (`app/layout.tsx`, `app/(app)/layout.tsx`), navigation (`app/(app)/nav-links.tsx`), and the primary user-facing screens — dashboard, ledger, login, business onboarding, the reconciliation queue, Xero integrations, and the rules list.

Not exercised live (no dev server run): real responsive behaviour, real data density, and the compose (invoice/bill) and rule-editor flows. Findings about those are inferred from code and flagged as such.

---

## 2. Executive summary

The foundation is genuinely good: a calm, warm "paper" palette, consistent spacing tokens, sensible focus rings, optimistic updates, and real empty/error states. It is already cleaner than most accounting tools.

But measured against the *non-technical owner* persona, three themes hold it back:

1. **Language is built for accountants and developers, not the target user.** "Pre-reconciliation," "Ledger," "Integrations," "Scopes," "Override," "AI confidence: low," and a help link into Xero's OAuth developer docs all assume vocabulary this audience does not have.
2. **It looks austere rather than modern-friendly.** Flat hairline cards with no depth, small text (lots of `text-xs`/`text-sm`), tight density, and plain-text empty states read as "spreadsheet," not "approachable app."
3. **The mobile experience will break down.** All **8** nav destinations are crammed into the mobile bottom bar, and several tap targets are below the comfortable 44px minimum — a real problem for the less tech-savvy / older end of the market.

None of this is structural. The component model is sound; most fixes are vocabulary, spacing, type scale, and a handful of shared components.

---

## 3. Design-system level findings

### 3.1 A shared component layer is missing — buttons are re-implemented everywhere
`shadcn` and `components.json` are in the project, but there is no `components/ui` directory and the screens don't use it. Instead the same button is hand-rolled with long Tailwind strings in many places, and they have *drifted*:
- `.bkp-button` (primary, ink background) in `globals.css`.
- An inline ink button repeated in `reconcile/queue-client.tsx`, `reconcile/page.tsx`.
- Bordered "secondary" buttons re-declared in `integrations-client.tsx`, `rules-client.tsx`.
- Destructive buttons re-declared per dialog.

**Opportunity:** extract `Button` (primary / secondary / destructive / ghost sizes), `Card`, `Dialog`, `Badge/Pill`, `Field` (label + input + error). This is the single highest-leverage change for both *visual consistency* and *future velocity* — every other recommendation below gets cheaper once these exist. (Maintainability note, not user-facing, but it's the root cause of several inconsistencies.)

### 3.2 Type scale is small and applied inconsistently
- `globals.css` defines `h1` at 2rem, but `dashboard/page.tsx` and `ledger/page.tsx` override it to `text-xl`, while `login` uses `text-2xl`. Headings are not predictable page to page.
- Body and metadata lean heavily on `text-xs` (12px) and `text-sm` (14px). For an audience that skews less technical and potentially older, this is too small. Modern consumer-finance apps default to 16px body and reserve 12px for true fine print.

**Opportunity:** define a real type scale (e.g. page title / section title / body / caption) in the token layer and apply it uniformly. Bump default body to 15–16px; stop overriding `h1` per page.

### 3.3 Cards are flat to the point of feeling like a wireframe
`.bkp-card` is a 1px border with no shadow. Across the app nothing has elevation. "Modern + simple" today usually means *soft depth*: a subtle shadow, slightly larger radius, and more internal padding to signal "this is a tappable, friendly surface." The current look reads as austere/utilitarian.

**Opportunity:** add a soft shadow token and a "raised" card variant for primary surfaces (summary tiles, the add-transaction form, dialogs). Keep flat for dense list rows.

### 3.4 Mixed British/American spelling
Copy mixes `organise`/`categorisation`/`organisation`/`re-authorise` (en-GB) with `color`, `USD`, and `en-US` number formatting. It's small, but inconsistency undercuts the "polished and trustworthy" feel that matters most for a money app.

**Opportunity:** pick one voice (likely en-US given USD) and align all microcopy.

### 3.5 Color carries meaning alone, and one mapping is misleading
- Confidence and status are communicated by color + a word, which is fine, but the **"Overridden" status reuses the green income background** (`reconcile/queue-client.tsx` `StatusPill`), so a manual change looks identical to an accepted suggestion. Confusing.
- "No suggestion" uses the **expense red** treatment, which reads as an *error* rather than a neutral "needs a human." For a nervous non-technical user, red = "I did something wrong."

**Opportunity:** give "overridden" its own neutral/blue treatment distinct from "accepted," and make "needs attention" amber/neutral rather than alarming red.

---

## 4. Navigation

### 4.1 Mobile bottom bar is overloaded (highest-priority mobile issue)
`MobileNav` in `nav-links.tsx` does `navSections.flatMap(...)` — so **all 8 destinations** (Dashboard, Activity, Ledger, Pre-reconciliation, Integrations, Rules, New invoice, New bill) render in a fixed bottom bar. On a phone that's ~45px per item with labels like "Pre-reconciliation" that cannot fit. Result: truncation, cramped tap targets, and no visual hierarchy between "things I do daily" and "settings."

**Opportunity:**
- Reduce the bottom bar to **4–5 primary destinations** max (e.g. Home, Activity, Reconcile, + a central "Add" action).
- Move Integrations and Rules under a **Settings** screen, not the main bar.
- Turn "New invoice / New bill" into a single **+ / Create** action (a sheet already exists for this pattern in `reconcile/compose-fab.tsx` — reuse it app-wide).

### 4.2 Section labels speak the wrong language
The desktop sidebar groups items under "Bookkeeping," "**Xero**," "Settings," and "**Compose**." "Xero" exposes the integration as a mental model the owner shouldn't need; "Compose" is jargon for "create." A bookkeeper-adjacent owner thinks in tasks ("Review," "Create," "Money in / out"), not vendor names.

**Opportunity:** relabel around user tasks. E.g. "Review" (reconcile/activity), "Create" (invoice/bill), "Setup" (integrations/rules). Drop the "Xero" section header; surface the connection status elsewhere.

### 4.3 Disabled nav with no explanation
When there's no business yet, `DesktopNav` renders items as `cursor-not-allowed` with no tooltip or reason. A new user sees greyed-out links and doesn't know why.

**Opportunity:** either hide them until onboarding completes, or show a one-line "Finish setup to unlock."

---

## 5. Terminology & microcopy (the biggest persona gap)

The target user does not know these terms. Concrete offenders and plain-language swaps:

| Current | Where | Plain-language alternative |
|---|---|---|
| "Pre-reconciliation" | nav, `/reconcile` | "Review transactions" / "To review" |
| "Ledger" | nav, page | "Transactions" / "Records" |
| "Integrations" | nav, settings | "Connections" / "Connected apps" |
| "Override" | reconcile detail | "Change category" |
| "Scopes" + Xero OAuth doc link | `integrations-client.tsx` | Hide entirely, or "What can we see?" in plain words |
| "AI confidence: low" (red) | queue rows | "We're not sure — please check" (neutral) |
| "Source: AI / Rule" badges | queue rows | Keep, but explain on first use |
| Category shown as `Name (income)` / `(expense)` | `add-transaction-form.tsx` | Don't expose the internal "kind"; group or icon instead |
| "Magic link" | login | "We'll email you a sign-in link" (already partly there) |

**Special call-out — the Xero scopes link.** `integrations-client.tsx` links "Read about the permissions we request" straight to `developer.xero.com/.../oauth2/scopes/`. That's developer documentation; it will bewilder this audience. Replace with one or two plain sentences about what the app can see and do.

**Special call-out — the reconcile hand-off.** The flagship flow ends with "ready to reconcile in Xero" and opens Xero in a new tab (`queue-client.tsx`). The "we suggest here, but you finish in Xero" two-app dance is inherently confusing for a non-technical owner. At minimum it needs a short, reassuring explainer ("You've sorted these. Your bookkeeper / Xero does the final tick — here's why."). This is partly a product constraint (the app can't programmatically reconcile bank lines), so the *explanation* is the lever, not the flow.

---

## 6. Screen-by-screen notes

### 6.1 Dashboard (`dashboard/page.tsx`)
- **`SeedDemoDataForm` is on the live dashboard.** A "seed demo data" control on a real user's home screen looks unfinished and could be alarming. Gate it to dev / empty-state only.
- Three summary tiles are good, but dense and small (`text-lg`). These are the emotional core of the page (am I making money?) — they deserve to be the largest, friendliest thing on screen.
- No first-run guidance. A brand-new user with no transactions sees empty tiles and a form. Consider a short "Get started" checklist (add first transaction → connect Xero → set a rule).
- "This month by category" is a plain list with no visualisation. A simple bar or proportion indicator would make it instantly readable for non-numeric users.

### 6.2 Ledger (`ledger/page.tsx`)
- Solid and clean. Main gaps for the persona: no search/filter, no date grouping ("Today / This week"), `text-xs` date+note line is easy to miss, and amounts rely on +/- and color only. Capped at 50 with no "load more."

### 6.3 Add transaction (`add-transaction-form.tsx`)
- Category dropdown renders `"{name} ({kind})"`, leaking the internal income/expense enum into the label. Group options or use the already-selected Type to filter the list instead.
- Amount is a bare text input with placeholder `0.00` and no currency symbol or inline validation. Add a `$` affordance and friendly validation ("Enter an amount like 12.50").
- Field order (Type → Amount → Date → Category) is reasonable; consider leading with the most natural question ("How much?").

### 6.4 Login (`login/login-form.tsx`)
- Among the strongest screens: clear, focused, good pending/sent states, resend cooldown. Keep as the visual benchmark for the rest of the app.
- Minor: title is the raw repo name "bookkeeping-app." Use the real product name and a warmer one-liner.

### 6.5 Onboarding (`business-profile-form.tsx`)
- Clean and appropriately minimal. Opportunity: it's a dead end — after "Continue" there's no guided next step toward the *first valuable action* (connect Xero / add a transaction). Worth turning into step 1 of a short setup flow.

### 6.6 Reconcile queue (`reconcile/queue-client.tsx`, `reconcile/page.tsx`)
- The most sophisticated screen — bulk select, optimistic accept, filters, summary bar. Strong bones.
- Density is high and type is small for what is the app's primary workflow. Lots of stacked `text-xs` pills (status + confidence + source + category) on one row will overwhelm a non-technical user. Consider showing the essentials by default and tucking confidence/source behind a tap.
- The fixed inline `height: calc(100vh - 3.5rem)` assumes a 3.5rem header; if the header height or the reauth banner changes, the layout math breaks. Prefer flex/`svh`-based sizing.
- Red left-border + red "needs attention" makes the queue feel like a list of problems rather than a quick, satisfying task. Reframe visually toward "progress" (e.g. a "X of Y done" bar — the data is already computed as `acceptedCount`).

### 6.7 Integrations (`integrations-client.tsx`)
- Good empty state and a real disconnect confirmation dialog. Issues: the "Scopes" column + developer-docs link (see §5), and a desktop table vs mobile card split that duplicates markup — a shared responsive list/`DataList` component would remove the divergence and guarantee parity.

### 6.8 Rules (`rules-client.tsx`)
- Genuinely good plain-language summaries ("Description contains 'X' → Category"). The list, toggle, reorder, and delete-confirm are all solid.
- For the persona, the *concept* of rules is the hard part, not the UI. The empty state ("Add your first rule to start auto-categorising") could teach with one concrete example ("e.g. anything from 'Starbucks' → Meals").

---

## 7. Accessibility & ergonomics

- **Tap targets:** mobile nav items (~45px tall, 8-wide), the rule enable toggle (36px wide), and the reorder chevrons (`h-5 w-6`) are below the 44×44px comfort target. Important for the less-dexterous end of the audience.
- **Text size:** pervasive 12–14px text. Bump body to 15–16px; reserve 12px for genuine fine print.
- **Color-only signals:** confidence/status/amount direction. Add an icon or text cue alongside color (also helps colour-blind users).
- **Positive baseline:** focus-visible rings are consistently implemented, dialogs use `role="alertdialog"`/`aria-modal`, and inputs are labelled. Good foundation — don't regress it during a restyle.

---

## 8. Prioritised recommendations

### P0 — highest leverage, do first
1. **Fix the mobile bottom bar** (§4.1): 4–5 destinations, move settings out, central "+" create action. Biggest single usability win on phones.
2. **De-jargon the product surface** (§5): rename "Pre-reconciliation," "Ledger," "Integrations," "Override," "Scopes"; replace the Xero OAuth doc link with plain words. Pure copy change, very high impact.
3. **Extract a shared component layer** (§3.1): `Button`, `Card`, `Badge`, `Dialog`, `Field`. Unblocks consistent execution of everything else.

### P1 — modern + friendly pass
4. **Type scale + spacing** (§3.2, §3.3): one scale, larger body text, soft card elevation, more breathing room.
5. **Fix status/confidence semantics** (§3.5): distinct "overridden" treatment; neutral (not red) "needs attention."
6. **Remove `SeedDemoDataForm` from the live dashboard** (§6.1) and make the summary tiles the hero.
7. **Add a guided first-run** (§6.1, §6.5): onboarding → connect → first transaction checklist.

### P2 — polish & delight
8. Reconcile screen: progress framing, reduce per-row pill density, robust (non-hardcoded) height (§6.6).
9. Ledger: search, date grouping, "load more" (§6.2).
10. Dashboard: simple visual for "by category" (§6.1).
11. Spelling/voice consistency pass (§3.4); replace "bookkeeping-app" with the real product name (§6.4).
12. Tap-target and icon-cue accessibility pass (§7).

### Quick wins (small effort, visible payoff)
- Replace the developer scopes link with plain copy.
- Rename nav labels and sections.
- Hide demo-data seeding from production users.
- Stop leaking `(income)/(expense)` in the category dropdown.
- Bump body font size and dialog/card padding.

---

## 9. What's already working (keep these)
- Warm, calm "paper" palette and coherent token system.
- Login flow — clear, paced, reassuring. Use it as the design benchmark.
- Real empty, caught-up, error, and reauth states throughout.
- Optimistic accept/bulk-accept in the reconcile queue.
- Plain-language rule summaries.
- Consistent focus-visible rings and labelled, accessible dialogs.

---

## 10. Suggested next step
None of the above changes product behaviour or accounting logic — they're presentation and language. A sensible first card is **P0 #3 (shared component layer)** paired with **P0 #2 (de-jargon copy)**, since together they make the P1 visual pass fast and consistent. Recommend turning §8 into discrete Linear cards rather than one large "redesign" branch, to keep one-card-per-PR discipline.
