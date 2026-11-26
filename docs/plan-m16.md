# M16: reminders only

## Why

The Cave replaces a notes app, a calendar and a money app in one place. Agents do the clever work through MCP; the owner's screens are for quick manual changes, with as few options as possible. Payments mixed the calendar with money: ✓ on a bill logged an expense, a subscription carried an amount, account and category. The owner types every expense by hand, so payments are two systems glued together. From now on a bill, a card statement, a loan or a subscription is a reminder, and Money is only what the owner types.

## Goals

1. **Payments retire.** Every payment, subscriptions included, becomes a reminder. Nothing in the app or the MCP reads or writes payments afterwards.
2. **Lead-up.** A reminder can start reminding a while before its date, at a chosen frequency, counted back from the date (and from each date of a repeating series), never forward from today.
3. **Add in a row.** Saving in the New sheet keeps it open on the same form, cleared, so the next expense, task, reminder or note follows without reopening `+`.

## Non-goals and anti-goals

- No link between reminders and money: no amount on a reminder, no "paid" that writes an expense, no forecast from reminders. Agents can infer that from notes and transactions.
- No new options beyond the two lead-up selects. A form that grows a row of switches has failed even if it works.
- Nothing hard-deleted; past expenses keep their `payment` values.

## Approach (decided)

Considered: (a) retire payments with a seed migration that writes reminders, as M15 did for LeetCode; (b) keep payments and stop ✓ from logging money; (c) for the lead-up, one extra reminder per lead-up day; (d) one flow per lead time. The owner chose (a): one kind of dated thing. (c) clutters the calendar and breaks repeats; (d) can't differ per reminder. The lead-up is two fields on the reminder, read by the date trigger.

## Design

### Seed migration 28 (`shared/payments-to-reminders.ts`)

Runs once, like `leetcodeToNotesMigration`. For each live payment (not `_deleted`):

- a new reminder (id derived from the payment's, so a rerun writes the same doc): `_title`, `due`, `repeat` and `_repeatFrom` copied; `done` = `active === false`; `_body` the kind only (`Bill`, `Subscription`, …): amount, category and account stay on the deleted payment, since an agent scoped to reminders but not payments must not read them (and a reminder is not money); a payment whose `rem-<id>` is already taken is left as it is;
- `lead_days: 1, lead_every: 1` for an active non-subscription (they were told the day before), nothing for subscriptions;
- the payment marked `_deleted`.

Then: the `payments` collection `_deleted`; money's `payment` field archived (values stay); the `reminders` collection gains `lead_days` and `lead_every` (number fields); the flow `flow-payments` `_deleted`. A payment without `due` becomes a reminder without a date (the Agenda's "No date").

### Lead-up

- Fields on a reminder: `lead_days` (how many days before) and `lead_every` (days between). Absent or 0 = off.
- Form (`ReminderForm`): one select **Start reminding**: Off, 1 day, 3 days, 1 week, 2 weeks, 1 month before (0, 1, 3, 7, 14, 30). When not Off, one select **Every**: day, 2 days, week (1, 2, 7). Nothing else.
- Points for one date D: D − lead_days, then every `lead_every` days, while before D; then D itself. Same wall time as D (a date-only D uses the reminder time). Example: D = Dec 10, 7 days, daily → Dec 3 … Dec 9 lead-up, Dec 10 due.
- Notifications: the `date-arrives` trigger reads `lead_days`/`lead_every` from the item when they are positive (any collection, so a flow on tasks gets it free). Each point runs the flow once, keyed `flow:<flow>:<item>:<D>@<point>`; the due point keeps today's key `flow:<flow>:<item>:<D>` so nothing already sent fires again. A repeating reminder's lead-up runs before each date of its series. The 6-hour catch-up and the flow's switch-on time apply to each point. The notify title gets the distance: the built-in reminder flow's title becomes `{{item.title}}{{arrival.in}}`, where `arrival.in` is ` · in 3 days`, ` · tomorrow`, or empty on the day.
- Agenda: an open reminder whose current date D is ahead but whose lead-up has started shows under **Today**, labelled `in 3 days` / `tomorrow`; on D it is in Today as now. The Month grid shows only D.

### Removed

