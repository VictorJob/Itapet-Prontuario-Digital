# Itapet — versão HTML/CSS/JavaScript puro

Migração do projeto React + TypeScript (TanStack Start) para arquivos estáticos, sem build.

## Correção do cadastro de tutores e clínicas (23/11/2026)

**Sintoma:** ao criar conta (tutor ou clínica), o e-mail era criado no Auth, mas o app parava em
"Registro não encontrado" e nenhuma linha aparecia em `tutor` ou `clinica`.

**Causa:** `db.loadLoginProfile()` dependia exclusivamente da RPC `itapet_repair_login_profile`
para criar o perfil. Essa função devolve `null` e não insere nada, então o `select` seguinte
em `tutor`/`clinica` voltava vazio e o `.single()` estourava. O front-end nunca criava o perfil
por conta própria.

**Correção (`js/db.js`):**
1. procura primeiro o perfil já existente (clínica e depois tutor) por `auth_user_id`;
2. se não houver, chama a RPC de reparo (contas antigas) sem quebrar o fluxo em caso de erro/nulo;
3. se ainda não houver perfil, **cria a linha** a partir dos metadados do `signUp`
   (`nome`, `email`, `telefone`, `cnpj`, `endereco`, `cep`, `auth_user_id`), nas colunas reais
   das tabelas, e devolve o perfil com `role`.

Extras: mensagens de erro específicas (CNPJ/e-mail duplicado, campos obrigatórios, RLS) e
tratamento de criação concorrente (código `23505`).

`sql/corrigir-cadastro.sql` (opcional, recomendado): conserta a RPC no banco, cria o perfil das
contas que ficaram presas no cadastro (backfill) e garante as políticas de INSERT/SELECT/UPDATE
do próprio perfil. O app já funciona sem rodar o script.

## Como rodar
1. Edite `js/config.js` com a URL e a chave pública (publishable) do seu Supabase
   (`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do `.env` original).
2. Sirva a pasta por HTTP (não abra com duplo clique, o login por e-mail precisa de uma URL real):
   `python3 -m http.server 8080` e acesse http://localhost:8080
3. No painel do Supabase (Authentication → URL Configuration), adicione essa URL
   (e a de produção) em *Redirect URLs*, incluindo `redefinir-senha.html`.

## Estrutura
- `index.html` — app principal (login + área autenticada, rotas por hash: `#/dashboard`, `#/pets`...)
- `redefinir-senha.html` + `js/reset.js` — página aberta pelo link de recuperação de senha
- `css/styles.css` — estilos (Tailwind removido; reset mínimo incluído)
- `js/config.js` — credenciais do Supabase
- `js/supabase.js` — cliente Supabase (CDN)
- `js/rules.js` — regras de negócio puras (CNPJ, datas, validações, código do pet...)
- `js/db.js` — acesso a dados (mesmas queries, RPCs e buckets do original)
- `js/ui.js`, `js/state.js`, `js/router.js`, `js/shell.js`, `js/auth.js`, `js/main.js`
- `js/pages/helpers.js` (componentes comuns) e `pets.js`, `agenda.js`, `docs.js`, `misc.js` (telas)
- `sql/corrigir-cadastro.sql` — script opcional de correção no banco (RPC do perfil, backfill e RLS)

## Status da migração
- [x] Etapa 1: base, autenticação (login, cadastro, recuperar senha), roteador, sidebar/topbar, dados
- [x] Etapa 2: as 13 telas (dashboard, pets, prontuário, vacinas, consultas, exames, medicamentos, lembretes, relatórios, planos, segurança, dados da clínica, veterinários) em `js/pages/`
- [x] Etapa 3: os 6 modais (pet, vacina, registro de prontuário, notificações, veterinário, vincular pet) em `js/modals.js`

Convenções: cada tela se registra com `Itapet.pages["/rota"] = { render(container) {...} }`
e cada modal com `Itapet.modals.nome = { open(pet), close() }`. Abra um modal com `Itapet.openModal("pet")`.

## Antes de publicar
- Teste o fluxo completo com o seu Supabase (cadastro, login, criar pet, vacina, upload de documento).
- O arquivo `js/config.js` contém só a chave pública (publishable); nunca coloque a service role key no front-end.
- Confira as Redirect URLs do Supabase (veja "Como rodar").
