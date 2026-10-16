-- The same entitlement can come from the App Store/Play (revenuecat) and Stripe (web).
-- Keying by source means one provider's sync can never delete or overwrite the other's grant.
alter table public.entitlements drop constraint entitlements_pkey;
alter table public.entitlements add primary key (user_id, entitlement, source);
alter table public.entitlements add constraint entitlements_source_check check (source in ('revenuecat', 'stripe'));

-- One Stripe Customer per Convoy user (written by the stripe function only).
create table public.stripe_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null unique,
  -- free trial is offered once per user
  trial_used boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.stripe_customers enable row level security;
create policy "read own stripe customer" on public.stripe_customers
  for select to authenticated using (user_id = (select auth.uid()));

-- Lets refunds find the ticket they belong to.
alter table public.event_rsvps add column stripe_payment_intent text;
create index event_rsvps_payment_intent_idx on public.event_rsvps(stripe_payment_intent) where stripe_payment_intent is not null;

comment on column public.club_payouts.charges_enabled is
  'True when the connected account''s transfers capability is active (marketplace recipients receive transfers; they do not take card payments).';
