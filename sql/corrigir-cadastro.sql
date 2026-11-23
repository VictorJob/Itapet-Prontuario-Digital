/* ============================================================================
   Itapet — correção do cadastro de tutores e clínicas
   ----------------------------------------------------------------------------
   Problema: o app chamava a RPC `itapet_repair_login_profile` esperando que ela
   criasse a linha em `tutor` ou `clinica`. A função devolvia NULL e não criava
   nada, então o login caía em "Registro não encontrado" e o cadastro não
   concluía.

   O front-end (js/db.js) já foi corrigido e cria o perfil sozinho. Este script
   é OPCIONAL, mas recomendado porque:
     1. conserta a função para contas antigas (perfil ligado por e-mail);
     2. cria o perfil das contas que ficaram presas no cadastro (backfill);
     3. garante as permissões de INSERT/SELECT/UPDATE do próprio perfil.

   Como aplicar: Supabase → SQL Editor → cole tudo → Run.
   É idempotente: pode rodar mais de uma vez sem duplicar dados.
   ========================================================================== */

/* ---------------------------------------------------------------------------
   1. Função de reparo/criação do perfil
   ------------------------------------------------------------------------- */
create or replace function public.itapet_repair_login_profile()
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  uid        uuid := auth.uid();
  user_email text;
  meta       jsonb;
  v_role     text;
begin
  if uid is null then
    return null;
  end if;

  -- Perfil já vinculado ao usuário: nada a fazer.
  if exists (select 1 from public.clinica c where c.auth_user_id = uid) then
    return 'clinica';
  end if;
  if exists (select 1 from public.tutor t where t.auth_user_id = uid) then
    return 'tutor';
  end if;

  select u.email, coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into user_email, meta
    from auth.users u
   where u.id = uid;

  if user_email is null then
    return null;
  end if;

  v_role := lower(coalesce(meta->>'role', meta->>'tipo', 'tutor'));

  -- Conta importada: já existe clínica com o mesmo e-mail, mas sem vínculo.
  if v_role in ('clinica', 'clínica', 'clinic', 'veterinaria', 'veterinária') then
    update public.clinica
       set auth_user_id = uid
     where auth_user_id is null
       and lower(email) = lower(user_email);
    if found then
      return 'clinica';
    end if;
  else
    update public.tutor
       set auth_user_id = uid
     where auth_user_id is null
       and lower(email) = lower(user_email);
    if found then
      return 'tutor';
    end if;
  end if;

  -- Cadastro novo: cria a linha com as colunas reais das tabelas.
  if v_role in ('clinica', 'clínica', 'clinic', 'veterinaria', 'veterinária') then
    insert into public.clinica (nome, cnpj, email, endereco, cep, telefone, auth_user_id)
    values (
      coalesce(nullif(trim(meta->>'nome'), ''), nullif(trim(meta->>'nome_clinica'), ''), split_part(user_email, '@', 1)),
      nullif(regexp_replace(coalesce(meta->>'cnpj', ''), '\D', '', 'g'), ''),
      user_email,
      nullif(trim(coalesce(meta->>'endereco', meta->>'endereço', '')), ''),
      nullif(regexp_replace(coalesce(meta->>'cep', ''), '\D', '', 'g'), ''),
      nullif(regexp_replace(coalesce(meta->>'telefone', meta->>'phone', ''), '\D', '', 'g'), ''),
      uid
    );
    return 'clinica';
  end if;

  insert into public.tutor (nome, email, telefone, auth_user_id)
  values (
    coalesce(nullif(trim(meta->>'nome'), ''), nullif(trim(meta->>'name'), ''), split_part(user_email, '@', 1)),
    user_email,
    nullif(regexp_replace(coalesce(meta->>'telefone', meta->>'phone', ''), '\D', '', 'g'), ''),
    uid
  );
  return 'tutor';
end;
$$;

revoke all on function public.itapet_repair_login_profile() from public, anon;
grant execute on function public.itapet_repair_login_profile() to authenticated;

