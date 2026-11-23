-- ACOMPANHAMENTO ADM — atualização 8: pessoas do compromisso, prioridade na agenda, marcadores nas notas,
-- demandas compartilhadas, contatos, pastas compartilhadas e módulos por pessoa
alter table public.eventos  add column if not exists prioridade text not null default 'media';
alter table public.notas    add column if not exists marcadores jsonb not null default '[]';
alter table public.demandas add column if not exists participantes uuid[] not null default '{}';
alter table public.perfis   add column if not exists modulos text[];          -- nulo = todos os módulos

-- nomes da equipe (para compartilhar) — só nome e cor
create or replace function public.equipe_nomes()
returns table(id uuid, nome text, cor text) language sql stable security definer set search_path = '' as $$
  select p.id, p.nome, p.cor from public.perfis p where p.ativo and auth.uid() is not null order by p.nome;
$$;

-- ===== demandas compartilhadas: quem participa vê e altera (não exclui, não muda dono nem participantes)
drop policy if exists demandas_compart_sel on public.demandas;
create policy demandas_compart_sel on public.demandas for select to authenticated using ((select auth.uid()) = any(participantes));
drop policy if exists demandas_compart_upd on public.demandas;
create policy demandas_compart_upd on public.demandas for update to authenticated
  using ((select auth.uid()) = any(participantes)) with check ((select auth.uid()) = any(participantes) or public.pode_ver(dono));
create or replace function public.demandas_protege() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode_ver(old.dono) then new.dono := old.dono; new.participantes := old.participantes; new.criado_por := old.criado_por; end if;
  return new;
end $$;
drop trigger if exists demandas_protege on public.demandas;
create trigger demandas_protege before update on public.demandas for each row execute function public.demandas_protege();

