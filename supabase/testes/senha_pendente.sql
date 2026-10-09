-- Gestão de Projetos do Gauten Smart.GOV: teste da trava de senha pendente.
--
-- Como usar: colar tudo no SQL Editor do Supabase e clicar em "Run".
-- O teste cria três usuários fictícios, um projeto e uma tarefa, confere 20 regras
-- e termina de propósito com um "erro" que começa com RESULTADO. Esse erro desfaz tudo:
-- nenhum dado de teste fica gravado no banco.
--
-- Resultado esperado: "RESULTADO: 20 verificações, 0 falhas."
--
-- O que este teste confere: quem ainda não criou a senha (convite novo ou "Gerar novo link")
-- não enxerga nem grava nada, mesmo com a sessão aberta; só o banco desliga a trava, ao gravar a senha;
-- "Gerar novo link" liga a trava e encerra as sessões abertas da conta.

do $$
declare
  ua uuid := gen_random_uuid();   -- A: usuário comum, com senha
  un uuid := gen_random_uuid();   -- N: convidado que ainda não criou a senha
  uadm uuid := gen_random_uuid(); -- ADM: administrador
  ja text := jsonb_build_object('sub', ua, 'role', 'authenticated')::text;
  jn text := jsonb_build_object('sub', un, 'role', 'authenticated')::text;
  jadm text := jsonb_build_object('sub', uadm, 'role', 'authenticated')::text;
  p1 uuid := gen_random_uuid();   -- projeto de A, com N na equipe
  t1 uuid := gen_random_uuid();   -- tarefa avulsa de A, responsável N
  cp uuid; ct uuid;
  sufixo text := replace(gen_random_uuid()::text, '-', '');
  total int := 0;
  falhas text[] := '{}';
  n int;
  b boolean;
