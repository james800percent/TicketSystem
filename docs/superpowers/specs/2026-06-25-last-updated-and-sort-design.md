# Last-Updated Display + Sort Dropdown — Design

**Date:** 2026-06-25
**Status:** Approved (pending spec review)
**Scope:** Frontend only. No schema change, no backend, no security impact.

## Summary

Add a "last updated" timestamp to each ticket card and a **Sort** dropdown to
the toolbar, so the team can see progress at a glance and order the list by
recent activity. The `updated_at` column and its auto-update trigger already
exist in the database, so this is purely a frontend change.

## Goals

- Show when each ticket was last updated, formatted as an absolute date + time
  in 12-hour Eastern time.
- Let users sort the visible tickets, including by most-recently-updated, while
  keeping the current default order.

## Non-goals

- No database schema changes, no backend/Edge Functions.
- No changes to existing search or filters (status, priority, assignee,
  assigner) — those remain exactly as they are.
- Not changing the default order (stays "Newest created").
- Not reformatting other dates (e.g., the assignment-line date) — a later
  consistency pass, out of scope here.

## Current behavior (context)

- `loadTickets()` fetches all tickets `order('created_at', desc)`;
  `renderTickets()` filters but does not re-sort.
- Toolbar today: a search box + four filter dropdowns. No sort control.
- Cards show: code, title, status/priority/assignment badges, assignment line,
  description, reporter, action buttons. No created/updated date is shown.
- DB: `updated_at timestamptz NOT NULL DEFAULT now()`, auto-bumped on every
  `UPDATE` by trigger `tickets_set_updated_at`. The app's `select('*')` already
  returns `updated_at`, so no query change is needed.

## Design

### 1. Last-updated timestamp on each card

- New pure helper `formatDateTime(iso)`:
  ```js
  new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZoneName: 'short'
  })
  ```
  Produces e.g. `Jun 25, 2026, 3:04 PM EDT`. The `timeZoneName: 'short'` auto
  labels `EST`/`EDT` correctly for the date (daylight-saving aware).
- Returns `''` for null/invalid input (guarded), in which case the line is omitted.
- Rendered as a muted meta line between the description and the footer:
  `Updated {formatDateTime(t.updated_at)}`.

### 2. Sort dropdown

- New `<select id="sortBy">` added at the **end** of the `.filters` group in the
  toolbar, with `aria-label="Sort tickets"`. To distinguish it from the existing
  *Priority filter*, its options are prefixed with `Sort:` (e.g. `Sort: Newest
  created`). Four options:
  | value      | label                  | order                                   |
  |------------|------------------------|-----------------------------------------|
  | `newest`   | Newest created (default)| `created_at` desc                       |
  | `updated`  | Recently updated       | `updated_at` desc                       |
  | `priority` | Priority (High → Low)  | High > Medium > Low, tiebreak `created_at` desc |
  | `oldest`   | Oldest created         | `created_at` asc                        |
- A `change` listener calls `renderTickets()`.
- `renderTickets()` gains a sort step: after filtering, sort a copy of the
  filtered array by the selected key, then build cards. Sorting is orthogonal to
  search/filters — they continue to work unchanged.

### Sorting logic

- Comparator selected by the dropdown value. Priority rank map:
  `{ High: 3, Medium: 2, Low: 1 }`; ties broken by `created_at` desc.
- Operate on a copied array (`[...filtered].sort(...)`) to avoid mutating state.

## Files touched

- `index.html` — add the Sort `<select>` to the `.filters` group.
- `app.js` — `sortBy` DOM ref + `change` listener; sort step in
  `renderTickets()`; `formatDateTime()` helper; "Updated …" line in the card
  template.
- `style.css` — a small muted class for the timestamp line (reuse existing muted
  styling if present).

## Edge cases

- Brand-new ticket: `updated_at == created_at` → shows creation time. Acceptable.
- Missing/invalid `updated_at` (shouldn't happen; column is NOT NULL) → line hidden.
- Priority-sort ties → secondary `created_at` desc keeps order deterministic.

## Testing

- Manual verification in the browser against live data: toggle each sort option
  and confirm ordering; confirm the timestamp renders as `… PM EDT` (current
  season) and updates after editing a ticket.
- The project has no test harness today. `formatDateTime()` and the comparators
  are pure functions and could be unit-tested if/when a harness is added; not
  introducing one for a change this small.

## Out of scope / future

- Applying the same Eastern date-time format to the assignment-line and any
  created-date display (consistency pass).
- Persisting the user's chosen sort across sessions.
