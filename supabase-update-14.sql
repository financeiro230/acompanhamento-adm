-- ACOMPANHAMENTO ADM — atualização 14: chat, central de atualizações, passos atribuídos, membros vendo outros espaços, tempo real

-- ===================== membros podem ver (só ver) o espaço de outros membros =====================
-- perfis.ve: para administrador continua igual (null = todos); para membro, null = ninguém e a lista = quem ele pode ver
create or replace function public.pode_ver_membro(alvo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfis me join public.perfis t on t.id = alvo
    where me.id = auth.uid() and me.ativo and me.papel <> 'admin'
      and me.ve is not null and alvo = any(me.ve)
      and t.ativo and t.papel <> 'admin');
$$;
revoke all on function public.pode_ver_membro(uuid) from public, anon;
grant execute on function public.pode_ver_membro(uuid) to authenticated;

drop policy if exists perfis_ler_membro on public.perfis;
create policy perfis_ler_membro on public.perfis for select to authenticated using (public.pode_ver_membro(id));
drop policy if exists demandas_ler_membro on public.demandas;
create policy demandas_ler_membro on public.demandas for select to authenticated using (public.pode_ver_membro(dono));
drop policy if exists eventos_ler_membro on public.eventos;
create policy eventos_ler_membro on public.eventos for select to authenticated using (public.pode_ver_membro(dono));

-- ===================== central de atualizações =====================
create table if not exists public.notificacoes (
  id bigserial primary key,
  para uuid not null references public.perfis(id) on delete cascade,
  de uuid references public.perfis(id) on delete set null,
  tipo text not null,
  titulo text not null,
  corpo text,
  ref_tipo text,
  ref_id uuid,
  criado_em timestamptz not null default now(),
  lida_em timestamptz,
  push_em timestamptz
);
create index if not exists notificacoes_para_idx on public.notificacoes(para, lida_em);
alter table public.notificacoes enable row level security;
revoke all on public.notificacoes from anon;
grant select, delete on public.notificacoes to authenticated;
grant update (lida_em) on public.notificacoes to authenticated;
drop policy if exists notif_minhas on public.notificacoes;
create policy notif_minhas on public.notificacoes for select to authenticated using (para = (select auth.uid()));
drop policy if exists notif_ler on public.notificacoes;
create policy notif_ler on public.notificacoes for update to authenticated using (para = (select auth.uid())) with check (para = (select auth.uid()));
drop policy if exists notif_apagar on public.notificacoes;
create policy notif_apagar on public.notificacoes for delete to authenticated using (para = (select auth.uid()));

