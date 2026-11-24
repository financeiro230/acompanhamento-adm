-- ACOMPANHAMENTO ADM — atualização 10: notas compartilhadas, controle de informações (insumos e acessos), conexão permanente com o Google

-- ===== notas compartilhadas
alter table public.notas add column if not exists membros uuid[] not null default '{}';
create index if not exists notas_membros_idx on public.notas using gin (membros);
drop policy if exists notas_compart_sel on public.notas;
create policy notas_compart_sel on public.notas for select to authenticated using ((select auth.uid()) = any(membros));
drop policy if exists notas_compart_upd on public.notas;
create policy notas_compart_upd on public.notas for update to authenticated
  using ((select auth.uid()) = any(membros)) with check ((select auth.uid()) = any(membros) or dono = (select auth.uid()));
create or replace function public.notas_protege() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.dono <> auth.uid() then new.dono := old.dono; new.membros := old.membros; end if;
  return new;
end $$;
drop trigger if exists notas_protege on public.notas;
create trigger notas_protege before update on public.notas for each row execute function public.notas_protege();

-- ===== controle de informações: pastas
create table if not exists public.info_pastas (
  id uuid primary key,
  dono uuid not null references public.perfis(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('insumos','acessos')),
  cor text,
  compartilhado boolean not null default false,
  membros uuid[] not null default '{}',
  ordem double precision not null default 0,
  criado_em bigint not null default 0,
  atualizado_em bigint not null default 0
);
alter table public.info_pastas enable row level security;
revoke all on public.info_pastas from anon;
grant select, insert, update, delete on public.info_pastas to authenticated;

create or replace function public.info_pasta_ok(p uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.info_pastas f where f.id = p and (f.dono = auth.uid()
    or (f.compartilhado and exists (select 1 from public.perfis where id = auth.uid() and ativo)
        and (cardinality(f.membros) = 0 or auth.uid() = any(f.membros)))));
$$;

drop policy if exists info_pastas_ler on public.info_pastas;
create policy info_pastas_ler on public.info_pastas for select to authenticated using (public.info_pasta_ok(id));
drop policy if exists info_pastas_criar on public.info_pastas;
create policy info_pastas_criar on public.info_pastas for insert to authenticated with check (dono = (select auth.uid()));
drop policy if exists info_pastas_alterar on public.info_pastas;
create policy info_pastas_alterar on public.info_pastas for update to authenticated using (dono = (select auth.uid())) with check (dono = (select auth.uid()));
drop policy if exists info_pastas_excluir on public.info_pastas;
create policy info_pastas_excluir on public.info_pastas for delete to authenticated using (dono = (select auth.uid()));

-- ===== controle de informações: itens (insumos / acessos)
create table if not exists public.infos (
  id uuid primary key,
  pasta uuid not null references public.info_pastas(id) on delete cascade,
  dono uuid not null references public.perfis(id) on delete cascade,
  dados jsonb not null default '{}',
  criado_em bigint not null default 0,
  atualizado_em bigint not null default 0,
  atualizado_por text
);
create index if not exists infos_pasta_idx on public.infos(pasta);
alter table public.infos enable row level security;
revoke all on public.infos from anon;
grant select, insert, update, delete on public.infos to authenticated;
drop policy if exists infos_tudo on public.infos;
create policy infos_tudo on public.infos for all to authenticated using (public.info_pasta_ok(pasta)) with check (public.info_pasta_ok(pasta));

-- ===== Google: autorização permanente (só a função do servidor lê; ninguém pelo navegador)
create table if not exists public.google_tokens (
  dono uuid primary key references public.perfis(id) on delete cascade,
  refresh_token text not null,
  email text,
  scopes text,
  atualizado_em timestamptz not null default now()
);
alter table public.google_tokens enable row level security;
revoke all on public.google_tokens from anon, authenticated;
