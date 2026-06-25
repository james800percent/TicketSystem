-- Add an optional project association to tickets.
-- Additive and safe: existing rows get NULL (= "None").
-- The list of valid projects is driven by the frontend for now; a dedicated
-- projects table will come later with the GitHub integration (project -> repo).

alter table public.tickets add column if not exists project text;

create index if not exists tickets_project_idx on public.tickets (project);
