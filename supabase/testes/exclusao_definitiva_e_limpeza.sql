-- Gestão de Projetos do Gauten Smart.GOV: teste da exclusão definitiva e da limpeza diária da lixeira.
--
-- Como usar: colar tudo no SQL Editor do Supabase e clicar em "Run".
-- O teste cria três usuários fictícios, três projetos e oito tarefas, confere 19 regras
-- e termina de propósito com um "erro" que começa com RESULTADO. Esse erro desfaz tudo:
-- nenhum dado de teste fica gravado e nenhum dado real é apagado.
--
-- Resultado esperado: "RESULTADO: 19 verificações, 0 falhas."
-- Se houver falhas, cada uma aparece em uma linha, dizendo qual regra não se comportou como deveria.
--
-- Atenção: durante o teste a limpeza da lixeira roda de verdade, dentro da mesma operação que
-- é desfeita no fim. Por isso o arquivo deve ser colado e rodado inteiro, sem cortes.

do $$
declare
  ua uuid := gen_random_uuid();   -- A: responsável pelos projetos e pelas tarefas
  ub uuid := gen_random_uuid();   -- B: participante do projeto
  uadm uuid := gen_random_uuid(); -- ADM: administrador
  ja text := jsonb_build_object('sub', ua, 'role', 'authenticated')::text;
  jadm text := jsonb_build_object('sub', uadm, 'role', 'authenticated')::text;
  p1 uuid := gen_random_uuid();   -- projeto ativo
  p2 uuid := gen_random_uuid();   -- projeto na lixeira há pouco tempo
  p3 uuid := gen_random_uuid();   -- projeto na lixeira há 31 dias
  t1 uuid := gen_random_uuid();   -- tarefa ativa do projeto p1
  t2 uuid := gen_random_uuid();   -- tarefa do projeto p2
  t3 uuid := gen_random_uuid();   -- tarefa do projeto p3
  t4 uuid := gen_random_uuid();   -- tarefa avulsa na lixeira há 31 dias
  t5 uuid := gen_random_uuid();   -- tarefa avulsa na lixeira há pouco tempo
  t6 uuid := gen_random_uuid();   -- tarefa do projeto p1 na lixeira há pouco tempo
  t7 uuid := gen_random_uuid();   -- tarefa do projeto p1 na lixeira há 31 dias
  t8 uuid := gen_random_uuid();   -- tarefa do projeto p1 na lixeira há 29 dias
  cp uuid; ct uuid;
  sufixo text := replace(gen_random_uuid()::text, '-', '');
  total int := 0;
  falhas text[] := '{}';
  n int;
