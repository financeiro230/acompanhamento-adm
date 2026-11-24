-- ACOMPANHAMENTO ADM — atualização 12: corrige "concluidas" gravado como objeto ao incluir pessoa num compromisso
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
        false, null, '[]'::jsonb, jsonb_build_array(jsonb_build_object('tipo','criado','em',v_now,'texto','Atribuído por ' || coalesce(v_nome,''),'por',v_nome)),
        v_now, v_now, coalesce(e.criado_por, auth.uid()), e.rec_dias, e.rec_datas, g, e.conclusao_conjunta, e.checklist, e.meet_link, null, e.anexos, false, e.prioridade
      from public.eventos e where e.grupo = g order by e.criado_em limit 1;
    end if;
  end loop;
  select count(*) into n from public.eventos where grupo = g;
  if n = 1 then update public.eventos set grupo = null where grupo = g; end if;
  return n;
end $$;

-- conserta os registros afetados
update public.eventos set concluidas = '[]'::jsonb where jsonb_typeof(concluidas) <> 'array';
update public.eventos set rec_dias = '[]'::jsonb where rec_dias is null or jsonb_typeof(rec_dias) <> 'array';
update public.eventos set rec_datas = '[]'::jsonb where rec_datas is null or jsonb_typeof(rec_datas) <> 'array';

-- proteção: listas sempre gravadas como lista
create or replace function public.eventos_listas() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.concluidas is null or jsonb_typeof(new.concluidas) <> 'array' then new.concluidas := '[]'::jsonb; end if;
  if new.checklist is null or jsonb_typeof(new.checklist) <> 'array' then new.checklist := '[]'::jsonb; end if;
  if new.historico is null or jsonb_typeof(new.historico) <> 'array' then new.historico := '[]'::jsonb; end if;
  if new.anexos is null or jsonb_typeof(new.anexos) <> 'array' then new.anexos := '[]'::jsonb; end if;
  if new.rec_dias is not null and jsonb_typeof(new.rec_dias) <> 'array' then new.rec_dias := '[]'::jsonb; end if;
  if new.rec_datas is not null and jsonb_typeof(new.rec_datas) <> 'array' then new.rec_datas := '[]'::jsonb; end if;
  return new;
end $$;
drop trigger if exists eventos_listas on public.eventos;
create trigger eventos_listas before insert or update on public.eventos for each row execute function public.eventos_listas();
