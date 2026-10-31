-- Paid event tickets start at $5, the same floor as every other paid thing in Convoy.
alter table public.club_events add constraint club_events_price_minimum check (price_cents = 0 or price_cents >= 500);