create or replace function public.notificar(p_para uuid, p_de uuid, p_tipo text, p_titulo text, p_corpo text, p_ref_tipo text, p_ref_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.notificacoes(para, de, tipo, titulo, corpo, ref_tipo, ref_id)
  select p_para, p_de, p_tipo, p_titulo, left(p_corpo, 400), p_ref_tipo, p_ref_id
  where p_para is not null and p_para is distinct from p_de
    and exists (select 1 from public.perfis where id = p_para and ativo);
$$;
revoke all on function public.notificar(uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.nome_de(p uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select nome from public.perfis where id = p), 'Alguém');
$$;
revoke all on function public.nome_de(uuid) from public, anon, authenticated;

-- responsáveis de passos do checklist: [{id, texto, resp:[uuid...]}]
create or replace function public.passos_novos(p_old jsonb, p_new jsonb)
returns table(pessoa uuid, passo text) language sql immutable set search_path = '' as $$
  select (r.v)::uuid, n.c->>'texto'
  from jsonb_array_elements(coalesce(p_new, '[]'::jsonb)) n(c)
  cross join lateral jsonb_array_elements_text(case when jsonb_typeof(n.c->'resp') = 'array' then n.c->'resp' else '[]'::jsonb end) r(v)
  where not exists (
    select 1 from jsonb_array_elements(coalesce(p_old, '[]'::jsonb)) o(c)
    where o.c->>'id' = n.c->>'id' and jsonb_typeof(o.c->'resp') = 'array' and (o.c->'resp') ? r.v);
$$;

create or replace function public.demandas_avisos() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_de uuid := coalesce(auth.uid(), new.criado_por); v_nome text := public.nome_de(v_de); x uuid; s record; n jsonb;
begin
  if tg_op = 'INSERT' then
    if new.dono is distinct from v_de then
      perform public.notificar(new.dono, v_de, 'demanda', '📋 Nova demanda para você', v_nome || ': ' || new.titulo, 'demanda', new.id);
    end if;
    foreach x in array coalesce(new.participantes, '{}') loop
      perform public.notificar(x, v_de, 'compartilhada', '👥 Demanda compartilhada com você', v_nome || ': ' || new.titulo, 'demanda', new.id);
    end loop;
  else
    if new.dono is distinct from old.dono then
      perform public.notificar(new.dono, v_de, 'demanda', '📋 Demanda passada para você', v_nome || ': ' || new.titulo, 'demanda', new.id);
    end if;
    foreach x in array coalesce(new.participantes, '{}') loop
      if not (x = any(coalesce(old.participantes, '{}'))) then
        perform public.notificar(x, v_de, 'compartilhada', '👥 Demanda compartilhada com você', v_nome || ': ' || new.titulo, 'demanda', new.id);
      end if;
    end loop;
    -- nova atualização registrada: avisa quem mais está na demanda
    if jsonb_typeof(new.historico) = 'array' and jsonb_typeof(old.historico) = 'array'
       and jsonb_array_length(new.historico) > jsonb_array_length(old.historico) then
      n := new.historico -> (jsonb_array_length(new.historico) - 1);
      if n->>'tipo' = 'nota' and (cardinality(coalesce(new.participantes, '{}')) > 0 or new.dono is distinct from v_de) then
        foreach x in array (array[new.dono] || coalesce(new.participantes, '{}')) loop
          perform public.notificar(x, v_de, 'atualizacao', '💬 ' || v_nome || ' atualizou "' || left(new.titulo, 60) || '"', n->>'texto', 'demanda', new.id);
        end loop;
      end if;
    end if;
  end if;
  for s in select * from public.passos_novos(case when tg_op = 'INSERT' then '[]'::jsonb else old.checklist end, new.checklist) loop
    perform public.notificar(s.pessoa, v_de, 'passo', '☑ Passo atribuído a você', s.passo || ' — em "' || new.titulo || '" (' || public.nome_de(new.dono) || ')', 'demanda', new.id);
  end loop;
  return null;
end $$;
drop trigger if exists demandas_avisos on public.demandas;
create trigger demandas_avisos after insert or update on public.demandas for each row execute function public.demandas_avisos();

create or replace function public.eventos_avisos() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_de uuid := coalesce(auth.uid(), new.criado_por); v_nome text := public.nome_de(v_de); s record; n jsonb; v_q text;
begin
  v_q := to_char(new.data, 'DD/MM') || coalesce(' às ' || to_char(new.hora_inicio, 'HH24:MI'), '');
  if tg_op = 'INSERT' then
    if new.dono is distinct from v_de then
      perform public.notificar(new.dono, v_de, 'agenda', case when new.tipo = 'missao' then '🎯 Nova missão para você' else '📅 Novo compromisso para você' end,
        v_nome || ': ' || new.titulo || ' (' || v_q || ')', 'evento', new.id);
    end if;
  else
    if jsonb_typeof(new.historico) = 'array' and jsonb_typeof(old.historico) = 'array'
       and jsonb_array_length(new.historico) > jsonb_array_length(old.historico) and new.dono is distinct from v_de then
      n := new.historico -> (jsonb_array_length(new.historico) - 1);
      if n->>'tipo' = 'nota' then
        perform public.notificar(new.dono, v_de, 'atualizacao', '💬 ' || v_nome || ' atualizou "' || left(new.titulo, 60) || '"', n->>'texto', 'evento', new.id);
      end if;
    end if;
  end if;
  for s in select * from public.passos_novos(case when tg_op = 'INSERT' then '[]'::jsonb else old.checklist end, new.checklist) loop
    perform public.notificar(s.pessoa, v_de, 'passo', '☑ Passo atribuído a você', s.passo || ' — em "' || new.titulo || '" (' || public.nome_de(new.dono) || ')', 'evento', new.id);
  end loop;
  return null;
end $$;
drop trigger if exists eventos_avisos on public.eventos;
create trigger eventos_avisos after insert or update on public.eventos for each row execute function public.eventos_avisos();

-- ===================== passos atribuídos a mim (em demandas/compromissos de outras pessoas) =====================
create or replace function public.meus_passos()
returns table(origem text, ref_id uuid, titulo text, dono uuid, dono_nome text, passo_id text, texto text, prazo date, feito boolean, data_ref date)
language sql stable security definer set search_path = '' as $$
  select 'demanda', d.id, d.titulo, d.dono, p.nome, c->>'id', c->>'texto', nullif(c->>'prazo','')::date, coalesce((c->>'feito')::boolean, false), d.prazo
  from public.demandas d join public.perfis p on p.id = d.dono
  cross join lateral jsonb_array_elements(case when jsonb_typeof(d.checklist) = 'array' then d.checklist else '[]'::jsonb end) c
  where d.status <> 'finalizado' and d.dono <> auth.uid()
    and jsonb_typeof(c->'resp') = 'array' and (c->'resp') ? auth.uid()::text
  union all
  select 'evento', e.id, e.titulo, e.dono, p.nome, c->>'id', c->>'texto', nullif(c->>'prazo','')::date, coalesce((c->>'feito')::boolean, false), e.data
  from public.eventos e join public.perfis p on p.id = e.dono
  cross join lateral jsonb_array_elements(case when jsonb_typeof(e.checklist) = 'array' then e.checklist else '[]'::jsonb end) c
  where e.dono <> auth.uid() and jsonb_typeof(c->'resp') = 'array' and (c->'resp') ? auth.uid()::text;
$$;
revoke all on function public.meus_passos() from public, anon;
grant execute on function public.meus_passos() to authenticated;

create or replace function public.passo_marcar(p_origem text, p_id uuid, p_passo text, p_feito boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ck jsonb; v_tit text; v_nome text := public.nome_de(auth.uid()); v_txt text; v_ok boolean := false; v_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if p_origem = 'demanda' then select checklist into v_ck from public.demandas where id = p_id;
  else select checklist into v_ck from public.eventos where id = p_id; end if;
  if v_ck is null then raise exception 'Item não encontrado.'; end if;
  select coalesce(jsonb_agg(case when c->>'id' = p_passo then
           (c || jsonb_build_object('feito', p_feito, 'feitoEm', case when p_feito then to_jsonb(v_ms) else 'null'::jsonb end, 'feitoPor', v_nome)) else c end order by o), '[]'::jsonb),
         bool_or(c->>'id' = p_passo and jsonb_typeof(c->'resp') = 'array' and (c->'resp') ? auth.uid()::text),
         max(case when c->>'id' = p_passo then c->>'texto' end)
    into v_ck, v_ok, v_txt
  from jsonb_array_elements(v_ck) with ordinality as t(c, o);
  if not coalesce(v_ok, false) then raise exception 'Este passo não está atribuído a você.'; end if;
  if p_origem = 'demanda' then
    update public.demandas set checklist = v_ck, atualizado_em = v_ms,
      historico = historico || jsonb_build_array(jsonb_build_object('tipo','check','em',v_ms,'por',v_nome,'texto', case when p_feito then 'Passo concluído: ' else 'Passo reaberto: ' end || v_txt))
    where id = p_id;
  else
    update public.eventos set checklist = v_ck, atualizado_em = v_ms,
      historico = historico || jsonb_build_array(jsonb_build_object('tipo','check','em',v_ms,'por',v_nome,'texto', case when p_feito then 'Passo concluído: ' else 'Passo reaberto: ' end || v_txt))
    where id = p_id;
  end if;
end $$;
revoke all on function public.passo_marcar(text, uuid, text, boolean) from public, anon;
grant execute on function public.passo_marcar(text, uuid, text, boolean) to authenticated;

-- ===================== chat =====================
create table if not exists public.chat_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa text not null,
  de uuid not null references public.perfis(id) on delete cascade,
  para uuid references public.perfis(id) on delete cascade,
  texto text not null check (length(texto) between 1 and 4000),
  criado_em timestamptz not null default now(),
  editado_em timestamptz
);
create index if not exists chat_conv_idx on public.chat_mensagens(conversa, criado_em desc);
alter table public.chat_mensagens enable row level security;
revoke all on public.chat_mensagens from anon;
grant select, insert, delete on public.chat_mensagens to authenticated;
grant update (texto, editado_em) on public.chat_mensagens to authenticated;

create or replace function public.chat_pode_ler(p_de uuid, p_para uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo) and (
    p_para is null or auth.uid() in (p_de, p_para)
    or (public.admin_total() and not exists (select 1 from public.perfis where id in (p_de, p_para) and papel = 'admin')));
$$;
revoke all on function public.chat_pode_ler(uuid, uuid) from public, anon;
grant execute on function public.chat_pode_ler(uuid, uuid) to authenticated;

drop policy if exists chat_ler on public.chat_mensagens;
create policy chat_ler on public.chat_mensagens for select to authenticated using (public.chat_pode_ler(de, para));
drop policy if exists chat_enviar on public.chat_mensagens;
create policy chat_enviar on public.chat_mensagens for insert to authenticated with check (
  de = (select auth.uid())
  and exists (select 1 from public.perfis where id = (select auth.uid()) and ativo)
  and conversa = case when para is null then 'geral' else 'dm:' || least(de::text, para::text) || ':' || greatest(de::text, para::text) end);
drop policy if exists chat_editar on public.chat_mensagens;
create policy chat_editar on public.chat_mensagens for update to authenticated using (de = (select auth.uid())) with check (de = (select auth.uid()));
drop policy if exists chat_apagar on public.chat_mensagens;
create policy chat_apagar on public.chat_mensagens for delete to authenticated using (de = (select auth.uid()));

create table if not exists public.chat_lidos (
  dono uuid not null references public.perfis(id) on delete cascade,
  conversa text not null,
  ate timestamptz not null default now(),
  primary key (dono, conversa)
);
alter table public.chat_lidos enable row level security;
revoke all on public.chat_lidos from anon;
grant select, insert, update, delete on public.chat_lidos to authenticated;
drop policy if exists chat_lidos_meus on public.chat_lidos;
create policy chat_lidos_meus on public.chat_lidos for all to authenticated using (dono = (select auth.uid())) with check (dono = (select auth.uid()));

-- ===================== tempo real =====================
do $$
declare t text;
begin
  foreach t in array array['demandas','eventos','notas','notificacoes','chat_mensagens'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
