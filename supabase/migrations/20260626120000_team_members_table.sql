-- Team members table — replaces the hardcoded list in app.js.
-- Any authenticated user can manage the team (the magic-link allowlist is the
-- trust boundary). email + github_handle support future email-on-resolve and
-- the GitHub integration.

create table if not exists public.team_members (
    id            uuid primary key default gen_random_uuid(),
    name          text not null,
    email         text unique,
    github_handle text,
    active        boolean not null default true,
    created_at    timestamptz not null default now()
);

alter table public.team_members enable row level security;

create policy "Authenticated can read team" on public.team_members
    for select to authenticated using (true);
create policy "Authenticated can insert team" on public.team_members
    for insert to authenticated with check (true);
create policy "Authenticated can update team" on public.team_members
    for update to authenticated using (true) with check (true);
create policy "Authenticated can delete team" on public.team_members
    for delete to authenticated using (true);

grant all on table public.team_members to anon, authenticated, service_role;

-- Seed the current hardcoded members (only if the table is empty).
insert into public.team_members (name)
select v.name from (values
    ('James Brady'), ('Nick Gillis'), ('Evan Walters'), ('Glenn Lundy'),
    ('Hannah Gross'), ('Brandon Randolph'), ('Jessica Bailey'), ('Sam Cox')
) as v(name)
where not exists (select 1 from public.team_members);
