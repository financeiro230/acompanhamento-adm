-- =====================================================================
--  ACOMPANHAMENTO ADM — Agenda / Kanban
--  Script de criação do banco de dados (Supabase)
--
--  ANTES DE RODAR: troque a senha na linha marcada com  >>>  (procure por TROQUE_AQUI)
--  Depois cole TUDO no SQL Editor do Supabase e clique em RUN.
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- TABELAS ----------
create table if not exists public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  usuario    text unique not null,
  nome       text not null,
  papel      text not null default 'membro' check (papel in ('admin','membro')),
  cor        text not null default '#2f5bea',
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table if not exists public.demandas (
  id            uuid primary key default gen_random_uuid(),
  dono          uuid not null references public.perfis(id) on delete cascade,
  titulo        text not null,
  descricao     text not null default '',
  status        text not null default 'pendente',
  prioridade    text not null default 'normal',
  prazo         date,
  checklist     jsonb not null default '[]',
  historico     jsonb not null default '[]',
  criado_em     bigint not null,
  atualizado_em bigint not null,
  finalizado_em bigint,
  criado_por    uuid references public.perfis(id) on delete set null
);
create index if not exists demandas_dono_idx on public.demandas(dono);

create table if not exists public.eventos (
  id               uuid primary key default gen_random_uuid(),
  dono             uuid not null references public.perfis(id) on delete cascade,
  tipo             text not null default 'evento' check (tipo in ('evento','missao')),
  titulo           text not null,
  descricao        text not null default '',
  data             date not null,
  data_fim         date,
  hora_inicio      time,
  hora_fim         time,
  local            text not null default '',
  cor              text,
  recorrencia      text not null default 'nenhuma' check (recorrencia in ('nenhuma','diaria','dias_uteis','semanal','mensal','anual')),
  recorrencia_ate  date,
  concluida        boolean not null default false,
  concluida_em     bigint,
  concluidas       jsonb not null default '[]',
  historico        jsonb not null default '[]',
  criado_em        bigint not null,
  atualizado_em    bigint not null,
  criado_por       uuid references public.perfis(id) on delete set null
);
create index if not exists eventos_dono_idx on public.eventos(dono);

-- ---------- QUEM É ADMIN ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'admin' and ativo);
$$;

-- ---------- SEGURANÇA (cada um vê só o seu; admin vê tudo) ----------
alter table public.perfis   enable row level security;
alter table public.demandas enable row level security;
alter table public.eventos  enable row level security;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

drop policy if exists demandas_tudo on public.demandas;
create policy demandas_tudo on public.demandas for all to authenticated
  using (dono = (select auth.uid()) or public.is_admin())
  with check (dono = (select auth.uid()) or public.is_admin());

drop policy if exists eventos_tudo on public.eventos;
create policy eventos_tudo on public.eventos for all to authenticated
  using (dono = (select auth.uid()) or public.is_admin())
  with check (dono = (select auth.uid()) or public.is_admin());

revoke all on public.perfis, public.demandas, public.eventos from anon;
grant select on public.perfis to authenticated;
grant select, insert, update, delete on public.demandas, public.eventos to authenticated;

-- ---------- CRIAÇÃO DE USUÁRIOS (sem e-mail: usuário + senha) ----------
create or replace function public._criar_usuario(p_usuario text, p_senha text, p_nome text, p_papel text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text;
begin
  p_usuario := lower(trim(p_usuario));
  if p_usuario !~ '^[a-z0-9._-]{2,30}$' then
    raise exception 'Usuário inválido: use só letras minúsculas, números, ponto ou traço, sem espaço.';
  end if;
  if length(coalesce(p_senha,'')) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.';
  end if;
  if exists (select 1 from public.perfis where usuario = p_usuario) then
    raise exception 'Já existe um usuário "%".', p_usuario;
  end if;
  v_email := p_usuario || '@usuarios.central-unigames.com';

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('nome', p_nome), now(), now(),
    '', '', '', '', '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now());

  insert into public.perfis (id, usuario, nome, papel) values (v_id, p_usuario, trim(p_nome), p_papel);
  return v_id;
end $$;
revoke all on function public._criar_usuario(text,text,text,text) from public, anon, authenticated;

create or replace function public.admin_criar_usuario(p_usuario text, p_senha text, p_nome text, p_papel text default 'membro')
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Apenas o administrador pode criar usuários.'; end if;
  if p_papel not in ('admin','membro') then raise exception 'Papel inválido.'; end if;
  return public._criar_usuario(p_usuario, p_senha, p_nome, p_papel);
end $$;

create or replace function public.admin_trocar_senha(p_id uuid, p_senha text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Apenas o administrador pode trocar senhas de outros usuários.'; end if;
  if length(coalesce(p_senha,'')) < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')), updated_at = now()
   where id = p_id;
end $$;

create or replace function public.admin_atualizar_perfil(p_id uuid, p_nome text, p_papel text, p_ativo boolean, p_cor text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Apenas o administrador pode alterar perfis.'; end if;
  if p_id = auth.uid() and (p_papel <> 'admin' or not p_ativo) then
    raise exception 'Você não pode tirar o seu próprio acesso de administrador.';
  end if;
  update public.perfis set nome = trim(p_nome), papel = p_papel, ativo = p_ativo, cor = coalesce(p_cor, cor) where id = p_id;
  update auth.users set banned_until = case when p_ativo then null else 'infinity'::timestamptz end where id = p_id;
end $$;

create or replace function public.admin_excluir_usuario(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Apenas o administrador pode excluir usuários.'; end if;
  if p_id = auth.uid() then raise exception 'Você não pode excluir a si mesmo.'; end if;
  delete from auth.users where id = p_id;
end $$;

revoke all on function public.admin_criar_usuario(text,text,text,text), public.admin_trocar_senha(uuid,text),
  public.admin_atualizar_perfil(uuid,text,text,boolean,text), public.admin_excluir_usuario(uuid) from public, anon;
grant execute on function public.admin_criar_usuario(text,text,text,text), public.admin_trocar_senha(uuid,text),
  public.admin_atualizar_perfil(uuid,text,text,boolean,text), public.admin_excluir_usuario(uuid), public.is_admin() to authenticated;

-- (bloco de criação do administrador e migração removido da versão pública)
