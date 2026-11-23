-- ACOMPANHAMENTO ADM — atualização 7: ADM master, espaço de outro administrador só com a senha dele, opção "não ver ninguém"
alter table public.perfis add column if not exists master boolean not null default false;
update public.perfis set master = true where usuario = 'adm';

create table if not exists public.acesso_liberado (
  quem uuid not null references public.perfis(id) on delete cascade,
  alvo uuid not null references public.perfis(id) on delete cascade,
  ate  timestamptz not null,
  primary key (quem, alvo)
);
alter table public.acesso_liberado enable row level security;
revoke all on public.acesso_liberado from anon, authenticated;

-- regra base (quem a pessoa pode enxergar na equipe)
create or replace function public.pode_ver_base(alvo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select alvo = auth.uid() or exists (
    select 1 from public.perfis me join public.perfis t on t.id = alvo
    where me.id = auth.uid() and me.papel = 'admin' and me.ativo
      and (me.ve is null or alvo = any(me.ve))
      and not (auth.uid() = any(t.ocultar_de)));
$$;
-- dados (agenda/kanban): o espaço de outro administrador só abre depois de digitar a senha dele
create or replace function public.pode_ver(alvo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select alvo = auth.uid() or (public.pode_ver_base(alvo) and (
    not exists (select 1 from public.perfis where id = alvo and papel = 'admin')
    or exists (select 1 from public.acesso_liberado l where l.quem = auth.uid() and l.alvo = pode_ver.alvo and l.ate > now())));
$$;
create or replace function public.admin_total() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'admin' and ativo and master);
$$;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated using (public.pode_ver_base(id));

create or replace function public.liberar_espaco(p_alvo uuid, p_senha text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  if not public.pode_ver_base(p_alvo) or p_alvo = auth.uid() then return false; end if;
  select encrypted_password into v_hash from auth.users where id = p_alvo;
  if v_hash is null or extensions.crypt(coalesce(p_senha, ''), v_hash) <> v_hash then
    perform pg_sleep(1); return false;
  end if;
  insert into public.acesso_liberado (quem, alvo, ate) values (auth.uid(), p_alvo, now() + interval '2 hours')
  on conflict (quem, alvo) do update set ate = excluded.ate;
  return true;
end $$;
create or replace function public.espaco_liberado(p_alvo uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.pode_ver(p_alvo); $$;
create or replace function public.travar_espacos() returns void
language sql security definer set search_path = '' as $$ delete from public.acesso_liberado where quem = auth.uid(); $$;

-- administração: usa a regra base; senha de outro administrador só o ADM master troca
create or replace function public.admin_trocar_senha(p_id uuid, p_senha text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() or not public.pode_ver_base(p_id) then raise exception 'Você não tem acesso a esta pessoa.'; end if;
  if p_id <> auth.uid() and exists (select 1 from public.perfis where id = p_id and papel = 'admin') and not public.admin_total() then
    raise exception 'A senha de outro administrador só pode ser trocada por ele mesmo ou pelo ADM master.';
  end if;
  if length(coalesce(p_senha,'')) < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')), updated_at = now() where id = p_id;
end $$;

create or replace function public.admin_atualizar_perfil(p_id uuid, p_nome text, p_papel text, p_ativo boolean, p_cor text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() or not public.pode_ver_base(p_id) then raise exception 'Você não tem acesso a esta pessoa.'; end if;
  if p_id = auth.uid() and (p_papel <> 'admin' or not p_ativo) then
    raise exception 'Você não pode tirar o seu próprio acesso de administrador.';
  end if;
  if exists (select 1 from public.perfis where id = p_id and master) and (p_papel <> 'admin' or not p_ativo) then
    raise exception 'O ADM master não pode deixar de ser administrador.';
  end if;
  if p_papel = 'admin' and not public.admin_total() and (select papel from public.perfis where id = p_id) <> 'admin' then
    raise exception 'Só o ADM master pode tornar alguém administrador.';
  end if;
  update public.perfis set nome = trim(p_nome), papel = p_papel, ativo = p_ativo, cor = coalesce(p_cor, cor) where id = p_id;
  update auth.users set banned_until = case when p_ativo then null else 'infinity'::timestamptz end where id = p_id;
end $$;

create or replace function public.admin_criar_usuario(p_usuario text, p_senha text, p_nome text, p_papel text default 'membro')
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Apenas o administrador pode criar usuários.'; end if;
  if p_papel not in ('admin','membro') then raise exception 'Papel inválido.'; end if;
  if p_papel = 'admin' and not public.admin_total() then raise exception 'Só o ADM master pode criar administradores.'; end if;
  return public._criar_usuario(p_usuario, p_senha, p_nome, p_papel);
end $$;

create or replace function public.admin_excluir_usuario(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() or not public.pode_ver_base(p_id) then raise exception 'Você não tem acesso a esta pessoa.'; end if;
  if p_id = auth.uid() then raise exception 'Você não pode excluir a si mesmo.'; end if;
  if exists (select 1 from public.perfis where id = p_id and (master or papel = 'admin')) and not public.admin_total() then
    raise exception 'Só o ADM master pode excluir um administrador.';
  end if;
  if exists (select 1 from public.perfis where id = p_id and master) then raise exception 'O ADM master não pode ser excluído.'; end if;
  delete from auth.users where id = p_id;
end $$;

create or replace function public.admin_definir_atribuir(p_id uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() or not public.pode_ver_base(p_id) then raise exception 'Você não tem acesso a esta pessoa.'; end if;
  update public.perfis set pode_atribuir = coalesce(p_valor, false) where id = p_id;
end $$;

create or replace function public.admin_definir_google_email(p_id uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() or not public.pode_ver_base(p_id) then raise exception 'Você não tem acesso a esta pessoa.'; end if;
  update public.perfis set google_email = nullif(lower(trim(p_email)), '') where id = p_id;
end $$;

create or replace function public.admin_definir_acesso(p_id uuid, p_ve uuid[], p_ocultar uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.admin_total() then raise exception 'Só o ADM master pode mudar quem vê quem.'; end if;
  if p_id = auth.uid() and p_ve is not null then raise exception 'Você não pode limitar o seu próprio acesso.'; end if;
  if auth.uid() = any(coalesce(p_ocultar, '{}')) and p_id <> auth.uid() then
    raise exception 'Você não pode esconder de si mesmo o espaço de outra pessoa.';
  end if;
  update public.perfis set ve = p_ve, ocultar_de = coalesce(p_ocultar, '{}') where id = p_id;
end $$;

revoke all on function public.pode_ver_base(uuid), public.liberar_espaco(uuid, text), public.espaco_liberado(uuid), public.travar_espacos() from public, anon;
grant execute on function public.pode_ver_base(uuid), public.liberar_espaco(uuid, text), public.espaco_liberado(uuid), public.travar_espacos() to authenticated;