-- ===== trocar / tirar / incluir pessoas num compromisso sem excluir
create or replace function public.evento_pessoas(p_id uuid, p_donos uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare ev public.eventos; g uuid; n int; v_now bigint := (extract(epoch from now()) * 1000)::bigint; v_nome text; d uuid;
begin
  select * into ev from public.eventos where id = p_id;
  if ev.id is null then raise exception 'Compromisso não encontrado.'; end if;
  if not (ev.dono = auth.uid() or ev.criado_por = auth.uid() or public.pode_ver(ev.dono) or (ev.grupo is not null and public.no_grupo(ev.grupo))) then
    raise exception 'Você não tem acesso a este compromisso.'; end if;
  p_donos := array(select distinct x from unnest(p_donos) x where x is not null);
  if coalesce(array_length(p_donos, 1), 0) = 0 then raise exception 'Escolha pelo menos uma pessoa.'; end if;
  if ev.pessoal and (array_length(p_donos,1) > 1 or p_donos[1] <> ev.dono) then raise exception 'Compromisso pessoal não pode ser passado para outras pessoas.'; end if;
  if not (public.is_admin() or public.pode_atribuir() or p_donos = array[auth.uid()]) then
    raise exception 'Você não tem permissão para atribuir compromissos a outras pessoas.'; end if;
  if exists (select 1 from unnest(p_donos) x where not exists (select 1 from public.perfis where id = x and ativo)) then
    raise exception 'Pessoa inválida ou desativada.'; end if;
  select nome into v_nome from public.perfis where id = auth.uid();
  g := coalesce(ev.grupo, gen_random_uuid());
  update public.eventos set grupo = g where id = ev.id and grupo is null;
  -- tira quem saiu
  delete from public.eventos where grupo = g and not (dono = any(p_donos));
  -- inclui quem entrou (cópia do compromisso)
  foreach d in array p_donos loop
    if not exists (select 1 from public.eventos where grupo = g and dono = d) then
      insert into public.eventos (id, dono, tipo, titulo, descricao, data, data_fim, hora_inicio, hora_fim, local, cor, recorrencia, recorrencia_ate,
        concluida, concluida_em, concluidas, historico, criado_em, atualizado_em, criado_por, rec_dias, rec_datas, grupo, conclusao_conjunta,
        checklist, meet_link, google_id, anexos, pessoal, prioridade)
      select gen_random_uuid(), d, e.tipo, e.titulo, e.descricao, e.data, e.data_fim, e.hora_inicio, e.hora_fim, e.local, e.cor, e.recorrencia, e.recorrencia_ate,
        false, null, '{}', jsonb_build_array(jsonb_build_object('tipo','criado','em',v_now,'texto','Atribuído por ' || coalesce(v_nome,''),'por',v_nome)),
        v_now, v_now, coalesce(e.criado_por, auth.uid()), e.rec_dias, e.rec_datas, g, e.conclusao_conjunta, e.checklist, e.meet_link, null, e.anexos, false, e.prioridade
      from public.eventos e where e.grupo = g order by e.criado_em limit 1;
    end if;
  end loop;
  select count(*) into n from public.eventos where grupo = g;
  if n = 1 then update public.eventos set grupo = null where grupo = g; end if;
  return n;
end $$;

-- ===== editar / excluir atualização em compromisso compartilhado (todas as cópias)
create or replace function public.grupo_nota_editar(g uuid, p_em bigint, p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.no_grupo(g) then raise exception 'Você não participa deste compromisso.'; end if;
  update public.eventos e set atualizado_em = (extract(epoch from now()) * 1000)::bigint,
    historico = coalesce((select jsonb_agg(case when (h->>'tipo') = 'nota' and (h->>'em')::bigint = p_em
                     then h || jsonb_build_object('texto', p_texto, 'editadoEm', (extract(epoch from now()) * 1000)::bigint) else h end order by o)
                 from jsonb_array_elements(e.historico) with ordinality as t(h, o)
                 where not ((h->>'tipo') = 'nota' and (h->>'em')::bigint = p_em and p_texto is null)), '[]'::jsonb)
  where e.grupo = g;
end $$;

-- ===== contatos
create table if not exists public.contatos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null references public.perfis(id) on delete cascade,
  nome text not null, empresa text not null default '', cargo text not null default '',
  telefone text not null default '', whatsapp text not null default '', email text not null default '',
  obs text not null default '', marcadores jsonb not null default '[]', compartilhado boolean not null default true,
  criado_em bigint not null, atualizado_em bigint not null
);
create index if not exists contatos_dono_idx on public.contatos(dono);
alter table public.contatos enable row level security;
drop policy if exists contatos_ler on public.contatos;
create policy contatos_ler on public.contatos for select to authenticated
  using (dono = (select auth.uid()) or (compartilhado and exists (select 1 from public.perfis where id = (select auth.uid()) and ativo)) or public.pode_ver(dono));
drop policy if exists contatos_gravar on public.contatos;
create policy contatos_gravar on public.contatos for all to authenticated
  using (dono = (select auth.uid()) or public.pode_ver(dono)) with check (dono = (select auth.uid()) or public.pode_ver(dono));
revoke all on public.contatos from anon;
grant select, insert, update, delete on public.contatos to authenticated;

-- ===== pastas do Drive compartilhadas com a equipe
create table if not exists public.pastas_compartilhadas (
  id text primary key,                      -- id da pasta no Google Drive
  dono uuid not null references public.perfis(id) on delete cascade,
  nome text not null, link text not null, membros uuid[] not null default '{}',
  criado_em bigint not null, atualizado_em bigint not null
);
alter table public.pastas_compartilhadas enable row level security;
drop policy if exists pastas_ler on public.pastas_compartilhadas;
create policy pastas_ler on public.pastas_compartilhadas for select to authenticated
  using (dono = (select auth.uid()) or (select auth.uid()) = any(membros));
drop policy if exists pastas_gravar on public.pastas_compartilhadas;
create policy pastas_gravar on public.pastas_compartilhadas for all to authenticated
  using (dono = (select auth.uid())) with check (dono = (select auth.uid()));
revoke all on public.pastas_compartilhadas from anon;
grant select, insert, update, delete on public.pastas_compartilhadas to authenticated;

-- ===== módulos (abas) que cada pessoa usa
create or replace function public.admin_definir_modulos(p_id uuid, p_mods text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() or not public.pode_ver_base(p_id) then raise exception 'Você não tem acesso a esta pessoa.'; end if;
  if exists (select 1 from public.perfis where id = p_id and papel = 'admin') and not public.admin_total() and p_id <> auth.uid() then
    raise exception 'Só o ADM master muda os módulos de outro administrador.'; end if;
  update public.perfis set modulos = p_mods where id = p_id;
end $$;

revoke all on function public.equipe_nomes(), public.evento_pessoas(uuid, uuid[]), public.grupo_nota_editar(uuid, bigint, text),
  public.admin_definir_modulos(uuid, text[]) from public, anon;
grant execute on function public.equipe_nomes(), public.evento_pessoas(uuid, uuid[]), public.grupo_nota_editar(uuid, bigint, text),
  public.admin_definir_modulos(uuid, text[]) to authenticated;
