-- ACOMPANHAMENTO ADM — atualização 5: notas (estilo Keep), anexos, cor dos cartões, atualizações em compromissos compartilhados
alter table public.demandas add column if not exists cor text;
alter table public.demandas add column if not exists anexos jsonb not null default '[]';
alter table public.eventos add column if not exists anexos jsonb not null default '[]';

create table if not exists public.notas (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null references public.perfis(id) on delete cascade,
  titulo text not null default '',
  texto text not null default '',
  cor text,
  fixada boolean not null default false,
  arquivada boolean not null default false,
  itens jsonb not null default '[]',
  criado_em bigint not null,
  atualizado_em bigint not null
);
create index if not exists notas_dono_idx on public.notas(dono);
alter table public.notas enable row level security;
-- notas são pessoais: só a própria pessoa vê (nem o administrador)
drop policy if exists notas_proprias on public.notas;
create policy notas_proprias on public.notas for all to authenticated
  using (dono = (select auth.uid())) with check (dono = (select auth.uid()));
revoke all on public.notas from anon;
grant select, insert, update, delete on public.notas to authenticated;

-- atualização (andamento) registrada em todas as cópias de um compromisso compartilhado
create or replace function public.grupo_nota(g uuid, p_texto text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_nome text; v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if not public.no_grupo(g) then raise exception 'Você não participa deste compromisso.'; end if;
  if coalesce(trim(p_texto), '') = '' then return; end if;
  select nome into v_nome from public.perfis where id = auth.uid();
  update public.eventos e set atualizado_em = v_now,
    historico = e.historico || jsonb_build_array(jsonb_build_object('tipo','nota','em',v_now,'texto',trim(p_texto),'por',v_nome))
  where e.grupo = g;
end $$;

-- anexos também sincronizados entre as cópias
create or replace function public.grupo_anexos(g uuid, p_anexos jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.no_grupo(g) then raise exception 'Você não participa deste compromisso.'; end if;
  update public.eventos set anexos = coalesce(p_anexos, '[]'::jsonb), atualizado_em = (extract(epoch from now()) * 1000)::bigint where grupo = g;
end $$;

revoke all on function public.grupo_nota(uuid, text), public.grupo_anexos(uuid, jsonb) from public, anon;
grant execute on function public.grupo_nota(uuid, text), public.grupo_anexos(uuid, jsonb) to authenticated;