/* ---------------------------------------------------------------------------
   2. Backfill: cria o perfil das contas que ficaram sem tutor/clinica
   ------------------------------------------------------------------------- */
-- Tutores
insert into public.tutor (nome, email, telefone, auth_user_id)
select coalesce(nullif(trim(u.raw_user_meta_data->>'nome'), ''), split_part(u.email, '@', 1)),
       u.email,
       nullif(regexp_replace(coalesce(u.raw_user_meta_data->>'telefone', ''), '\D', '', 'g'), ''),
       u.id
  from auth.users u
 where lower(coalesce(u.raw_user_meta_data->>'role', 'tutor')) not in
       ('clinica', 'clínica', 'clinic', 'veterinaria', 'veterinária')
   and not exists (select 1 from public.tutor t where t.auth_user_id = u.id)
   and not exists (select 1 from public.clinica c where c.auth_user_id = u.id)
   and not exists (select 1 from public.tutor t2 where lower(t2.email) = lower(u.email));

-- Clínicas
insert into public.clinica (nome, cnpj, email, endereco, cep, telefone, auth_user_id)
select coalesce(nullif(trim(u.raw_user_meta_data->>'nome'), ''), split_part(u.email, '@', 1)),
       nullif(regexp_replace(coalesce(u.raw_user_meta_data->>'cnpj', ''), '\D', '', 'g'), ''),
       u.email,
       nullif(trim(coalesce(u.raw_user_meta_data->>'endereco', '')), ''),
       nullif(regexp_replace(coalesce(u.raw_user_meta_data->>'cep', ''), '\D', '', 'g'), ''),
       nullif(regexp_replace(coalesce(u.raw_user_meta_data->>'telefone', ''), '\D', '', 'g'), ''),
       u.id
  from auth.users u
 where lower(coalesce(u.raw_user_meta_data->>'role', 'tutor')) in
       ('clinica', 'clínica', 'clinic', 'veterinaria', 'veterinária')
   and not exists (select 1 from public.clinica c where c.auth_user_id = u.id)
   and not exists (select 1 from public.tutor t where t.auth_user_id = u.id)
   and not exists (select 1 from public.clinica c2 where lower(c2.email) = lower(u.email));

/* ---------------------------------------------------------------------------
   3. Permissões (RLS) do próprio perfil
   Cria as políticas que faltarem, sem mexer nas que já existem.
   ------------------------------------------------------------------------- */
do $$
begin
  -- tutor
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'tutor' and cmd = 'SELECT') then
    execute $p$create policy itapet_tutor_select_own on public.tutor
      for select to authenticated using (auth_user_id = auth.uid());$p$;
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'tutor' and cmd = 'INSERT') then
    execute $p$create policy itapet_tutor_insert_own on public.tutor
      for insert to authenticated with check (auth_user_id = auth.uid());$p$;
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'tutor' and cmd = 'UPDATE') then
    execute $p$create policy itapet_tutor_update_own on public.tutor
      for update to authenticated using (auth_user_id = auth.uid())
      with check (auth_user_id = auth.uid());$p$;
  end if;

  -- clinica
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'clinica' and cmd = 'SELECT') then
    execute $p$create policy itapet_clinica_select_own on public.clinica
      for select to authenticated using (auth_user_id = auth.uid());$p$;
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'clinica' and cmd = 'INSERT') then
    execute $p$create policy itapet_clinica_insert_own on public.clinica
      for insert to authenticated with check (auth_user_id = auth.uid());$p$;
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'clinica' and cmd = 'UPDATE') then
    execute $p$create policy itapet_clinica_update_own on public.clinica
      for update to authenticated using (auth_user_id = auth.uid())
      with check (auth_user_id = auth.uid());$p$;
  end if;
end;
$$;

/* ---------------------------------------------------------------------------
   4. Conferência
   ------------------------------------------------------------------------- */
-- select count(*) filter (where auth_user_id is not null) as tutores_com_login from public.tutor;
-- select count(*) filter (where auth_user_id is not null) as clinicas_com_login from public.clinica;
