-- Sync the team from Supabase Auth.
-- The team's real names + emails already live in auth.users (the magic-link
-- allowlist). Pull them in so "Submitted By" matches users by email without
-- anyone re-typing anything, then drop the placeholder-only seed rows.
--
-- Runs server-side during db push (admin role can read the auth schema).

insert into public.team_members (name, email)
select coalesce(
         nullif(trim(u.raw_user_meta_data->>'name'), ''),
         nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
         nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
         initcap(replace(replace(split_part(u.email, '@', 1), '.', ' '), '_', ' '))
       ) as name,
       lower(u.email) as email
from auth.users u
where u.email is not null
on conflict (email) do nothing;

-- Remove the original hardcoded placeholders (no email) now that real,
-- auth-backed members exist.
delete from public.team_members where email is null;
