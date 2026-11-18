-- ACOMPANHAMENTO ADM — atualização 4: repetição personalizada, missões compartilhadas, checklist/Meet em eventos, e-mail Google
alter table public.eventos drop constraint if exists eventos_recorrencia_check;
alter table public.eventos add constraint eventos_recorrencia_check
  check (recorrencia in ('nenhuma','diaria','dias_uteis','semanal','mensal','anual','dias_semana','datas'));
alter table public.eventos add column if not exists rec_dias jsonb not null default '[]';
alter table public.eventos add column if not exists rec_datas jsonb not null default '[]';
alter table public.eventos add column if not exists grupo uuid;
alter table public.eventos add column if not exists conclusao_conjunta boolean not null default false;
alter table public.eventos add column if not exists checklist jsonb not null default '[]';
alter table public.eventos add column if not exists meet_link text;
alter table public.eventos add column if not exists google_id text;
create index if not exists eventos_grupo_idx on public.eventos(grupo);
alter table public.perfis add column if not exists google_email text;

-- quem participa de um grupo (dono de uma cópia, quem criou, ou admin)
create or replace function public.no_grupo(g uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select g is not null and (public.is_admin() or exists (
    select 1 from public.eventos e where e.grupo = g and (e.dono = auth.uid() or e.criado_por = auth.uid())));
$$;

create or replace function public.grupo_participantes(g uuid)
returns table(id uuid, dono uuid, nome text, cor text, concluida boolean, concluida_em bigint, concluidas jsonb)
language sql stable security definer set search_path = '' as $$
  select e.id, e.dono, p.nome, p.cor, e.concluida, e.concluida_em, e.concluidas
  from public.eventos e join public.perfis p on p.id = e.dono
  where e.grupo = g and public.no_grupo(g) order by p.nome;
$$;

-- aplica a todas as cópias os campos em comum (título, datas, horário, repetição, checklist, Meet…)
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
    meet_link = case when c ? 'meet_link' then c->>'meet_link' else e.meet_link end,
    google_id = case when c ? 'google_id' then c->>'google_id' else e.google_id end,
    atualizado_em = (extract(epoch from now()) * 1000)::bigint,
    historico = case when c ? 'nota' then e.historico || jsonb_build_array(jsonb_build_object('tipo','edicao','em',(extract(epoch from now())*1000)::bigint,'texto',c->>'nota','por',v_nome)) else e.historico end
  where e.grupo = g;
end $$;

-- conclusão em conjunto: marca/desmarca para todos
create or replace function public.grupo_concluir(g uuid, p_data date, p_feito boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_nome text; v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if not public.no_grupo(g) then raise exception 'Você não participa deste compromisso.'; end if;
  select nome into v_nome from public.perfis where id = auth.uid();
  update public.eventos e set
    concluida = case when e.recorrencia = 'nenhuma' then p_feito else e.concluida end,
    concluida_em = case when e.recorrencia = 'nenhuma' then (case when p_feito then v_now else null end) else e.concluida_em end,
    concluidas = case when e.recorrencia = 'nenhuma' then e.concluidas
      when p_feito then (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements_text(e.concluidas || to_jsonb(p_data::text)) x)
      else (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements_text(e.concluidas) x where x <> p_data::text) end,
    atualizado_em = v_now,
    historico = e.historico || jsonb_build_array(jsonb_build_object('tipo', case when p_feito then 'final' else 'status' end, 'em', v_now,
      'texto', (case when p_feito then 'Concluída para todos' else 'Reaberta para todos' end) || case when e.recorrencia <> 'nenhuma' then ' (' || to_char(p_data,'DD/MM') || ')' else '' end, 'por', v_nome))
  where e.grupo = g;
end $$;

create or replace function public.grupo_excluir(g uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.no_grupo(g) then raise exception 'Você não participa deste compromisso.'; end if;
  delete from public.eventos where grupo = g;
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.salvar_google_email(p text)
returns void language sql security definer set search_path = '' as $$
  update public.perfis set google_email = nullif(lower(trim(p)), '') where id = auth.uid();
$$;

create or replace function public.admin_definir_google_email(p_id uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Apenas o administrador pode alterar.'; end if;
  update public.perfis set google_email = nullif(lower(trim(p_email)), '') where id = p_id;
end $$;

-- lista da equipe com e-mail Google (para ver agendas uns dos outros, conforme o compartilhamento do Google)
create or replace function public.equipe_google()
returns table(id uuid, nome text, cor text, google_email text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nome, p.cor, p.google_email from public.perfis p
  where p.ativo and p.google_email is not null and auth.uid() is not null order by p.nome;
$$;

revoke all on function public.no_grupo(uuid), public.grupo_participantes(uuid), public.grupo_sync(uuid,jsonb), public.grupo_concluir(uuid,date,boolean),
  public.grupo_excluir(uuid), public.salvar_google_email(text), public.admin_definir_google_email(uuid,text), public.equipe_google() from public, anon;
grant execute on function public.no_grupo(uuid), public.grupo_participantes(uuid), public.grupo_sync(uuid,jsonb), public.grupo_concluir(uuid,date,boolean),
  public.grupo_excluir(uuid), public.salvar_google_email(text), public.admin_definir_google_email(uuid,text), public.equipe_google() to authenticated;
