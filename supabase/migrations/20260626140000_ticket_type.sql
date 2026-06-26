-- Ticket type (Bug / Todo / Feature Request / UI/UX Request / Improvement / Other).
-- Additive; existing tickets default to 'Bug'. The option list is frontend-driven.

alter table public.tickets add column if not exists type text not null default 'Bug';

create index if not exists tickets_type_idx on public.tickets (type);