`shared/payments.ts` (but the `REPEAT_FIELD`/`TASK_FIELDS` it exports move to where tasks and reminders read them), `shared/subscriptions.ts`, `web/src/logic/subscription-paid.ts`, `PaymentForm`, `SubscriptionForm`, `PaymentsView`, `pages/Subscriptions.tsx`, payment items in `agenda()`, `calendar.ts`, `Calendar.tsx`, `useAgendaActions` (✓ is reminder and task only), the New sheet's Subscription, the `mark_paid` MCP tool and payment handling in `agent-writer`, the digest's payments section, payment actions in web push and notices, payments in `sample-data`, `lists.ts`'s payment fields, e2e `subscriptions.e2e.ts` and payment parts of other e2e files. `/money/subscriptions` and `/money/payments` redirect to `/money/transactions`. Money's tabs lose Subscriptions.

### Add in a row

The New sheet's `done` shows the toast and remounts the open form (a key that changes per save) instead of closing. Escape, the scrim, ✕ and navigating still close it. Applies to Money, Task, Reminder and Note.

### Docs

`architecture.md` (seed collections, Repeats and payments, routes), `guide.md`, `agents.md` (`mark_paid` gone), `decisions.md` (a new line amending 2026-10-25 M12 "Payments are the one place…", 2026-10-27 and 2026-11-12 Subscriptions Paid), AGENTS.md Status.

## Constraints

- Branch + PR: seed migration on real data. Before it runs on the VPS: `bun run backup`, and the owner confirms.
- Repo is public: tests and sample data use made-up payments.
- Full `bun run e2e` (pages lose Subscriptions and payment rows).

## Left to the builder

File split inside `server/flows` and `shared/flows/date-trigger.ts`; how `arrival.in` enters the template context; test names; CSS cleanup of payment styles.

---

# Implementation plan

> For agentic workers: executed natively in one session (owner: run end to end). Steps are checkboxes. Every task ends with `bun run check` and `bun test` green, then a one-line commit on `m16-reminders-only`.

**Goal:** payments become reminders; reminders gain a lead-up; the New sheet stays open after a save.
**Architecture:** one pure module `shared/lead.ts` feeds the date trigger (server) and the Agenda (web); seed migration 28 converts data; then every payment path is deleted.
**Tech:** Bun 1.4.3, TypeScript strict, React 19, Dexie, bun:test, Playwright.

## Global constraints

- Migration ids derived from the payment id: reminder id = `rem-<paymentId>`.
- Lead choices exactly: Start reminding 0 (Off), 1, 3, 7, 14, 30 days; Every 1, 2, 7 days.
- Labels exactly: ` · in N days`, ` · tomorrow`, `` on the day.
- Made-up figures only in tests and sample data.

## Review focus

1. Lead longer than the repeat interval (daily repeat, 7-day lead): lead-up of D starts only after the previous occurrence; no point fires twice, none lands before the previous date. Test in Task 1.
2. A reminder snoozed or done during its lead-up: done stops the rest (engine skips `done`); a snooze moves D, so points follow the new D. Test in Task 2.
3. Already-sent due notifications keep their key `flow:<f>:<item>:<D>`: turning lead on after D's notification was sent never resends D. Test in Task 2.
4. The owner's edited `flow-reminders` title is never overwritten by migration 28 (only the exact old title `{{item.title}}` becomes `{{item.title}}{{lead}}`). Test in Task 3.
5. A payment without `due`, an inactive one, a deleted one: undated open reminder, done reminder, nothing. Test in Task 3.

### Task 1: `shared/lead.ts`

Files: create `shared/lead.ts`, `shared/lead.test.ts`.
Produces:
- `interface Lead { days: number; every: number }`
- `leadOf(data: Record<string, unknown>): Lead | undefined` — `lead_days` a positive integer, `lead_every` a positive integer (default 1, at most `days`); else undefined.
- `leadPoints(date: string, lead: Lead, after?: string): string[]` — wall strings (same time part as `date`, date-only stays date-only) at `date − days + k·every` for k ≥ 0 while before `date`, and strictly after `after` (the previous occurrence) when given; ascending.
- `leadLabel(daysLeft: number): string` — `""` at ≤ 0, ` · tomorrow` at 1, ` · in N days` otherwise.
- `daysUntil(from: string, to: string): number` — whole local days between two `YYYY-MM-DD[...]`.
- [ ] Tests: `leadPoints("2026-12-10", {days: 7, every: 1})` → Dec 3 … Dec 9 (7 items); `{days: 7, every: 2}` → Dec 3, 5, 7, 9; timed `"2026-12-10T08:30"` keeps `T08:30`; `after: "2026-12-09"` with `{days: 7, every: 1}` → `[]`; month boundary `"2027-01-02"`, 3 days → Dec 30, 31, Jan 1; `leadOf({lead_days: 0})` undefined, `{lead_days: 3, lead_every: 9}` → every 3; labels for 0, 1, 3.
- [ ] Implement; tests pass; commit "Reminders can start a lead-up before their date".

