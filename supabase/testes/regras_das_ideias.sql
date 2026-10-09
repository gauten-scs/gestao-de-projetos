-- Takt: teste das regras das ideias.
--
-- Como usar: colar tudo no SQL Editor do Supabase e clicar em "Run".
-- O teste cria cinco usuários fictícios, dois projetos e algumas ideias, confere 51 regras
-- e termina de propósito com um "erro" que começa com RESULTADO. Esse erro desfaz tudo:
-- nenhum dado de teste fica gravado no banco.
--
-- Resultado esperado: "RESULTADO: 51 verificações, 0 falhas."
-- O teste apaga linhas (comentário, apoio e limpeza da lixeira). O Supabase pode pedir confirmação
-- antes de rodar ("destructive operation"): pode confirmar, porque tudo é desfeito no fim.

do $$
declare
  ua uuid := gen_random_uuid();   -- A: responsável pelo projeto P1
  ub uuid := gen_random_uuid();   -- B: participante de P1
  uc uuid := gen_random_uuid();   -- C: sem relação com P1; responsável por P2
  uadm uuid := gen_random_uuid(); -- ADM: administrador, fora dos projetos
  ui uuid := gen_random_uuid();   -- I: usuário sem acesso liberado
  ja text := jsonb_build_object('sub', ua, 'role', 'authenticated')::text;
  jb text := jsonb_build_object('sub', ub, 'role', 'authenticated')::text;
  jc text := jsonb_build_object('sub', uc, 'role', 'authenticated')::text;
  jadm text := jsonb_build_object('sub', uadm, 'role', 'authenticated')::text;
  ji text := jsonb_build_object('sub', ui, 'role', 'authenticated')::text;
  p1 uuid := gen_random_uuid();
  p2 uuid := gen_random_uuid();
  i1 uuid := gen_random_uuid();   -- ideia avulsa de B
  i2 uuid := gen_random_uuid();   -- ideia de B dentro de P1
  i3 uuid := gen_random_uuid();   -- ideia avulsa de C
  cp uuid; ct uuid;
  sufixo text := replace(gen_random_uuid()::text, '-', '');
  total int := 0;
  falhas text[] := '{}';
  n int;
  x uuid;
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
         'teste-' || u.nome || '-' || sufixo || '@teste.invalid', '', now(),
         '{}'::jsonb, jsonb_build_object('nome', 'Teste ' || u.nome), now(), now()
    from (values (ua, 'a'), (ub, 'b'), (uc, 'c'), (uadm, 'adm'), (ui, 'i')) as u(id, nome);
  -- Os usuários de teste nascem sem senha, e por isso com a senha pendente; aqui a trava é desligada.
  update public.perfis set ativo = true, senha_pendente = false where id in (ua, ub, uc);
  update public.perfis set ativo = true, senha_pendente = false, papel = 'admin' where id = uadm;

  insert into public.projetos (id, titulo, coluna_id, responsavel_id, criado_por) values
    (p1, 'Projeto de teste 1', cp, ua, ua), (p2, 'Projeto de teste 2', cp, uc, uc);
  insert into public.projeto_membros (projeto_id, usuario_id) values (p1, ub);

  set local role authenticated;

  -- ---------- Criar e ver ----------
  perform set_config('request.jwt.claims', ji, true);
  total := total + 1;
  begin
    insert into public.ideias (texto) values ('Ideia de quem não tem acesso');
    falhas := falhas || 'usuário sem acesso não deveria criar ideia';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', jb, true);
  total := total + 1;
  insert into public.ideias (id, texto) values (i1, 'Ideia avulsa de B');
  select count(*) into n from public.ideias where id = i1 and criado_por = ub and status = 'nova' and projeto_id is null;
  if n <> 1 then falhas := falhas || 'ideia avulsa deveria nascer com o autor, status Nova e sem projeto'; end if;
  total := total + 1;
  insert into public.ideias (id, texto, projeto_id, criado_por) values (i2, 'Ideia de B em P1', p1, ub);
  select count(*) into n from public.ideias where id = i2;
  if n <> 1 then falhas := falhas || 'participante deveria criar ideia no projeto'; end if;
  total := total + 1;
  begin
    insert into public.ideias (texto, projeto_id) values ('Ideia em projeto alheio', p2);
    falhas := falhas || 'não deveria criar ideia em projeto que não acessa';
  exception when insufficient_privilege then null;
  end;
  total := total + 1;
  begin
    insert into public.ideias (texto, criado_por) values ('Ideia em nome de outro', ua);
    select count(*) into n from public.ideias where texto = 'Ideia em nome de outro' and criado_por = ua;
    if n <> 0 then falhas := falhas || 'não deveria criar ideia em nome de outra pessoa'; end if;
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', ja, true);
  total := total + 1;
  select count(*) into n from public.ideias where id = i2;
  if n <> 1 then falhas := falhas || 'responsável deveria ver a ideia do projeto'; end if;
  total := total + 1;
  select count(*) into n from public.ideias where id = i1;
  if n <> 0 then falhas := falhas || 'ideia avulsa não deveria ser vista por outra pessoa'; end if;

  perform set_config('request.jwt.claims', jc, true);
  total := total + 1;
  select count(*) into n from public.ideias where id in (i1, i2);
  if n <> 0 then falhas := falhas || 'quem está fora do projeto não deveria ver as ideias dele'; end if;
  insert into public.ideias (id, texto) values (i3, 'Ideia avulsa de C');

  perform set_config('request.jwt.claims', jadm, true);
  total := total + 1;
  select count(*) into n from public.ideias where id in (i1, i2);
  if n <> 2 then falhas := falhas || 'administrador deveria ver as ideias de projeto dos outros'; end if;
  total := total + 1;
  select count(*) into n from public.ideias where id = i3;
  if n <> 0 then falhas := falhas || 'administrador não deveria ver ideia avulsa dos outros'; end if;
  total := total + 1;
  update public.ideias set arquivado_em = now() where id in (i1, i2);
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas || 'administrador não deveria excluir ideia dos outros'; end if;
  total := total + 1;
  update public.ideias set status = 'aprovada' where id in (i1, i2);
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas || 'administrador não deveria alterar ideia dos outros'; end if;
  total := total + 1;
  begin
    insert into public.ideia_comentarios (ideia_id, texto) values (i1, 'Comentário do administrador');
    falhas := falhas || 'administrador não deveria comentar ideia de projeto dos outros';
  exception when insufficient_privilege then null;
  end;
  total := total + 1;
  begin
    insert into public.ideia_apoios (ideia_id) values (i1);
    falhas := falhas || 'administrador não deveria apoiar ideia de projeto dos outros';
  exception when insufficient_privilege then null;
  end;

  -- ---------- Alterar ----------
  perform set_config('request.jwt.claims', ja, true);
  total := total + 1;
  begin
    update public.ideias set texto = 'Texto trocado pelo responsável' where id = i2;
    falhas := falhas || 'responsável do projeto não deveria alterar o texto da ideia de outro';
  exception when raise_exception then
    if sqlerrm not like 'Somente o autor pode alterar o texto%' then falhas := falhas || ('texto por outro, erro inesperado: ' || sqlerrm); end if;
  end;
  total := total + 1;
  update public.ideias set status = 'em_analise' where id = i2;
  select count(*) into n from public.ideias where id = i2 and status = 'em_analise' and atualizado_por = ua;
  if n <> 1 then falhas := falhas || 'responsável do projeto deveria mudar o status e ficar no histórico'; end if;
  total := total + 1;
  begin
    update public.ideias set projeto_id = null where id = i2;
    falhas := falhas || 'responsável do projeto não deveria desvincular a ideia de outro';
  exception when raise_exception then
    if sqlerrm not like 'Somente o autor pode vincular%' then falhas := falhas || ('desvincular por outro, erro inesperado: ' || sqlerrm); end if;
  end;
  total := total + 1;
  begin
    update public.ideias set arquivado_em = now() where id = i2;
    falhas := falhas || 'responsável do projeto não deveria excluir a ideia de outro';
  exception when raise_exception then
    if sqlerrm not like 'Somente o autor pode excluir%' then falhas := falhas || ('excluir por outro, erro inesperado: ' || sqlerrm); end if;
  end;

  perform set_config('request.jwt.claims', jb, true);
  total := total + 1;
  update public.ideias set texto = 'Ideia de B em P1, revista', status = 'aprovada' where id = i2;
  get diagnostics n = row_count;
  if n <> 1 then falhas := falhas || 'autor deveria alterar o texto e o status da própria ideia'; end if;
  total := total + 1;
  begin
    update public.ideias set criado_por = ua where id = i2;
    falhas := falhas || 'autor da ideia não deveria poder ser trocado';
  exception when raise_exception then
    if sqlerrm not like 'O autor e a data%' then falhas := falhas || ('troca de autor, erro inesperado: ' || sqlerrm); end if;
  end;

  -- ---------- Vincular e desvincular ----------
  total := total + 1;
  update public.ideias set projeto_id = null where id = i2;
  select count(*) into n from public.ideias where id = i2 and projeto_id is null;
  if n <> 1 then falhas := falhas || 'autor deveria desvincular ideia sem comentário nem apoio'; end if;
  perform set_config('request.jwt.claims', ja, true);
  total := total + 1;
  select count(*) into n from public.ideias where id = i2;
  if n <> 0 then falhas := falhas || 'ideia desvinculada deveria voltar a ser privada'; end if;
  perform set_config('request.jwt.claims', jb, true);
  total := total + 1;
  begin
    update public.ideias set projeto_id = p2 where id = i2;
    falhas := falhas || 'não deveria vincular ideia a projeto que não acessa';
  exception when insufficient_privilege then null;
  end;
  total := total + 1;
  update public.ideias set projeto_id = p1 where id = i2;
  perform set_config('request.jwt.claims', ja, true);
  select count(*) into n from public.ideias where id = i2;
  if n <> 1 then falhas := falhas || 'ideia vinculada deveria ser vista por quem acessa o projeto'; end if;

  -- ---------- Comentários e apoios ----------
  total := total + 1;
  insert into public.ideia_comentarios (ideia_id, texto) values (i2, 'Comentário de A');
  select count(*) into n from public.ideia_comentarios where ideia_id = i2 and criado_por = ua;
  if n <> 1 then falhas := falhas || 'quem acessa o projeto deveria comentar'; end if;
  total := total + 1;
  insert into public.ideia_apoios (ideia_id) values (i2);
  select count(*) into n from public.ideia_apoios where ideia_id = i2 and usuario_id = ua;
  if n <> 1 then falhas := falhas || 'quem acessa o projeto deveria apoiar'; end if;
  total := total + 1;
  begin
    insert into public.ideia_apoios (ideia_id, usuario_id) values (i2, ub);
    falhas := falhas || 'não deveria apoiar em nome de outra pessoa';
  exception when insufficient_privilege then null;
  end;
  total := total + 1;
  begin
    insert into public.ideia_apoios (ideia_id) values (i2);
    falhas := falhas || 'não deveria apoiar duas vezes';
  exception when unique_violation then null;
  end;

  perform set_config('request.jwt.claims', jc, true);
  total := total + 1;
  begin
    insert into public.ideia_comentarios (ideia_id, texto) values (i2, 'Comentário de fora');
    falhas := falhas || 'quem está fora do projeto não deveria comentar';
  exception when insufficient_privilege then null;
  end;
  total := total + 1;
  begin
    insert into public.ideia_apoios (ideia_id) values (i2);
    falhas := falhas || 'quem está fora do projeto não deveria apoiar';
  exception when insufficient_privilege then null;
  end;
  total := total + 1;
  select (select count(*) from public.ideia_comentarios where ideia_id = i2) + (select count(*) from public.ideia_apoios where ideia_id = i2) into n;
  if n <> 0 then falhas := falhas || 'quem está fora do projeto não deveria ver comentários e apoios'; end if;
  total := total + 1;
  begin
    insert into public.ideia_comentarios (ideia_id, texto) values (i3, 'Comentário em ideia avulsa');
    falhas := falhas || 'ideia avulsa não deveria receber comentário';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', jb, true);
  total := total + 1;
  begin
    update public.ideias set projeto_id = null where id = i2;
    falhas := falhas || 'ideia com comentário ou apoio não deveria sair do projeto';
  exception when raise_exception then
    if sqlerrm not like 'Esta ideia já recebeu%' then falhas := falhas || ('desvincular com interação, erro inesperado: ' || sqlerrm); end if;
  end;
  total := total + 1;
  delete from public.ideia_comentarios where ideia_id = i2;
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas || 'não deveria apagar o comentário de outra pessoa'; end if;

  -- ---------- Ideia de origem de tarefa e de projeto ----------
  total := total + 1;
  insert into public.tarefas (titulo, coluna_id, responsavel_id, prazo, projeto_id, ideia_id)
    values ('Tarefa da ideia', ct, ub, current_date, p1, i2);
  select count(*) into n from public.tarefas where ideia_id = i2;
  if n <> 1 then falhas := falhas || 'participante deveria criar tarefa a partir da ideia do projeto'; end if;
  total := total + 1;
  begin
    insert into public.tarefas (titulo, coluna_id, responsavel_id, prazo, ideia_id)
      values ('Tarefa avulsa de ideia de projeto', ct, ub, current_date, i2);
    falhas := falhas || 'tarefa de ideia de projeto não deveria nascer fora do projeto';
  exception when raise_exception then
    if sqlerrm not like 'A tarefa criada de uma ideia%' then falhas := falhas || ('tarefa fora do projeto, erro inesperado: ' || sqlerrm); end if;
  end;
  total := total + 1;
  insert into public.tarefas (titulo, coluna_id, responsavel_id, prazo, ideia_id)
    values ('Tarefa avulsa da ideia avulsa', ct, ub, current_date, i1);
  select count(*) into n from public.tarefas where ideia_id = i1 and projeto_id is null;
  if n <> 1 then falhas := falhas || 'ideia avulsa deveria gerar tarefa avulsa'; end if;
  total := total + 1;
  x := gen_random_uuid();
  insert into public.projetos (id, titulo, coluna_id, responsavel_id, ideia_id) values (x, 'Projeto da ideia avulsa', cp, ub, i1);
  select count(*) into n from public.projetos where id = x and ideia_id = i1;
  if n <> 1 then falhas := falhas || 'ideia avulsa deveria gerar projeto'; end if;
  total := total + 1;
  insert into public.projetos (titulo, coluna_id, responsavel_id, ideia_id) values ('Projeto da ideia de projeto', cp, ub, i2);
  select count(*) into n from public.projetos where ideia_id = i2;
  if n <> 1 then falhas := falhas || 'ideia de projeto deveria gerar projeto novo'; end if;
  total := total + 1;
  begin
    insert into public.projetos (titulo, coluna_id, responsavel_id, ideia_id) values ('Projeto de ideia alheia', cp, ub, i3);
    falhas := falhas || 'não deveria apontar para ideia que não enxerga';
  exception when raise_exception then
    if sqlerrm not like 'Ideia de origem não encontrada%' then falhas := falhas || ('ideia alheia, erro inesperado: ' || sqlerrm); end if;
  end;

  -- ---------- Lixeira ----------
  total := total + 1;
  update public.ideias set arquivado_em = now() where id = i2;
  select count(*) into n from public.ideias where id = i2 and arquivado_em is not null and arquivado_por = ub;
  if n <> 1 then falhas := falhas || 'autor deveria excluir a própria ideia (lixeira)'; end if;
  perform set_config('request.jwt.claims', ja, true);
  total := total + 1;
  begin
    insert into public.ideia_comentarios (ideia_id, texto) values (i2, 'Comentário em ideia excluída');
    falhas := falhas || 'ideia na lixeira não deveria receber comentário';
  exception when insufficient_privilege then null;
  end;
  total := total + 1;
  begin
    perform public.restaurar_item('ideias', i2);
    falhas := falhas || 'quem não é o autor não deveria restaurar a ideia';
  exception when raise_exception then
    if sqlerrm not like 'Você não pode restaurar%' then falhas := falhas || ('restaurar por outro, erro inesperado: ' || sqlerrm); end if;
  end;
  perform set_config('request.jwt.claims', jb, true);
  total := total + 1;
  perform public.restaurar_item('ideias', i2);
  select count(*) into n from public.ideias where id = i2 and arquivado_em is null and arquivado_por is null;
  if n <> 1 then falhas := falhas || 'autor deveria restaurar a própria ideia'; end if;

  update public.ideias set arquivado_em = now() where id in (i1, i2);
  perform set_config('request.jwt.claims', jadm, true);
  total := total + 1;
  select count(*) into n from public.ideias where id in (i1, i2);
  if n <> 1 then falhas := falhas || 'administrador deveria ver na lixeira só a ideia de projeto, e não a avulsa'; end if;
  total := total + 1;
  delete from public.ideias where id = i1;
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas || 'administrador não deveria excluir de vez ideia avulsa'; end if;
  total := total + 1;
  perform public.restaurar_item('ideias', i2);
  select count(*) into n from public.ideias where id = i2 and arquivado_em is not null;
  if n <> 0 then falhas := falhas || 'administrador deveria restaurar ideia de projeto'; end if;

  perform set_config('request.jwt.claims', jb, true);
  total := total + 1;
  delete from public.ideias where id = i1;
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas || 'autor não deveria excluir de vez a ideia (só a limpeza apaga)'; end if;

  -- ---------- Limpeza diária ----------
  reset role;
  perform set_config('request.jwt.claims', '', true);
  -- Envelhece a exclusão em 31 dias. Os gatilhos são pausados só dentro deste teste.
  set local session_replication_role = replica;
  update public.ideias set arquivado_em = now() - interval '31 days' where id = i1;
  set local session_replication_role = origin;
  set local role authenticated;
  perform set_config('request.jwt.claims', jb, true);
  total := total + 1;
  begin
    perform public.restaurar_item('ideias', i1);
    falhas := falhas || 'autor não deveria restaurar após 30 dias';
  exception when raise_exception then
    if sqlerrm not like 'Você não pode restaurar%' then falhas := falhas || ('restauração após 30 dias, erro inesperado: ' || sqlerrm); end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  total := total + 1;
  perform private.limpa_lixeira();
  select count(*) into n from public.ideias where id in (i1, i2);
  if n <> 1 then falhas := falhas || 'a limpeza diária deveria apagar só a ideia excluída há mais de 30 dias'; end if;
  total := total + 1;
  select count(*) into n from public.tarefas where titulo = 'Tarefa avulsa da ideia avulsa' and ideia_id is null;
  if n <> 1 then falhas := falhas || 'a tarefa deveria continuar existindo depois de a ideia de origem ser apagada'; end if;

  -- ---------- Fim: desfaz tudo ----------
  raise exception E'RESULTADO: % verificações, % falhas.%', total, coalesce(array_length(falhas, 1), 0),
    case when array_length(falhas, 1) is null then ' Todas as regras se comportaram como esperado.'
         else E'\n - ' || array_to_string(falhas, E'\n - ') end;
end;
$$;
