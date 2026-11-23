/*
  Correção emergencial: remove a recursão RLS entre pet e clinicas_e_pets.
  Execute no SQL Editor do Supabase antes de testar novamente o aplicativo.
*/

begin;

alter table public.pet enable row level security;
alter table public.clinicas_e_pets enable row level security;

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename = 'clinicas_e_pets'
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end;
$$;

/* Não consulta public.pet: evita o ciclo pet -> clinicas_e_pets -> pet. */
create policy "itapet_clinics_read_pet_links" on public.clinicas_e_pets
  for select to authenticated
  using (
    exists (
      select 1
        from public.clinica c
       where c.cod = clinicas_e_pets.cod_clinica
         and c.auth_user_id = (select auth.uid())
    )
  );

create policy "itapet_clinics_insert_pet_links" on public.clinicas_e_pets
  for insert to authenticated
  with check (
    exists (
      select 1
        from public.clinica c
       where c.cod = clinicas_e_pets.cod_clinica
         and c.auth_user_id = (select auth.uid())
    )
  );

create policy "itapet_clinics_delete_pet_links" on public.clinicas_e_pets
  for delete to authenticated
  using (
    exists (
      select 1
        from public.clinica c
       where c.cod = clinicas_e_pets.cod_clinica
         and c.auth_user_id = (select auth.uid())
    )
  );

commit;