begin
  -- ---------- Preparação (sem usuário logado) ----------
  select id into cp from public.colunas where quadro = 'projetos' and not concluida order by ordem limit 1;
  select id into ct from public.colunas where quadro = 'tarefas' and not concluida order by ordem limit 1;
  if cp is null or ct is null then
    raise exception 'RESULTADO: não foi possível testar. Cada quadro precisa de uma coluna comum.';
  end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'teste-' || u.nome || '-' || sufixo || '@teste.invalid', u.senha, now(),
         '{}'::jsonb, jsonb_build_object('nome', 'Teste ' || u.nome), now(), now()
    from (values (ua, 'a', 'senha-ja-gravada'), (un, 'n', ''), (uadm, 'adm', 'senha-ja-gravada')) as u(id, nome, senha);

  -- 1 e 2. Quem nasce sem senha nasce com a senha pendente; quem nasce com senha, não.
  total := total + 1;
  select senha_pendente into b from public.perfis where id = un;
  if not b then falhas := falhas || 'usuário criado sem senha deveria nascer com a senha pendente'::text; end if;
  total := total + 1;
  select count(*) into n from public.perfis where id in (ua, uadm) and not senha_pendente;
  if n <> 2 then falhas := falhas || 'usuário criado com senha não deveria nascer com a senha pendente'::text; end if;

  -- O convite libera o acesso (ativo), mas a senha continua pendente.
  update public.perfis set ativo = true where id in (ua, un);
  update public.perfis set ativo = true, papel = 'admin' where id = uadm;
  insert into public.projetos (id, titulo, coluna_id, responsavel_id, criado_por) values (p1, 'Projeto de teste da senha', cp, ua, ua);
  insert into public.projeto_membros (projeto_id, usuario_id) values (p1, un);
  insert into public.tarefas (id, titulo, coluna_id, responsavel_id, criado_por, prazo) values (t1, 'Tarefa de teste da senha', ct, un, ua, current_date);

  set local role authenticated;

  -- ---------- N: sessão aberta pelo link, senha ainda não criada ----------
  perform set_config('request.jwt.claims', jn, true);
  total := total + 1;
  select count(*) into n from public.projetos where id = p1;
  if n <> 0 then falhas := falhas || 'com a senha pendente, não deveria ver o projeto de que participa'::text; end if;
  total := total + 1;
  select count(*) into n from public.tarefas where id = t1;
  if n <> 0 then falhas := falhas || 'com a senha pendente, não deveria ver a tarefa de que é responsável'::text; end if;
  total := total + 1;
  select count(*) into n from public.colunas;
  if n <> 0 then falhas := falhas || 'com a senha pendente, não deveria ver as colunas'::text; end if;
  total := total + 1;
  select count(*) into n from public.perfis;
  if n <> 1 then falhas := falhas || 'com a senha pendente, deveria ver só o próprio perfil'::text; end if;
  total := total + 1;
  begin
    insert into public.tarefas (titulo, coluna_id, responsavel_id, prazo) values ('Não deveria entrar', ct, un, current_date);
    falhas := falhas || 'com a senha pendente, não deveria criar tarefa'::text;
  exception when insufficient_privilege then null;
  end;
  total := total + 1;
  update public.tarefas set titulo = 'Alterada' where id = t1;
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas || 'com a senha pendente, não deveria alterar tarefa'::text; end if;
  total := total + 1;
  update public.perfis set senha_pendente = false where id = un;
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas || 'com a senha pendente, não deveria desligar a própria trava'::text; end if;
  total := total + 1;
  update public.perfis set nome = 'Outro nome' where id = un;
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas || 'com a senha pendente, não deveria alterar o próprio perfil'::text; end if;

  -- ---------- Ninguém mexe na trava pelo site ----------
  perform set_config('request.jwt.claims', jadm, true);
  total := total + 1;
  begin
    update public.perfis set senha_pendente = false where id = un;
    falhas := falhas || 'admin não deveria desligar a trava de outro usuário'::text;
  exception when raise_exception then
    if sqlerrm not like 'A situação da senha%' then falhas := falhas || ('trava alterada pelo admin, erro inesperado: ' || sqlerrm); end if;
  end;
  total := total + 1;
  begin
    perform public.preparar_novo_link(ua);
    falhas := falhas || 'usuário logado (nem o admin) deveria chamar preparar_novo_link'::text;
  exception when insufficient_privilege then null;
  end;

  -- ---------- A senha é gravada: o banco desliga a trava ----------
  reset role;
  perform set_config('request.jwt.claims', '', true);
  total := total + 1;
  update auth.users set encrypted_password = '' where id = un;
  select senha_pendente into b from public.perfis where id = un;
  if not b then falhas := falhas || 'gravação sem senha não deveria desligar a trava'::text; end if;
  total := total + 1;
  update auth.users set encrypted_password = 'senha-criada-agora' where id = un;
  select senha_pendente into b from public.perfis where id = un;
  if b then falhas := falhas || 'gravar a senha deveria desligar a trava'::text; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', jn, true);
  total := total + 1;
  select count(*) into n from public.projetos where id = p1;
  if n <> 1 then falhas := falhas || 'depois de criar a senha, deveria ver o projeto de que participa'::text; end if;
  total := total + 1;
  select count(*) into n from public.tarefas where id = t1;
  if n <> 1 then falhas := falhas || 'depois de criar a senha, deveria ver a tarefa de que é responsável'::text; end if;

  -- ---------- "Gerar novo link": liga a trava e encerra as sessões ----------
  reset role;
  perform set_config('request.jwt.claims', '', true);
  insert into auth.sessions (id, user_id, created_at, updated_at) values (gen_random_uuid(), ua, now(), now()), (gen_random_uuid(), ua, now(), now());
  insert into auth.sessions (id, user_id, created_at, updated_at) values (gen_random_uuid(), uadm, now(), now());
  perform public.preparar_novo_link(ua);
  total := total + 1;
  select senha_pendente into b from public.perfis where id = ua;
  if not b then falhas := falhas || 'gerar novo link deveria ligar a senha pendente'::text; end if;
  total := total + 1;
  select count(*) into n from auth.sessions where user_id = ua;
  if n <> 0 then falhas := falhas || 'gerar novo link deveria encerrar as sessões da conta'::text; end if;
  total := total + 1;
  select count(*) into n from auth.sessions where user_id = uadm;
  if n <> 1 then falhas := falhas || 'gerar novo link não deveria encerrar sessões de outra conta'::text; end if;

  -- Administrador com a senha pendente deixa de valer como administrador.
  perform public.preparar_novo_link(uadm);
  set local role authenticated;
  perform set_config('request.jwt.claims', jadm, true);
  total := total + 1;
  update public.perfis set ativo = false where id = un;
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas || 'admin com a senha pendente não deveria alterar o acesso de ninguém'::text; end if;

  -- ---------- Fim: desfaz tudo ----------
  reset role;
  raise exception E'RESULTADO: % verificações, % falhas.%', total, coalesce(array_length(falhas, 1), 0),
    case when array_length(falhas, 1) is null then ' Todas as regras se comportaram como esperado.'
         else E'\n - ' || array_to_string(falhas, E'\n - ') end;
end;
$$;
