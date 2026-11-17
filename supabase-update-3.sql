-- ACOMPANHAMENTO ADM — atualização 3: permissão para atribuir missões à equipe
alter table public.perfis add column if not exists pode_atribuir boolean not null default false;

create or replace function public.pode_atribuir() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo and (papel = 'admin' or pode_atribuir));
$$;

create or replace function public.equipe_basica()
returns table(id uuid, nome text, cor text, usuario text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nome, p.cor, p.usuario from public.perfis p where p.ativo and public.pode_atribuir() order by p.nome;
$$;

create or replace function public.admin_definir_atribuir(p_id uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Apenas o administrador pode alterar essa permissão.'; end if;
  update public.perfis set pode_atribuir = coalesce(p_valor, false) where id = p_id;
end $$;

-- quem pode atribuir: cria compromissos no espaço de outra pessoa e acompanha/edita o que atribuiu
drop policy if exists eventos_atribuir_ins on public.eventos;
create policy eventos_atribuir_ins on public.eventos for insert to authenticated
  with check (public.pode_atribuir() and criado_por = (select auth.uid()));
drop policy if exists eventos_atribuidas_sel on public.eventos;
create policy eventos_atribuidas_sel on public.eventos for select to authenticated
  using (criado_por = (select auth.uid()));
drop policy if exists eventos_atribuidas_upd on public.eventos;
create policy eventos_atribuidas_upd on public.eventos for update to authenticated
  using (criado_por = (select auth.uid()) and public.pode_atribuir())
  with check (criado_por = (select auth.uid()));
drop policy if exists eventos_atribuidas_del on public.eventos;
create policy eventos_atribuidas_del on public.eventos for delete to authenticated
  using (criado_por = (select auth.uid()) and public.pode_atribuir());

revoke all on function public.pode_atribuir(), public.equipe_basica(), public.admin_definir_atribuir(uuid, boolean) from public, anon;
grant execute on function public.pode_atribuir(), public.equipe_basica(), public.admin_definir_atribuir(uuid, boolean) to authenticated;
