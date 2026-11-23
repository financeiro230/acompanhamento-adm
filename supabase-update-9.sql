-- ACOMPANHAMENTO ADM — atualização 9: prioridade opcional e igual para todos, contatos por pessoa
alter table public.eventos alter column prioridade drop not null;
alter table public.eventos alter column prioridade drop default;
update public.eventos set prioridade = null where prioridade = 'media' or prioridade = '';

create or replace function public.grupo_sync(g uuid, c jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_nome text;
begin
  if not public.no_grupo(g) then raise exception 'Você não participa deste compromisso.'; end if;
  select nome into v_nome from public.perfis where id = auth.uid();
  update public.eventos e set
    titulo = coalesce(c->>'titulo', e.titulo),
    descricao = coalesce(c->>'descricao', e.descricao),
    tipo = coalesce(c->>'tipo', e.tipo),
    data = coalesce((c->>'data')::date, e.data),
    data_fim = case when c ? 'data_fim' then (c->>'data_fim')::date else e.data_fim end,
    hora_inicio = case when c ? 'hora_inicio' then (c->>'hora_inicio')::time else e.hora_inicio end,
    hora_fim = case when c ? 'hora_fim' then (c->>'hora_fim')::time else e.hora_fim end,
    local = coalesce(c->>'local', e.local),
    recorrencia = coalesce(c->>'recorrencia', e.recorrencia),
    recorrencia_ate = case when c ? 'recorrencia_ate' then (c->>'recorrencia_ate')::date else e.recorrencia_ate end,
    rec_dias = coalesce(c->'rec_dias', e.rec_dias),
    rec_datas = coalesce(c->'rec_datas', e.rec_datas),
    conclusao_conjunta = coalesce((c->>'conclusao_conjunta')::boolean, e.conclusao_conjunta),
    checklist = coalesce(c->'checklist', e.checklist),
    prioridade = case when c ? 'prioridade' then nullif(c->>'prioridade','') else e.prioridade end,
    meet_link = case when c ? 'meet_link' then c->>'meet_link' else e.meet_link end,
    google_id = case when c ? 'google_id' then c->>'google_id' else e.google_id end,
    atualizado_em = (extract(epoch from now()) * 1000)::bigint,
    historico = case when c ? 'nota' then e.historico || jsonb_build_array(jsonb_build_object('tipo','edicao','em',(extract(epoch from now())*1000)::bigint,'texto',c->>'nota','por',v_nome)) else e.historico end
  where e.grupo = g;
end $$;

alter table public.contatos add column if not exists membros uuid[] not null default '{}';
drop policy if exists contatos_ler on public.contatos;
create policy contatos_ler on public.contatos for select to authenticated
  using (dono = (select auth.uid()) or public.pode_ver(dono)
    or (compartilhado and exists (select 1 from public.perfis where id = (select auth.uid()) and ativo)
        and (cardinality(membros) = 0 or (select auth.uid()) = any(membros))));
