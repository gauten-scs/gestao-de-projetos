-- Gestão de Projetos do Gauten Smart.GOV: teste das regras de acesso do banco.
--
-- Como usar: colar tudo no SQL Editor do Supabase e clicar em "Run".
-- O teste cria cinco usuários fictícios, um projeto e três tarefas, confere 57 regras
-- e termina de propósito com um "erro" que começa com RESULTADO. Esse erro desfaz tudo:
-- nenhum dado de teste fica gravado no banco.
--
-- Resultado esperado: "RESULTADO: 57 verificações, 0 falhas."
-- Se houver falhas, cada uma aparece em uma linha, dizendo qual regra não se comportou como deveria.
--
-- O que este teste não cobre: exclusão definitiva e limpeza diária da lixeira.

do $$
declare
  ua uuid := gen_random_uuid();   -- A: responsável pelo projeto
  ub uuid := gen_random_uuid();   -- B: participante do projeto
  uc uuid := gen_random_uuid();   -- C: usuário sem relação com o projeto
  uadm uuid := gen_random_uuid(); -- ADM: administrador
  ui uuid := gen_random_uuid();   -- I: usuário sem acesso liberado
  ja text := jsonb_build_object('sub', ua, 'role', 'authenticated')::text;
  jb text := jsonb_build_object('sub', ub, 'role', 'authenticated')::text;
  jc text := jsonb_build_object('sub', uc, 'role', 'authenticated')::text;
  jadm text := jsonb_build_object('sub', uadm, 'role', 'authenticated')::text;
  ji text := jsonb_build_object('sub', ui, 'role', 'authenticated')::text;
  p1 uuid := gen_random_uuid();   -- projeto de A, com B na equipe
  t1 uuid := gen_random_uuid();   -- tarefa do projeto, responsável B
  t2 uuid := gen_random_uuid();   -- tarefa avulsa criada por A, responsável B
  t3 uuid := gen_random_uuid();   -- tarefa avulsa de A
  cp uuid; cpc uuid; ct uuid; ctc uuid;
  sufixo text := replace(gen_random_uuid()::text, '-', '');
  total int := 0;
  falhas text[] := '{}';
  n int;
