-- ACOMPANHAMENTO ADM — atualização 6: limites de visualização entre administradores e compromissos pessoais
alter table public.perfis add column if not exists ve uuid[];                                   -- só para admin: espaços que pode ver (vazio/nulo = todos)
alter table public.perfis add column if not exists ocultar_de uuid[] not null default '{}';     -- administradores que NÃO podem ver este espaço
alter table public.eventos add column if not exists pessoal boolean not null default false;     -- compromisso pessoal: só o dono vê

-- pode ver o espaço de "alvo"?
create or replace function public.pode_ver(alvo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select alvo = auth.uid() or exists (
    select 1 from public.perfis me join public.perfis t on t.id = alvo
    where me.id = auth.uid() and me.papel = 'admin' and me.ativo
      and (me.ve is null or alvo = any(me.ve))
      and not (auth.uid() = any(t.ocultar_de)));
$$;
-- administrador sem limite (pode configurar acessos)
create or replace function public.admin_total() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'admin' and ativo and ve is null);
$$;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated using (public.pode_ver(id));

drop policy if exists demandas_tudo on public.demandas;
create policy demandas_tudo on public.demandas for all to authenticated
  using (public.pode_ver(dono)) with check (public.pode_ver(dono));

drop policy if exists eventos_tudo on public.eventos;
create policy eventos_tudo on public.eventos for all to authenticated
  using (dono = (select auth.uid()) or (public.pode_ver(dono) and not pessoal))
  with check (dono = (select auth.uid()) or (public.pode_ver(dono) and not pessoal));

drop policy if exists eventos_atribuidas_sel on public.eventos;
create policy eventos_atribuidas_sel on public.eventos for select to authenticated
  using (criado_por = (select auth.uid()) and not pessoal);

create or replace function public.contar_por_status()
returns table(status text, total bigint) language sql stable security definer set search_path = '' as $$
  select d.status, count(*) from public.demandas d where public.is_admin() and public.pode_ver(d.dono) group by d.status;
$$;

-- funções de administração respeitam os limites
create or replace function public.admin_trocar_senha(p_id uuid, p_senha text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() or not public.pode_ver(p_id) then raise exception 'Você não tem acesso a esta pessoa.'; end if;
  if length(coalesce(p_senha,'')) < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')), updated_at = now() where id = p_id;
end $$;

create or replace function public.admin_atualizar_perfil(p_id uuid, p_nome text, p_papel text, p_ativo boolean, p_cor text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() or not public.pode_ver(p_id) then raise exception 'Você não tem acesso a esta pessoa.'; end if;
  if p_id = auth.uid() and (p_papel <> 'admin' or not p_ativo) then
    raise exception 'Você não pode tirar o seu próprio acesso de administrador.';
  end if;
  if p_papel = 'admin' and not public.admin_total() and (select papel from public.perfis where id = p_id) <> 'admin' then
    raise exception 'Só um administrador sem limites pode tornar alguém administrador.';
  end if;
  update public.perfis set nome = trim(p_nome), papel = p_papel, ativo = p_ativo, cor = coalesce(p_cor, cor) where id = p_id;
  update auth.users set banned_until = case when p_ativo then null else 'infinity'::timestamptz end where id = p_id;
end $$;

create or replace function public.admin_excluir_usuario(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() or not public.pode_ver(p_id) then raise exception 'Você não tem acesso a esta pessoa.'; end if;
  if p_id = auth.uid() then raise exception 'Você não pode excluir a si mesmo.'; end if;
  delete from auth.users where id = p_id;
end $$;

create or replace function public.admin_definir_atribuir(p_id uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() or not public.pode_ver(p_id) then raise exception 'Você não tem acesso a esta pessoa.'; end if;
  update public.perfis set pode_atribuir = coalesce(p_valor, false) where id = p_id;
end $$;

create or replace function public.admin_definir_google_email(p_id uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() or not public.pode_ver(p_id) then raise exception 'Você não tem acesso a esta pessoa.'; end if;
  update public.perfis set google_email = nullif(lower(trim(p_email)), '') where id = p_id;
end $$;

-- configurar quem vê quem (só administrador sem limites)
create or replace function public.admin_definir_acesso(p_id uuid, p_ve uuid[], p_ocultar uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.admin_total() then raise exception 'Só um administrador sem limites pode mudar quem vê quem.'; end if;
  if p_id = auth.uid() and p_ve is not null then raise exception 'Você não pode limitar o seu próprio acesso.'; end if;
  if auth.uid() = any(coalesce(p_ocultar, '{}')) and p_id <> auth.uid() then
    raise exception 'Você não pode esconder de si mesmo o espaço de outra pessoa (você perderia o acesso).';
  end if;
  update public.perfis set ve = p_ve, ocultar_de = coalesce(p_ocultar, '{}') where id = p_id;
end $$;

revoke all on function public.pode_ver(uuid), public.admin_total(), public.admin_definir_acesso(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.pode_ver(uuid), public.admin_total(), public.admin_definir_acesso(uuid, uuid[], uuid[]) to authenticated;
