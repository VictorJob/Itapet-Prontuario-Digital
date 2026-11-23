/*
  Itapet — correção de vínculo por código e histórico transacional
  -----------------------------------------------------------------
  Aplicar no Supabase SQL Editor com uma conta de proprietário/admin.

  Esta migração:
  - usa pet.codigo (PET-AB12-34), nunca pet.cod_coleira, para o vínculo;
  - cria uma RPC SECURITY DEFINER com autorização explícita para clínicas;
  - cria uma RPC atômica para historico + pet_peso;
  - adiciona idempotência para evitar duplicidade quando a resposta de uma
    requisição se perde e o usuário tenta salvar novamente;
  - mantém RLS ativo: tutor lê e insere nos próprios pets; clínica vinculada lê e escreve o prontuário.

  A migração não apaga nem reescreve dados existentes. Se encontrar códigos
  duplicados ignorando maiúsculas/minúsculas, interrompe antes de criar o
  índice e informa os registros que precisam ser corrigidos manualmente.
*/

begin;

/* --------------------------------------------------------------------------
   1. Colunas e índices necessários
   -------------------------------------------------------------------------- */
alter table public.pet add column if not exists codigo text;
alter table public.historico add column if not exists cod_veterinario integer;
alter table public.historico add column if not exists tipo text;
alter table public.historico add column if not exists diagnostico_motivo text;
alter table public.historico add column if not exists sintomas text;
alter table public.historico add column if not exists tratamento text;
alter table public.historico add column if not exists nome_clinica text;
alter table public.historico add column if not exists peso numeric;
alter table public.historico add column if not exists data date;
alter table public.historico add column if not exists itapet_request_id uuid;

update public.historico
   set data = current_date
 where data is null;

alter table public.historico alter column data set default current_date;
alter table public.historico alter column data set not null;

create index if not exists pet_cod_tutor_idx on public.pet(cod_tutor);
create index if not exists historico_cod_pet_data_idx on public.historico(cod_pet, data desc);
create index if not exists pet_peso_pet_cod_data_idx on public.pet_peso(pet_cod, data);

do $$
begin
  if exists (
    select 1
      from public.pet
     where codigo is not null and btrim(codigo) <> ''
     group by upper(btrim(codigo))
    having count(*) > 1
  ) then
    raise exception '[ITAPET_DUPLICATE_PET_CODE] Existem códigos de pet duplicados ignorando maiúsculas/minúsculas.'
      using errcode = 'P0001',
            detail = 'Corrija os valores duplicados em public.pet.codigo e execute a migração novamente.';
  end if;
end;
$$;

create unique index if not exists pet_codigo_normalized_key
  on public.pet (upper(btrim(codigo)))
  where codigo is not null and btrim(codigo) <> '';

create unique index if not exists historico_itapet_request_id_key
  on public.historico(itapet_request_id)
  where itapet_request_id is not null;

/* --------------------------------------------------------------------------
   2. RPC de vinculação: clínica + pet.codigo -> clinicas_e_pets
   -------------------------------------------------------------------------- */
