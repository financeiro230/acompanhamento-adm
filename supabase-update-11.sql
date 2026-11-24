-- ACOMPANHAMENTO ADM — atualização 11: notificações push (celular e computador)

create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null references public.perfis(id) on delete cascade,
  endpoint text not null unique,
  p256dh text,
  auth text,
  aparelho text,
  criado_em timestamptz not null default now(),
  ultimo_ok timestamptz
);
alter table public.push_inscricoes enable row level security;
revoke all on public.push_inscricoes from anon;
grant select, delete on public.push_inscricoes to authenticated;
drop policy if exists push_insc_minhas on public.push_inscricoes;
create policy push_insc_minhas on public.push_inscricoes for select to authenticated using (dono = (select auth.uid()));
drop policy if exists push_insc_apagar on public.push_inscricoes;
create policy push_insc_apagar on public.push_inscricoes for delete to authenticated using (dono = (select auth.uid()));

-- registra este aparelho para a pessoa logada (se o aparelho era de outra pessoa, passa para quem está logado)
create or replace function public.push_registrar(p_endpoint text, p_p256dh text, p_auth text, p_aparelho text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  delete from public.push_inscricoes where endpoint = p_endpoint;
  insert into public.push_inscricoes(dono, endpoint, p256dh, auth, aparelho) values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_aparelho, 200));
end $$;
revoke all on function public.push_registrar(text, text, text, text) from public, anon;
grant execute on function public.push_registrar(text, text, text, text) to authenticated;

create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  publica text,
  privada jsonb,
  cron_token text not null default gen_random_uuid()::text
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
insert into public.push_config(id) values (1) on conflict (id) do nothing;

create table if not exists public.push_fila (
  id bigserial primary key,
  inscricao uuid not null references public.push_inscricoes(id) on delete cascade,
  titulo text not null,
  corpo text,
  url text,
  tag text,
  criado_em timestamptz not null default now(),
  entregue_em timestamptz
);
create index if not exists push_fila_insc_idx on public.push_fila(inscricao) where entregue_em is null;
alter table public.push_fila enable row level security;
revoke all on public.push_fila from anon, authenticated;

create table if not exists public.push_enviados (
  chave text not null,
  dono uuid not null,
  em timestamptz not null default now(),
  primary key (chave, dono)
);
alter table public.push_enviados enable row level security;
revoke all on public.push_enviados from anon, authenticated;

-- verificação a cada minuto
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'acomp-push';
select cron.schedule('acomp-push', '* * * * *', $job$
  select net.http_post(
    url := 'https://upvkaawddhvicoupdtpd.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron', (select cron_token from public.push_config where id = 1)),
    body := '{"acao":"varrer"}'::jsonb,
    timeout_milliseconds := 20000);
$job$);
