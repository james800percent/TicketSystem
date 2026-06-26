-- Private ("only me") tickets.
-- Adds an is_private flag and rewrites the permissive RLS policies so that
-- private rows are creator-only while shared rows stay team-wide.
-- Additive + safe: existing rows default to is_private = false (shared).

alter table public.tickets
  add column if not exists is_private boolean not null default false;

-- SELECT: shared tickets visible to all authenticated; private only to creator.
drop policy if exists "Logged-in users can read tickets" on public.tickets;
create policy "Read shared or own private tickets" on public.tickets
  for select to authenticated
  using (is_private = false or created_by = auth.uid());

-- UPDATE: same visibility, and WITH CHECK prevents flipping someone else's
-- shared ticket to private (new row's created_by must be the editor for private).
drop policy if exists "Logged-in users can update tickets" on public.tickets;
create policy "Update shared or own private tickets" on public.tickets
  for update to authenticated
  using  (is_private = false or created_by = auth.uid())
  with check (is_private = false or created_by = auth.uid());

-- DELETE: shared by anyone; private only by creator.
drop policy if exists "Logged-in users can delete tickets" on public.tickets;
create policy "Delete shared or own private tickets" on public.tickets
  for delete to authenticated
  using (is_private = false or created_by = auth.uid());

-- INSERT policy is unchanged: "Logged-in users can create tickets"
--   with check (auth.uid() = created_by)