create or replace function public.itapet_link_pet_by_code(_codigo text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_clinica_cod integer;
  v_pet_cod integer;
  v_code text;
  v_matches integer;
  v_inserted integer;
begin
  select c.cod
    into v_clinica_cod
    from public.clinica c
   where c.auth_user_id = v_uid
   limit 1;

  if v_clinica_cod is null then
    raise exception '[ITAPET_NOT_CLINIC] Apenas contas de clínica podem vincular pacientes.'
      using errcode = 'P0001';
  end if;

  v_code := upper(btrim(coalesce(_codigo, '')));
  if v_code !~ '^PET-[A-Z0-9]{4}-[A-Z0-9]{2}$' then
    raise exception '[ITAPET_INVALID_PET_CODE] Use o formato PET-AB12-34.'
      using errcode = 'P0001';
  end if;

  select count(*)
    into v_matches
    from public.pet p
   where upper(btrim(p.codigo)) = v_code;

  if v_matches = 0 then
    raise exception '[ITAPET_PET_NOT_FOUND] Nenhum pet foi encontrado com esse código.'
      using errcode = 'P0001';
  end if;
  if v_matches > 1 then
    raise exception '[ITAPET_DUPLICATE_PET_CODE] O código informado pertence a mais de um pet.'
      using errcode = 'P0001';
  end if;

  select p.cod
    into v_pet_cod
    from public.pet p
   where upper(btrim(p.codigo)) = v_code;

  insert into public.clinicas_e_pets (cod_clinica, cod_pet)
  values (v_clinica_cod, v_pet_cod)
  on conflict (cod_clinica, cod_pet) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    raise exception '[ITAPET_ALREADY_LINKED] Este pet já está vinculado a esta clínica.'
      using errcode = 'P0001';
  end if;

  return v_pet_cod;
end;
$$;

revoke all on function public.itapet_link_pet_by_code(text) from public, anon;
grant execute on function public.itapet_link_pet_by_code(text) to authenticated;

/* RPC de desvinculação: somente a clínica dona do vínculo pode removê-lo. */
create or replace function public.itapet_unlink_pet(_cod_pet integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_clinica_cod integer;
begin
  select c.cod
    into v_clinica_cod
    from public.clinica c
   where c.auth_user_id = v_uid
   limit 1;

  if v_clinica_cod is null then
    raise exception '[ITAPET_NOT_CLINIC] Apenas clínicas podem desvincular pacientes.'
      using errcode = 'P0001';
  end if;

  delete from public.clinicas_e_pets
   where cod_clinica = v_clinica_cod
     and cod_pet = _cod_pet;

  if not found then
    raise exception '[ITAPET_LINK_NOT_FOUND] Este pet não está vinculado a esta clínica.'
      using errcode = 'P0001';
  end if;

  return true;
end;
$$;

revoke all on function public.itapet_unlink_pet(integer) from public, anon;
grant execute on function public.itapet_unlink_pet(integer) to authenticated;

/* --------------------------------------------------------------------------
   3. RPC transacional: historico e peso na mesma transação
   -------------------------------------------------------------------------- */
create or replace function public.itapet_create_history_with_weight(
  _cod_pet integer,
  _cod_veterinario integer default null,
  _tipo text default null,
  _diagnostico_motivo text default null,
  _sintomas text default null,
  _tratamento text default null,
  _nome_clinica text default null,
  _peso numeric default null,
  _data date default current_date,
  _request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_clinica_cod integer;
  v_clinica_nome text;
  v_history public.historico%rowtype;
  v_existing public.historico%rowtype;
  v_date date := coalesce(_data, current_date);
begin
  if v_uid is null then
    raise exception '[ITAPET_HISTORY_ACCESS] É necessário estar autenticado.'
      using errcode = '42501';
  end if;

  select c.cod, c.nome
    into v_clinica_cod, v_clinica_nome
    from public.clinica c
   where c.auth_user_id = v_uid
   limit 1;

  if not exists (
    select 1
      from public.pet p
      left join public.tutor t on t.cod = p.cod_tutor
     where p.cod = _cod_pet
       and (
         t.auth_user_id = v_uid
         or exists (
           select 1
             from public.clinicas_e_pets cp
             join public.clinica c on c.cod = cp.cod_clinica
            where cp.cod_pet = p.cod
              and c.auth_user_id = v_uid
         )
       )
  ) then
    raise exception '[ITAPET_HISTORY_ACCESS] Você não tem permissão para registrar informações neste pet.'
      using errcode = '42501';
  end if;

  if v_date > current_date then
    raise exception '[ITAPET_HISTORY_INVALID] A data do registro não pode ser no futuro.'
      using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(_diagnostico_motivo, '')), '') is null then
    raise exception '[ITAPET_HISTORY_INVALID] O diagnóstico ou motivo é obrigatório.'
      using errcode = 'P0001';
  end if;
  if _peso is not null and (_peso <= 0 or _peso > 500) then
    raise exception '[ITAPET_HISTORY_INVALID] O peso deve estar entre 0 e 500 kg.'
      using errcode = 'P0001';
  end if;

  if _cod_veterinario is not null and not exists (
    select 1 from public.veterinario v where v.cod = _cod_veterinario
  ) then
    raise exception '[ITAPET_HISTORY_INVALID] O veterinário informado não existe.'
      using errcode = 'P0001';
  end if;

  if v_clinica_cod is not null and _cod_veterinario is not null and not exists (
    select 1
      from public.veterinario v
     where v.cod = _cod_veterinario
       and v.cod_clinica = v_clinica_cod
  ) then
    raise exception '[ITAPET_HISTORY_ACCESS] O veterinário não pertence à clínica autenticada.'
      using errcode = '42501';
  end if;

  /*
    Repetição com o mesmo request_id devolve o registro existente. Isso cobre
    timeout/resposta perdida sem duplicar o histórico nem o peso.
  */
  if _request_id is not null then
    select h.*
      into v_existing
      from public.historico h
     where h.itapet_request_id = _request_id
       and h.cod_pet = _cod_pet
     limit 1;
    if found then
      return to_jsonb(v_existing);
    end if;
  end if;

  insert into public.historico (
    cod_pet, cod_veterinario, tipo, diagnostico_motivo, sintomas,
    tratamento, nome_clinica, peso, data, itapet_request_id
  ) values (
    _cod_pet, _cod_veterinario, nullif(btrim(_tipo), ''),
    btrim(_diagnostico_motivo), nullif(btrim(_sintomas), ''),
    nullif(btrim(_tratamento), ''),
    case when v_clinica_cod is not null then v_clinica_nome
         else nullif(btrim(_nome_clinica), '') end,
    _peso, v_date, _request_id
  )
  on conflict do nothing
  returning * into v_history;

  if not found then
    if _request_id is not null then
      select h.*
        into v_history
        from public.historico h
       where h.itapet_request_id = _request_id
         and h.cod_pet = _cod_pet
       limit 1;
    end if;
    if not found then
      raise exception '[ITAPET_HISTORY_INVALID] Não foi possível confirmar o registro clínico.'
        using errcode = 'P0001';
    end if;
    return to_jsonb(v_history);
  end if;

  if _peso is not null then
    insert into public.pet_peso (pet_cod, peso, data)
    values (_cod_pet, _peso, v_date);
  end if;

  return to_jsonb(v_history);
end;
$$;

revoke all on function public.itapet_create_history_with_weight(
  integer, integer, text, text, text, text, text, numeric, date, uuid
) from public, anon;
grant execute on function public.itapet_create_history_with_weight(
  integer, integer, text, text, text, text, text, numeric, date, uuid
) to authenticated;

/* --------------------------------------------------------------------------
   4. Grants e RLS: participantes, sem liberar acesso geral
   -------------------------------------------------------------------------- */
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.clinicas_e_pets, public.historico, public.pet_peso to authenticated;

do $$
declare
  v_sequence text;
begin
  foreach v_sequence in array array[
    pg_get_serial_sequence('public.historico', 'cod'),
    pg_get_serial_sequence('public.pet_peso', 'cod')
  ] loop
    if v_sequence is not null then
      execute format('grant usage, select on sequence %s to authenticated', v_sequence);
    end if;
  end loop;
end;
$$;

do $$
begin
  if exists (
    select 1
      from public.clinicas_e_pets
     group by cod_clinica, cod_pet
    having count(*) > 1
  ) then
    raise exception '[ITAPET_LINK_DUPLICATE] Existem vínculos clínica-pet duplicados; corrija-os antes de aplicar a unicidade.';
  end if;
  create unique index if not exists clinicas_e_pets_cod_clinica_cod_pet_key
    on public.clinicas_e_pets (cod_clinica, cod_pet);
end;
$$;

alter table public.clinicas_e_pets enable row level security;
alter table public.pet enable row level security;
alter table public.historico enable row level security;
alter table public.pet_peso enable row level security;

/* Remove políticas antigas com nomes diferentes que poderiam ampliar acesso. */
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('clinicas_e_pets', 'pet', 'historico', 'pet_peso')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end;
$$;

/* A clínica só enxerga pets que tenham vínculo real em clinicas_e_pets. */
create policy "itapet_pets_select_tutor_or_linked_clinic" on public.pet
  for select to authenticated
  using (
    exists (
      select 1 from public.tutor t
       where t.cod = pet.cod_tutor
         and t.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.clinicas_e_pets cp
        join public.clinica c on c.cod = cp.cod_clinica
       where cp.cod_pet = pet.cod
         and c.auth_user_id = (select auth.uid())
    )
  );

create policy "itapet_pets_manage_own_tutor" on public.pet
  for all to authenticated
  using (
    exists (
      select 1 from public.tutor t
       where t.cod = pet.cod_tutor
         and t.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.tutor t
       where t.cod = pet.cod_tutor
         and t.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "participants read clinic pet links" on public.clinicas_e_pets;
drop policy if exists "itapet_clinics_read_pet_links" on public.clinicas_e_pets;
create policy "itapet_clinics_read_pet_links" on public.clinicas_e_pets
  for select to authenticated
  using (
    exists (
      select 1 from public.clinica c
       where c.cod = clinicas_e_pets.cod_clinica
         and c.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "itapet_clinics_insert_pet_links" on public.clinicas_e_pets;
create policy "itapet_clinics_insert_pet_links" on public.clinicas_e_pets
  for insert to authenticated
  with check (
    exists (
      select 1 from public.clinica c
       where c.cod = clinicas_e_pets.cod_clinica
         and c.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "itapet_clinics_delete_pet_links" on public.clinicas_e_pets;
create policy "itapet_clinics_delete_pet_links" on public.clinicas_e_pets
  for delete to authenticated
  using (
    exists (
      select 1 from public.clinica c
       where c.cod = clinicas_e_pets.cod_clinica
         and c.auth_user_id = (select auth.uid())
    )
  );

/* Fotos privadas: a clínica vinculada pode gerar a URL assinada do pet. */
drop policy if exists "itapet_participants_read_pet_photos" on storage.objects;
create policy "itapet_participants_read_pet_photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'itapet-pet-photos'
    and (storage.foldername(name))[1] = 'pets'
    and exists (
      select 1
        from public.pet p
       where p.cod = case
         when (storage.foldername(name))[2] ~ '^[0-9]+$'
         then ((storage.foldername(name))[2])::integer
         else null
       end
         and (
           exists (
             select 1 from public.tutor t
              where t.cod = p.cod_tutor
                and t.auth_user_id = (select auth.uid())
           )
           or exists (
             select 1
               from public.clinicas_e_pets cp
               join public.clinica c on c.cod = cp.cod_clinica
              where cp.cod_pet = p.cod
                and c.auth_user_id = (select auth.uid())
           )
         )
    )
  );

/* Histórico: tutor e clínica vinculada podem ler; tutor insere no próprio pet; clínica edita/exclui. */
drop policy if exists "participants manage pet history" on public.historico;
drop policy if exists "itapet_history_select_participant" on public.historico;
drop policy if exists "itapet_history_insert_participant" on public.historico;
drop policy if exists "itapet_history_update_participant" on public.historico;
drop policy if exists "itapet_history_delete_participant" on public.historico;

create policy "itapet_history_select_participant" on public.historico
  for select to authenticated
  using (
    exists (
      select 1 from public.pet p join public.tutor t on t.cod = p.cod_tutor
       where p.cod = historico.cod_pet and t.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.clinicas_e_pets cp join public.clinica c on c.cod = cp.cod_clinica
       where cp.cod_pet = historico.cod_pet and c.auth_user_id = (select auth.uid())
    )
  );

create policy "itapet_history_insert_participant" on public.historico
  for insert to authenticated
  with check (
    exists (
      select 1 from public.pet p join public.tutor t on t.cod = p.cod_tutor
       where p.cod = historico.cod_pet and t.auth_user_id = (select auth.uid())
    )
    or
    exists (
      select 1 from public.clinicas_e_pets cp join public.clinica c on c.cod = cp.cod_clinica
       where cp.cod_pet = historico.cod_pet and c.auth_user_id = (select auth.uid())
    )
  );

create policy "itapet_history_update_clinic" on public.historico
  for update to authenticated
  using (
    exists (
      select 1 from public.clinicas_e_pets cp join public.clinica c on c.cod = cp.cod_clinica
       where cp.cod_pet = historico.cod_pet and c.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.clinicas_e_pets cp join public.clinica c on c.cod = cp.cod_clinica
       where cp.cod_pet = historico.cod_pet and c.auth_user_id = (select auth.uid())
    )
  );

create policy "itapet_history_delete_clinic" on public.historico
  for delete to authenticated
  using (
    exists (
      select 1 from public.clinicas_e_pets cp join public.clinica c on c.cod = cp.cod_clinica
       where cp.cod_pet = historico.cod_pet and c.auth_user_id = (select auth.uid())
    )
  );

/* Peso segue a mesma autorização: leitura pelos participantes, inserção pelo tutor, edição/exclusão pela clínica. */
drop policy if exists "participants manage pet weights" on public.pet_peso;
drop policy if exists "itapet_weight_select_participant" on public.pet_peso;
drop policy if exists "itapet_weight_insert_participant" on public.pet_peso;
drop policy if exists "itapet_weight_update_participant" on public.pet_peso;
drop policy if exists "itapet_weight_delete_participant" on public.pet_peso;

create policy "itapet_weight_select_participant" on public.pet_peso
  for select to authenticated
  using (
    exists (
      select 1 from public.pet p join public.tutor t on t.cod = p.cod_tutor
       where p.cod = pet_peso.pet_cod and t.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.clinicas_e_pets cp join public.clinica c on c.cod = cp.cod_clinica
       where cp.cod_pet = pet_peso.pet_cod and c.auth_user_id = (select auth.uid())
    )
  );

create policy "itapet_weight_insert_participant" on public.pet_peso
  for insert to authenticated
  with check (
    exists (
      select 1 from public.pet p join public.tutor t on t.cod = p.cod_tutor
       where p.cod = pet_peso.pet_cod and t.auth_user_id = (select auth.uid())
    )
    or
    exists (
      select 1 from public.clinicas_e_pets cp join public.clinica c on c.cod = cp.cod_clinica
       where cp.cod_pet = pet_peso.pet_cod and c.auth_user_id = (select auth.uid())
    )
  );

create policy "itapet_weight_update_clinic" on public.pet_peso
  for update to authenticated
  using (
    exists (
      select 1 from public.clinicas_e_pets cp join public.clinica c on c.cod = cp.cod_clinica
       where cp.cod_pet = pet_peso.pet_cod and c.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.clinicas_e_pets cp join public.clinica c on c.cod = cp.cod_clinica
       where cp.cod_pet = pet_peso.pet_cod and c.auth_user_id = (select auth.uid())
    )
  );

create policy "itapet_weight_delete_clinic" on public.pet_peso
  for delete to authenticated
  using (
    exists (
      select 1 from public.clinicas_e_pets cp join public.clinica c on c.cod = cp.cod_clinica
       where cp.cod_pet = pet_peso.pet_cod and c.auth_user_id = (select auth.uid())
    )
  );

commit;