### Task 2: the date trigger fires the lead-up

Files: `shared/flows/date-trigger.ts` (+test), `shared/flows/templates.ts` (+test), `server/flows/engine.ts` (+`engine.test.ts`), `shared/flows/built-in.ts`.
Consumes Task 1. Produces:
- `latestArrival(value, repeat, before, now, zone, anchor?, lead?: Lead)` → `{ date: string; at: number; point?: string }`: with `lead`, the newest occurrence whose first lead point (or `before`) has arrived, then the newest of its points and itself up to `now`; `point` set when that is a lead point. Without `lead`, unchanged.
- `TemplateContext.lead?: string`; `{{lead}}` allowed by `templateErrors`, rendered from `ctx.lead ?? ""`.
- Engine `arrivals`: passes `leadOf(item.data)`; key `flow:<f>:<item>:<date>` or `…:<date>@<point>`; the run's context gets `lead: leadLabel(daysUntil(point ?? date, date))`.
- Built-in reminders flow title `{{item.title}}{{lead}}`.
- [ ] Tests (date-trigger): due Dec 10 09:00, lead 7/1, now Dec 5 10:00 → `{date: "2026-12-10", point: "2026-12-05"}`; now Dec 10 10:00 → no point; monthly series anchored Nov 10, now Dec 6 → date Dec 10, point Dec 6; daily repeat with lead 7 → no point before the previous occurrence.
- [ ] Tests (engine): a reminder with lead 3/1 notifies "Pay card · in 3 days", next day "· in 2 days", … then "Pay card" on the day, once each; done during lead-up → no more; snoozed to a later due → points follow; an already-run key `flow:<f>:<item>:<D>` is not rerun after lead is set.
- [ ] Implement; tests pass; commit "The reminder flow notifies through a reminder's lead-up".

### Task 3: seed migration 28 retires payments

Files: create `shared/payments-to-reminders.ts` (+test); modify `shared/seed.ts`, `shared/flows/built-in.ts`, `server/seed-migrations.test.ts`, `shared/seed.test.ts`, `shared/tasks.ts`.
Produces `paymentsToRemindersMigration(get: Get, items: (c: string) => Doc[]): SeedDoc[]`:
- per live payment: reminder `rem-<id>` in `reminders` with `_title`, `due` (when present), `repeat`, `_repeatFrom` (when present), `done: active === false`, `_body` = parts joined by ` · `: kind label (Subscription, Card, Bill, Loan, Other), `$<amount>` with `≈` when `approx`, the account string; `_created` copied; `lead_days: 1, lead_every: 1` when active and kind ≠ subscription; the payment `_deleted: true`;
- `payments` collection `_deleted`; `flow-payments` `_deleted`; money's `payment` field `archived: true`; `reminders` collection gains `lead_days` ("Start reminding", number) and `lead_every` ("Every", number) when missing; `flow-reminders` title rewritten only when it is exactly `{{item.title}}`;
- nothing when `payments` is missing or deleted except the reminders fields and flow title (so fresh and second runs are idempotent).
Seed: `{ version: 28, docs: [], update: paymentsToRemindersMigration }`; `seedDocs()` no longer seeds payments; `COLLECTIONS.reminders` gains both fields; `builtInFlows()` drops `flow-payments`; migration 7 no longer adds the payments collection; `REPEAT_FIELD`/`TASK_FIELDS` move to `shared/tasks.ts`; `paymentLinkMigration` and `MONEY_PAYMENT_REF` move into `payments-to-reminders.ts` (migration 11 still needs them).
- [ ] Tests: every Review focus 4–5 case; subscription gets no lead; second run writes nothing new; owner-edited flow title kept.
- [ ] Implement; tests pass; commit "Seed migration 28: every payment becomes a reminder".

