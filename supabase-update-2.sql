-- ACOMPANHAMENTO ADM — atualização 2: preferências por usuário e quadros configuráveis
alter table public.perfis add column if not exists preferencias jsonb not null default '{}';

create table if not exists public.config (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.config enable row level security;
drop policy if exists config_ler on public.config;
create policy config_ler on public.config for select to authenticated using (true);
drop policy if exists config_admin_ins on public.config;
create policy config_admin_ins on public.config for insert to authenticated with check (public.is_admin());
drop policy if exists config_admin_upd on public.config;
create policy config_admin_upd on public.config for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists config_admin_del on public.config;
create policy config_admin_del on public.config for delete to authenticated using (public.is_admin());
revoke all on public.config from anon;
grant select, insert, update, delete on public.config to authenticated;

create or replace function public.salvar_preferencias(p jsonb)
returns void language sql security definer set search_path = '' as $$
  update public.perfis set preferencias = coalesce(p, '{}'::jsonb) where id = auth.uid();
$$;
revoke all on function public.salvar_preferencias(jsonb) from public, anon;
grant execute on function public.salvar_preferencias(jsonb) to authenticated;

-- contagem de demandas por quadro (para o admin saber se um quadro está vazio antes de excluir)
create or replace function public.contar_por_status()
returns table(status text, total bigint) language sql stable security definer set search_path = '' as $$
  select d.status, count(*) from public.demandas d where public.is_admin() group by d.status;
$$;
revoke all on function public.contar_por_status() from public, anon;
grant execute on function public.contar_por_status() to authenticated;
