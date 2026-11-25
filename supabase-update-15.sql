-- Atualização 15: passos atribuídos a um membro, vistos por quem abre o espaço dele (admin ou membro com permissão)
create or replace function public.passos_de(p_alvo uuid)
returns table(origem text, ref_id uuid, titulo text, dono uuid, dono_nome text, passo_id text, texto text, prazo date, feito boolean, data_ref date)
language sql stable security definer set search_path = '' as $$
  select 'demanda', d.id, d.titulo, d.dono, p.nome, c->>'id', c->>'texto', nullif(c->>'prazo','')::date, coalesce((c->>'feito')::boolean, false), d.prazo
  from public.demandas d join public.perfis p on p.id = d.dono
  cross join lateral jsonb_array_elements(case when jsonb_typeof(d.checklist) = 'array' then d.checklist else '[]'::jsonb end) c
  where (p_alvo = auth.uid() or public.is_admin() or public.pode_ver_membro(p_alvo))
    and d.status <> 'finalizado' and d.dono <> p_alvo
    and jsonb_typeof(c->'resp') = 'array' and (c->'resp') ? p_alvo::text
  union all
  select 'evento', e.id, e.titulo, e.dono, p.nome, c->>'id', c->>'texto', nullif(c->>'prazo','')::date, coalesce((c->>'feito')::boolean, false), e.data
  from public.eventos e join public.perfis p on p.id = e.dono
  cross join lateral jsonb_array_elements(case when jsonb_typeof(e.checklist) = 'array' then e.checklist else '[]'::jsonb end) c
  where (p_alvo = auth.uid() or public.is_admin() or public.pode_ver_membro(p_alvo))
    and e.dono <> p_alvo and jsonb_typeof(c->'resp') = 'array' and (c->'resp') ? p_alvo::text;
$$;
revoke all on function public.passos_de(uuid) from public, anon;
grant execute on function public.passos_de(uuid) to authenticated;
notify pgrst, 'reload schema';