begin
  -- ---------- Preparação ----------
  select id into cp from public.colunas where quadro = 'projetos' and not concluida order by ordem limit 1;
  select id into ct from public.colunas where quadro = 'tarefas' and not concluida order by ordem limit 1;
  if cp is null or ct is null then
    raise exception 'RESULTADO: não foi possível testar. Cada quadro precisa de ao menos uma coluna comum.';
  end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'teste-' || u.nome || '-' || sufixo || '@teste.invalid', '', now(),
         '{}'::jsonb, jsonb_build_object('nome', 'Teste ' || u.nome), now(), now()
    from (values (ua, 'a'), (ub, 'b'), (uadm, 'adm')) as u(id, nome);
  update public.perfis set ativo = true where id in (ua, ub);
  update public.perfis set ativo = true, papel = 'admin' where id = uadm;

  set local role authenticated;
  perform set_config('request.jwt.claims', ja, true);
  insert into public.projetos (id, titulo, coluna_id, responsavel_id) values
    (p1, 'Projeto ativo', cp, ua), (p2, 'Projeto na lixeira', cp, ua), (p3, 'Projeto antigo na lixeira', cp, ua);
  insert into public.projeto_membros (projeto_id, usuario_id) values (p2, ub);
  insert into public.tarefas (id, titulo, projeto_id, coluna_id, responsavel_id, prazo) values
    (t1, 'Ativa do projeto', p1, ct, ua, current_date),
    (t2, 'Do projeto na lixeira', p2, ct, ua, current_date),
    (t3, 'Do projeto antigo', p3, ct, ua, current_date),
    (t4, 'Avulsa antiga', null, ct, ua, current_date),
    (t5, 'Avulsa recente', null, ct, ua, current_date),
    (t6, 'Do projeto, excluída há pouco', p1, ct, ua, current_date),
    (t7, 'Do projeto, excluída há 31 dias', p1, ct, ua, current_date),
    (t8, 'Do projeto, excluída há 29 dias', p1, ct, ua, current_date);
  -- A, responsável, manda para a lixeira.
  update public.tarefas set arquivado_em = now() where id in (t4, t5, t6, t7, t8);
  update public.projetos set arquivado_em = now() where id in (p2, p3);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  -- Envelhece algumas exclusões. Os gatilhos são pausados só dentro deste teste.
  set local session_replication_role = replica;
  update public.tarefas set arquivado_em = now() - interval '31 days' where id in (t4, t7);
  update public.tarefas set arquivado_em = now() - interval '29 days' where id = t8;
  update public.projetos set arquivado_em = now() - interval '31 days' where id = p3;
  set local session_replication_role = origin;

  total := total + 1;
  select count(*) into n from public.tarefas where id in (t4, t5, t6, t7, t8) and arquivado_em is not null;
  if n <> 5 then falhas := falhas || 'preparação: as cinco tarefas deveriam estar na lixeira'; end if;

  -- ---------- Exclusão definitiva ----------
  -- 1. Quem não é admin não apaga de vez, nem o que é dele e está na lixeira.
  set local role authenticated;
  perform set_config('request.jwt.claims', ja, true);
  delete from public.tarefas where id in (t5, t6);
  delete from public.projetos where id = p2;
  reset role;
  total := total + 1;
  select count(*) into n from public.tarefas where id in (t5, t6);
  if n <> 2 then falhas := falhas || 'responsável (não admin) não deveria apagar tarefa de vez'; end if;
  total := total + 1;
  select count(*) into n from public.projetos where id = p2;
  if n <> 1 then falhas := falhas || 'responsável (não admin) não deveria apagar projeto de vez'; end if;

  -- 2. O admin não apaga o que está ativo.
  set local role authenticated;
  perform set_config('request.jwt.claims', jadm, true);
  delete from public.tarefas where id = t1;
  delete from public.projetos where id = p1;
  reset role;
  total := total + 1;
  select count(*) into n from public.tarefas where id = t1;
  if n <> 1 then falhas := falhas || 'admin não deveria apagar tarefa que não está na lixeira'; end if;
  total := total + 1;
  select count(*) into n from public.projetos where id = p1;
  if n <> 1 then falhas := falhas || 'admin não deveria apagar projeto que não está na lixeira'; end if;

  -- 3. O admin não apaga tarefa avulsa dos outros, mesmo na lixeira.
  set local role authenticated;
  perform set_config('request.jwt.claims', jadm, true);
  delete from public.tarefas where id = t5;
  reset role;
  total := total + 1;
  select count(*) into n from public.tarefas where id = t5;
  if n <> 1 then falhas := falhas || 'admin não deveria apagar tarefa avulsa de outra pessoa'; end if;

  -- 4. O admin apaga de vez tarefa de projeto que está na lixeira.
  set local role authenticated;
  perform set_config('request.jwt.claims', jadm, true);
  delete from public.tarefas where id = t6;
  reset role;
  total := total + 1;
  select count(*) into n from public.tarefas where id = t6;
  if n <> 0 then falhas := falhas || 'admin deveria apagar de vez tarefa de projeto que está na lixeira'; end if;

  -- 5. O admin apaga de vez projeto na lixeira; tarefas e equipe dele vão junto.
  set local role authenticated;
  perform set_config('request.jwt.claims', jadm, true);
  delete from public.projetos where id = p2;
  reset role;
  total := total + 1;
  select count(*) into n from public.projetos where id = p2;
  if n <> 0 then falhas := falhas || 'admin deveria apagar de vez projeto que está na lixeira'; end if;
  total := total + 1;
  select count(*) into n from public.tarefas where projeto_id = p2 or id = t2;
  if n <> 0 then falhas := falhas || 'as tarefas do projeto apagado deveriam ser apagadas junto'; end if;
  total := total + 1;
  select count(*) into n from public.projeto_membros where projeto_id = p2;
  if n <> 0 then falhas := falhas || 'a equipe do projeto apagado deveria ser apagada junto'; end if;
  total := total + 1;
  select count(*) into n from public.projetos where id = p1;
  if n <> 1 then falhas := falhas || 'apagar um projeto não deveria afetar outro projeto'; end if;

  -- ---------- Limpeza diária da lixeira ----------
  -- 6. Ninguém logado no site consegue chamar a limpeza, nem o admin.
  set local role authenticated;
  perform set_config('request.jwt.claims', jadm, true);
  total := total + 1;
  begin
    perform private.limpa_lixeira();
    falhas := falhas || 'usuário logado não deveria conseguir chamar a limpeza da lixeira';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- 7. A limpeza, rodada pelo banco, apaga só o que está na lixeira há mais de 30 dias.
  perform private.limpa_lixeira();
  total := total + 1;
  select count(*) into n from public.tarefas where id in (t4, t7);
  if n <> 0 then falhas := falhas || 'a limpeza deveria apagar tarefas na lixeira há mais de 30 dias (avulsa e de projeto)'; end if;
  total := total + 1;
  select count(*) into n from public.projetos where id = p3;
  if n <> 0 then falhas := falhas || 'a limpeza deveria apagar projeto na lixeira há mais de 30 dias'; end if;
  total := total + 1;
  select count(*) into n from public.tarefas where id = t3;
  if n <> 0 then falhas := falhas || 'a limpeza deveria apagar junto as tarefas do projeto apagado'; end if;
  total := total + 1;
  select count(*) into n from public.tarefas where id in (t5, t8) and arquivado_em is not null;
  if n <> 2 then falhas := falhas || 'a limpeza não deveria apagar o que está na lixeira há menos de 30 dias'; end if;
  total := total + 1;
  select count(*) into n from public.tarefas where id = t1 and arquivado_em is null;
  if n <> 1 then falhas := falhas || 'a limpeza não deveria apagar tarefa ativa'; end if;
  total := total + 1;
  select count(*) into n from public.projetos where id = p1 and arquivado_em is null;
  if n <> 1 then falhas := falhas || 'a limpeza não deveria apagar projeto ativo'; end if;

  -- 8. A limpeza está agendada e ligada: todos os dias às 03h15 de Brasília (06h15 UTC).
  total := total + 1;
  select count(*) into n from cron.job
   where jobname = 'limpa-lixeira' and active and schedule = '15 6 * * *' and command ilike '%private.limpa_lixeira()%';
  if n <> 1 then falhas := falhas || 'a limpeza diária deveria estar agendada e ligada (limpa-lixeira, 15 6 * * *)'; end if;

  -- ---------- Fim: desfaz tudo ----------
  raise exception E'RESULTADO: % verificações, % falhas.%', total, coalesce(array_length(falhas, 1), 0),
    case when array_length(falhas, 1) is null then ' Todas as regras se comportaram como esperado.'
         else E'\n - ' || array_to_string(falhas, E'\n - ') end;
end;
$$;
