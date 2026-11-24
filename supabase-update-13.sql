-- ACOMPANHAMENTO ADM — atualização 13: corrige "new row violates row-level security policy" ao criar pasta em Informações
-- (o salvamento usa upsert, que exige que a linha nova já passe na regra de leitura; a função auxiliar ainda não enxerga a linha recém-criada)
drop policy if exists info_pastas_ler on public.info_pastas;
create policy info_pastas_ler on public.info_pastas for select to authenticated
  using (dono = (select auth.uid()) or public.info_pasta_ok(id));