begin
  -- ---------- Preparação (sem usuário logado) ----------
  select id into cp  from public.colunas where quadro = 'projetos' and not concluida order by ordem limit 1;
  select id into cpc from public.colunas where quadro = 'projetos' and concluida order by ordem limit 1;
  select id into ct  from public.colunas where quadro = 'tarefas' and not concluida order by ordem limit 1;
  select id into ctc from public.colunas where quadro = 'tarefas' and concluida order by ordem limit 1;
  if cp is null or cpc is null or ct is null or ctc is null then
    raise exception 'RESULTADO: não foi possível testar. Cada quadro precisa de uma coluna comum e de uma coluna concluída.';
  end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'teste-' || u.nome || '-' || sufixo || '@teste.invalid', '', now(),
         '{}'::jsonb, jsonb_build_object('nome', 'Teste ' || u.nome), now(), now()
    from (values (ua, 'a'), (ub, 'b'), (uc, 'c'), (uadm, 'adm'), (ui, 'i')) as u(id, nome);

  -- 1. Todo usuário nasce sem acesso e como membro.
  total := total + 1;
  select count(*) into n from public.perfis where id in (ua, ub, uc, uadm, ui) and not ativo and papel = 'membro';
  if n <> 5 then falhas := falhas || 'usuário novo deveria nascer sem acesso e como membro'; end if;

  update public.perfis set ativo = true where id in (ua, ub, uc);
  update public.perfis set ativo = true, papel = 'admin' where id = uadm;

  set local role authenticated;

  -- ---------- Acesso e perfis ----------
  perform set_config('request.jwt.claims', ji, true);
  total := total + 1;
  select count(*) into n from public.colunas;
  if n <> 0 then falhas := falhas || 'usuário sem acesso não deveria ver as colunas'; end if;
  total := total + 1;
  select count(*) into n from public.perfis;
  if n <> 1 then falhas := falhas || 'usuário sem acesso deveria ver só o próprio perfil'; end if;
  total := total + 1;
  begin
    insert into public.projetos (titulo, coluna_id, responsavel_id) values ('Teste', cp, ui);
    falhas := falhas || 'usuário sem acesso não deveria criar projeto';
  exception when insufficient_privilege then null;
  end;
  total := total + 1;
  begin
    perform public.restaurar_item('projetos', p1);
    falhas := falhas || 'usuário sem acesso não deveria usar a restauração';
  exception when raise_exception then
    if sqlerrm not like 'Sem acesso%' then falhas := falhas || ('restauração sem acesso, erro inesperado: ' || sqlerrm); end if;
  end;

  perform set_config('request.jwt.claims', ja, true);
  total := total + 1;
  begin
    update public.perfis set papel = 'admin' where id = ua;
    falhas := falhas || 'membro não deveria virar admin por conta própria';
  exception when raise_exception then
    if sqlerrm not like 'Somente o administrador%' then falhas := falhas || ('papel próprio, erro inesperado: ' || sqlerrm); end if;
  end;
  total := total + 1;
  update public.perfis set nome = 'Outro nome' where id = ub;
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas || 'membro não deveria alterar o nome de outra pessoa'; end if;
  total := total + 1;
  update public.perfis set nome = 'Teste A alterado' where id = ua;
  get diagnostics n = row_count;
  if n <> 1 then falhas := falhas || 'membro deveria alterar o próprio nome'; end if;
  total := total + 1;
  begin
    insert into public.colunas (quadro, nome) values ('tarefas', 'Coluna de teste');
    falhas := falhas || 'membro não deveria criar coluna';
  exception when insufficient_privilege then null;
  end;
  total := total + 1;
  update public.colunas set nome = 'Alterada' where id = ct;
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas || 'membro não deveria alterar coluna'; end if;

  perform set_config('request.jwt.claims', jadm, true);
  total := total + 1;
  begin
    update public.perfis set ativo = false where id = uadm;
    falhas := falhas || 'admin não deveria alterar o próprio acesso';
  exception when raise_exception then
    if sqlerrm not like 'Você não pode alterar o próprio%' then falhas := falhas || ('acesso próprio do admin, erro inesperado: ' || sqlerrm); end if;
  end;
  total := total + 1;
  update public.perfis set ativo = true where id = ui;
  get diagnostics n = row_count;
  if n <> 1 then falhas := falhas || 'admin deveria liberar o acesso de outro usuário'; end if;
  update public.perfis set ativo = false where id = ui;

  -- ---------- Projetos: quem vê e quem altera ----------
  perform set_config('request.jwt.claims', ja, true);
  insert into public.projetos (id, titulo, coluna_id, responsavel_id) values (p1, 'Projeto de teste', cp, ua);
  insert into public.projeto_membros (projeto_id, usuario_id) values (p1, ub);
  total := total + 1;
  select count(*) into n from public.projetos where id = p1 and criado_por = ua;
  if n <> 1 then falhas := falhas || 'responsável deveria ver o projeto, com ele como criador'; end if;

  perform set_config('request.jwt.claims', jb, true);
  total := total + 1;
  select count(*) into n from public.projetos where id = p1;
  if n <> 1 then falhas := falhas || 'participante deveria ver o projeto'; end if;
  total := total + 1;
  update public.projetos set titulo = 'Projeto alterado por B' where id = p1;
  get diagnostics n = row_count;
  if n <> 1 then falhas := falhas || 'participante deveria alterar o projeto'; end if;
  total := total + 1;
  begin
    update public.projetos set responsavel_id = ub where id = p1;
    falhas := falhas || 'participante não deveria trocar o responsável do projeto';
  exception when raise_exception then
    if sqlerrm not like 'Somente o responsável pode trocar%' then falhas := falhas || ('troca de responsável, erro inesperado: ' || sqlerrm); end if;
  end;
  total := total + 1;
  begin
    insert into public.projeto_membros (projeto_id, usuario_id) values (p1, uc);
    falhas := falhas || 'participante não deveria definir a equipe do projeto';
  exception when insufficient_privilege then null;
  end;
  total := total + 1;
  begin
    update public.projetos set coluna_id = cpc where id = p1;
    falhas := falhas || 'participante não deveria concluir o projeto';
  exception when raise_exception then
    if sqlerrm not like 'Somente o responsável pode concluir ou reabrir o projeto%' then falhas := falhas || ('conclusão de projeto, erro inesperado: ' || sqlerrm); end if;
  end;
  total := total + 1;
  begin
    update public.projetos set coluna_id = ct where id = p1;
    falhas := falhas || 'projeto não deveria ir para coluna do quadro de tarefas';
  exception when raise_exception then
    if sqlerrm not like 'A coluna escolhida não pertence%' then falhas := falhas || ('coluna de outro quadro, erro inesperado: ' || sqlerrm); end if;
  end;

  perform set_config('request.jwt.claims', jc, true);
  total := total + 1;
  select count(*) into n from public.projetos where id = p1;
  if n <> 0 then falhas := falhas || 'quem não está no projeto não deveria vê-lo'; end if;
  total := total + 1;
  update public.projetos set titulo = 'Invadido' where id = p1;
  get diagnostics n = row_count;
  if n <> 0 then falhas := falhas || 'quem não está no projeto não deveria alterá-lo'; end if;
  total := total + 1;
  select count(*) into n from public.projeto_membros where projeto_id = p1;
  if n <> 0 then falhas := falhas || 'quem não está no projeto não deveria ver a equipe'; end if;

  perform set_config('request.jwt.claims', jadm, true);
  total := total + 1;
  select count(*) into n from public.projetos where id = p1;
  if n <> 0 then falhas := falhas || 'admin não deveria ver projeto dos outros fora da lixeira'; end if;

  perform set_config('request.jwt.claims', ja, true);
  total := total + 1;
  select count(*) into n from public.projetos where id = p1 and atualizado_por = ub;
  if n <> 1 then falhas := falhas || 'histórico deveria registrar B como autor da última alteração'; end if;
  total := total + 1;
  update public.projetos set coluna_id = cpc where id = p1;
  get diagnostics n = row_count;
  if n <> 1 then falhas := falhas || 'responsável deveria concluir o projeto'; end if;
  update public.projetos set coluna_id = cp where id = p1;

  -- ---------- Tarefas de projeto ----------
  insert into public.tarefas (id, titulo, projeto_id, coluna_id, responsavel_id, prazo)
  values (t1, 'Tarefa do projeto', p1, ct, ub, current_date);

  perform set_config('request.jwt.claims', jc, true);
  total := total + 1;
  begin
    insert into public.tarefas (titulo, projeto_id, coluna_id, responsavel_id, prazo)
    values ('Intrusa', p1, ct, uc, current_date);
    falhas := falhas || 'quem não está no projeto não deveria criar tarefa nele';
  exception when insufficient_privilege then null;
  end;
  total := total + 1;
  select count(*) into n from public.tarefas where id = t1;
  if n <> 0 then falhas := falhas || 'quem não está no projeto não deveria ver as tarefas dele'; end if;

  perform set_config('request.jwt.claims', jadm, true);
  total := total + 1;
  select count(*) into n from public.tarefas where id = t1;
  if n <> 0 then falhas := falhas || 'admin não deveria ver tarefa de projeto dos outros fora da lixeira'; end if;

  perform set_config('request.jwt.claims', ja, true);
  total := total + 1;
  begin
    update public.tarefas set concluida_em = now() where id = t1;
    falhas := falhas || 'quem não é responsável pela tarefa não deveria concluí-la';
  exception when raise_exception then
    if sqlerrm not like 'Somente o responsável pode concluir ou reabrir a tarefa%' then falhas := falhas || ('conclusão de tarefa, erro inesperado: ' || sqlerrm); end if;
  end;
  total := total + 1;
  begin
    update public.tarefas set coluna_id = ctc where id = t1;
    falhas := falhas || 'quem não é responsável não deveria concluir arrastando para a coluna concluída';
  exception when raise_exception then
    if sqlerrm not like 'Somente o responsável pode concluir ou reabrir a tarefa%' then falhas := falhas || ('conclusão por arrasto, erro inesperado: ' || sqlerrm); end if;
  end;
  total := total + 1;
  update public.tarefas set titulo = 'Tarefa alterada por A' where id = t1;
  get diagnostics n = row_count;
  if n <> 1 then falhas := falhas || 'quem acessa o projeto deveria alterar a tarefa'; end if;

  perform set_config('request.jwt.claims', jb, true);
  total := total + 1;
  update public.tarefas set concluida_em = '2000-01-01' where id = t1;
  select count(*) into n from public.tarefas
   where id = t1 and concluida_por = ub and coluna_id = ctc and concluida_em > now() - interval '1 minute';
  if n <> 1 then falhas := falhas || 'concluir deveria registrar autor, data do banco e levar o cartão para a coluna concluída'; end if;

  perform set_config('request.jwt.claims', ja, true);
  total := total + 1;
  begin
    update public.tarefas set coluna_id = ct where id = t1;
    falhas := falhas || 'quem não é responsável não deveria reabrir a tarefa';
  exception when raise_exception then
    if sqlerrm not like 'Somente o responsável pode concluir ou reabrir a tarefa%' then falhas := falhas || ('reabertura, erro inesperado: ' || sqlerrm); end if;
  end;

  perform set_config('request.jwt.claims', jb, true);
  total := total + 1;
  update public.tarefas set coluna_id = ct where id = t1;
  select count(*) into n from public.tarefas where id = t1 and concluida_em is null and concluida_por is null;
  if n <> 1 then falhas := falhas || 'tirar o cartão da coluna concluída deveria reabrir a tarefa'; end if;
  total := total + 1;
  update public.tarefas set coluna_id = ctc where id = t1;
  select count(*) into n from public.tarefas where id = t1 and concluida_em is not null and concluida_por = ub;
  if n <> 1 then falhas := falhas || 'arrastar para a coluna concluída deveria concluir a tarefa'; end if;
  total := total + 1;
  begin
    update public.tarefas set coluna_id = cp where id = t1;
    falhas := falhas || 'tarefa não deveria ir para coluna do quadro de projetos';
  exception when raise_exception then
    if sqlerrm not like 'A coluna escolhida não pertence%' then falhas := falhas || ('coluna de outro quadro (tarefa), erro inesperado: ' || sqlerrm); end if;
  end;

  -- ---------- Tarefas avulsas ----------
  perform set_config('request.jwt.claims', ja, true);
  insert into public.tarefas (id, titulo, coluna_id, responsavel_id, prazo) values (t2, 'Avulsa de A para B', ct, ub, current_date);
  insert into public.tarefas (id, titulo, coluna_id, responsavel_id, prazo) values (t3, 'Avulsa de A', ct, ua, current_date);
  total := total + 1;
  select count(*) into n from public.tarefas where id in (t2, t3);
  if n <> 2 then falhas := falhas || 'quem criou deveria ver as tarefas avulsas'; end if;

  perform set_config('request.jwt.claims', jb, true);
  total := total + 1;
  select count(*) into n from public.tarefas where id in (t2, t3);
  if n <> 1 then falhas := falhas || 'responsável deveria ver só a tarefa avulsa que é dele'; end if;

  perform set_config('request.jwt.claims', jc, true);
  total := total + 1;
  select count(*) into n from public.tarefas where id in (t2, t3);
  if n <> 0 then falhas := falhas || 'terceiro não deveria ver tarefa avulsa'; end if;

  perform set_config('request.jwt.claims', jadm, true);
  total := total + 1;
  select count(*) into n from public.tarefas where id in (t2, t3);
  if n <> 0 then falhas := falhas || 'admin não deveria ver tarefa avulsa dos outros'; end if;

  -- ---------- Lixeira ----------
  perform set_config('request.jwt.claims', jb, true);
  total := total + 1;
  begin
    update public.projetos set arquivado_em = now() where id = p1;
    falhas := falhas || 'participante não deveria excluir o projeto';
  exception when raise_exception then
    if sqlerrm not like 'Somente o responsável pode excluir ou restaurar%' then falhas := falhas || ('exclusão de projeto, erro inesperado: ' || sqlerrm); end if;
  end;

  perform set_config('request.jwt.claims', ja, true);
  total := total + 1;
  begin
    update public.tarefas set arquivado_em = now() where id = t1;
    falhas := falhas || 'quem não é responsável não deveria excluir a tarefa';
  exception when raise_exception then
    if sqlerrm not like 'Somente o responsável pode excluir ou restaurar%' then falhas := falhas || ('exclusão de tarefa, erro inesperado: ' || sqlerrm); end if;
  end;

  perform set_config('request.jwt.claims', jb, true);
  total := total + 1;
  update public.tarefas set arquivado_em = '2000-01-01' where id = t1;
  select count(*) into n from public.tarefas where id = t1 and arquivado_por = ub and arquivado_em > now() - interval '1 minute';
  if n <> 1 then falhas := falhas || 'excluir deveria registrar autor e data do banco'; end if;

  perform set_config('request.jwt.claims', jc, true);
  total := total + 1;
  begin
    perform public.restaurar_item('tarefas', t1);
    falhas := falhas || 'terceiro não deveria restaurar tarefa';
  exception when raise_exception then
    if sqlerrm not like 'Você não pode restaurar%' then falhas := falhas || ('restauração por terceiro, erro inesperado: ' || sqlerrm); end if;
  end;

  perform set_config('request.jwt.claims', jadm, true);
  total := total + 1;
  select count(*) into n from public.tarefas where id = t1;
  if n <> 1 then falhas := falhas || 'admin deveria ver tarefa de projeto na lixeira'; end if;
  total := total + 1;
  begin
    perform public.restaurar_item('tarefas', t1);
  exception when raise_exception then
    falhas := falhas || ('admin deveria restaurar tarefa de projeto: ' || sqlerrm);
  end;
  total := total + 1;
  begin
    perform public.restaurar_item('outra', t1);
    falhas := falhas || 'restauração deveria recusar tipo desconhecido';
  exception when raise_exception then
    if sqlerrm not like 'Tipo de item desconhecido%' then falhas := falhas || ('tipo desconhecido, erro inesperado: ' || sqlerrm); end if;
  end;

  perform set_config('request.jwt.claims', jb, true);
  total := total + 1;
  select count(*) into n from public.tarefas where id = t1 and arquivado_em is null and arquivado_por is null;
  if n <> 1 then falhas := falhas || 'tarefa restaurada deveria sair da lixeira'; end if;
  update public.tarefas set arquivado_em = now() where id = t2;

  perform set_config('request.jwt.claims', jadm, true);
  total := total + 1;
  select count(*) into n from public.tarefas where id = t2;
  if n <> 0 then falhas := falhas || 'admin não deveria ver tarefa avulsa na lixeira'; end if;
  total := total + 1;
  begin
    perform public.restaurar_item('tarefas', t2);
    falhas := falhas || 'admin não deveria restaurar tarefa avulsa dos outros';
  exception when raise_exception then
    if sqlerrm not like 'Você não pode restaurar%' then falhas := falhas || ('restauração de avulsa pelo admin, erro inesperado: ' || sqlerrm); end if;
  end;

  perform set_config('request.jwt.claims', ja, true);
  total := total + 1;
  begin
    perform public.restaurar_item('tarefas', t2);
    falhas := falhas || 'quem criou mas não é responsável não deveria restaurar a tarefa avulsa';
  exception when raise_exception then
    if sqlerrm not like 'Você não pode restaurar%' then falhas := falhas || ('restauração pelo criador, erro inesperado: ' || sqlerrm); end if;
  end;

  perform set_config('request.jwt.claims', jb, true);
  total := total + 1;
  begin
    perform public.restaurar_item('tarefas', t2);
  exception when raise_exception then
    falhas := falhas || ('responsável deveria restaurar a própria tarefa avulsa: ' || sqlerrm);
  end;

  perform set_config('request.jwt.claims', ja, true);
  total := total + 1;
  update public.projetos set arquivado_em = now() where id = p1;
  get diagnostics n = row_count;
  if n <> 1 then falhas := falhas || 'responsável deveria excluir o projeto'; end if;

  perform set_config('request.jwt.claims', jadm, true);
  total := total + 1;
  select count(*) into n from public.projetos where id = p1;
  if n <> 1 then falhas := falhas || 'admin deveria ver projeto na lixeira'; end if;

  perform set_config('request.jwt.claims', jc, true);
  total := total + 1;
  begin
    perform public.restaurar_item('projetos', p1);
    falhas := falhas || 'terceiro não deveria restaurar projeto';
  exception when raise_exception then
    if sqlerrm not like 'Você não pode restaurar%' then falhas := falhas || ('restauração de projeto por terceiro, erro inesperado: ' || sqlerrm); end if;
  end;

  perform set_config('request.jwt.claims', ja, true);
  total := total + 1;
  begin
    perform public.restaurar_item('projetos', p1);
  exception when raise_exception then
    falhas := falhas || ('responsável deveria restaurar o próprio projeto: ' || sqlerrm);
  end;

  -- ---------- Prazo de 30 dias da lixeira ----------
  perform set_config('request.jwt.claims', jb, true);
  update public.tarefas set arquivado_em = now() where id in (t1, t2);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  -- Envelhece a exclusão em 31 dias. Os gatilhos são pausados só dentro deste teste.
  set local session_replication_role = replica;
  update public.tarefas set arquivado_em = now() - interval '31 days' where id in (t1, t2);
  set local session_replication_role = origin;
  set local role authenticated;

  perform set_config('request.jwt.claims', jb, true);
  total := total + 1;
  begin
    perform public.restaurar_item('tarefas', t2);
    falhas := falhas || 'responsável não deveria restaurar após 30 dias';
  exception when raise_exception then
    if sqlerrm not like 'Você não pode restaurar%' then falhas := falhas || ('restauração após 30 dias, erro inesperado: ' || sqlerrm); end if;
  end;

  -- ---------- Fim: desfaz tudo ----------
  reset role;
  raise exception E'RESULTADO: % verificações, % falhas.%', total, coalesce(array_length(falhas, 1), 0),
    case when array_length(falhas, 1) is null then ' Todas as regras se comportaram como esperado.'
         else E'\n - ' || array_to_string(falhas, E'\n - ') end;
end;
$$;