### Task 4: the server forgets payments

Files: `server/agent-writer.ts`, `server/mcp/server.ts`, `shared/mcp-tools.ts`, `server/mcp/mcp.test.ts`, `server/notify/digest.ts` (+test), `server/notify/notice.ts`, `server/notify/types.ts`, `server/notify/api.test.ts`, `server/flows/engine.test.ts`, `server/sample-data.ts`, `server/sample-db.ts` (+test), `shared/registry.ts` describe text, `shared/schema.ts` (`payments` view type only if no stored-doc validation needs it), delete `shared/payments.ts` (+test), `shared/subscriptions.ts` (+test).
- [ ] `mark_paid` removed (tool, writer method, tests); digest has no payments section; notices have no `payment` kind; sample data's payments become sample reminders with a lead-up (made-up titles).
- [ ] `bun run check`, `bun test` green; commit "The server has no payments: no mark_paid, no payment notices".

### Task 5: the app forgets payments

Files: `web/src/logic/agenda.ts` (+test), `web/src/logic/calendar.ts` (+test), `web/src/pages/Calendar.tsx`, `web/src/ui/useAgenda.ts`, `web/src/ui/AgendaList.tsx`, `web/src/pages/Agenda.tsx`, `web/src/ui/useAgendaActions.tsx`, `web/src/ui/ItemDrawer.tsx`, `web/src/ui/MoneyForm.tsx`, `web/src/pages/Transactions.tsx`, `web/src/pages/MoneyLists.tsx`, `web/src/app/sections.ts` (+test), `web/src/app/router.ts` (+test), `web/src/pages/SectionPage.tsx`, `web/src/pages/CollectionPage.tsx`, `web/src/ui/NewSheet.tsx`, `web/src/app/quick.ts`, `web/src/ui/AccountPicker.tsx`, `web/src/styles/money.css`; delete `PaymentForm`, `SubscriptionForm`, `PaymentsView`, `pages/Subscriptions.tsx`, `logic/subscription-paid.ts` (+test).
Produces: `AgendaType = "reminder" | "task"`; `agenda(reminders, tasks, now, zone)`; `AgendaItem.leadIn?: number` (days left while in the lead-up, placed in Today; `whenLabel` returns `in N days` / `tomorrow`).
- [ ] Tests: agenda puts a reminder due in 3 days with lead 7 under Today with `leadIn: 3`, one with lead 1 under This week; router `/money/subscriptions` and `/money/payments` → `/money/transactions`.
- [ ] Green; commit "The app has no payments; reminders in their lead-up show under Today".

### Task 6: the reminder form's lead-up

Files: `web/src/ui/ReminderForm.tsx`.
- [ ] One select "Start reminding" (Off, 1 day, 3 days, 1 week, 2 weeks, 1 month before); when not Off, "Every" (day, 2 days, week). Save writes `lead_days` and `lead_every` (Off writes `lead_days: 0`).
- [ ] e2e in `e2e/reminders.e2e.ts`: set 1 week · every day, reopen, values kept.
- [ ] Commit "The reminder form sets a lead-up".

### Task 7: add in a row

Files: `web/src/ui/NewSheet.tsx`.
- [ ] `done` shows the toast and bumps a counter used as the form's `key`; the sheet stays open on the same form.
- [ ] e2e in `e2e/new.e2e.ts`: save two expenses in a row without reopening `+`; both in Transactions.
- [ ] Commit "The New sheet stays open for the next one".

### Task 8: e2e, docs, ship

- [ ] Delete `e2e/subscriptions.e2e.ts`; fix payment parts of `money-tabs`, `navigation`, `reminders`, `rows`, `push`, `helpers`.
- [ ] `docs/architecture.md`, `guide.md`, `agents.md`, `system.md`/`onboarding.md`/`hosting.md` mentions; `decisions.md` line; AGENTS.md Status; `docs/log/m16.md` with real command output.
- [ ] `bun run check`, `bun test`, `bun run e2e` all green; push the branch, open the PR (names the migration on its own line).
