create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Shared secret between the cron job and the notify function, generated in-database.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'notify_cron_secret', 'Authenticates scheduled calls to the notify function');

-- NOTE: the URL is this project's; change the ref if you recreate the project.
select cron.schedule(
  'club-event-reminders',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://qdcdveoidmnwqnabfuvd.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
