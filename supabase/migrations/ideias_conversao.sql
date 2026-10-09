-- Etapa I7 das Ideias (09/10/2026): converter a ideia Aprovada em tarefa ou em projeto.
--
-- 1. Só a ideia Aprovada (e fora da lixeira) pode dar origem a tarefa ou a projeto. Até aqui o banco conferia quem
--    convertia e o projeto da tarefa, mas não o status.
-- 2. Função public.origens_das_ideias(): para cada ideia que a pessoa enxerga, quantas tarefas e quantos projetos ela gerou.
--    Conta também o que a pessoa não enxerga (tarefa avulsa de outra pessoa, projeto de que não participa) e o que está
--    na lixeira, sem revelar o nome: a tela mostra "Virou tarefa" ou "Virou projeto" e a ideia segue sem poder ser
--    descartada, como o banco já exige desde a I6. Só devolve números, e só das ideias que a pessoa já enxerga.
--
-- Não apaga nada. O site publicado antes desta etapa não sente a mudança, porque ainda não converte.

create or replace function private.confere_ideia_de_origem()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  quem uuid := (select auth.uid());
  do_projeto uuid;
  situacao text;
begin
  if quem is null or new.ideia_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.ideia_id is not distinct from old.ideia_id then
    return new;
  end if;
  if not exists (
       select 1 from public.ideias i
       where i.id = new.ideia_id
         and ((i.projeto_id is null and i.criado_por = quem)
              or (i.projeto_id is not null and private.acessa_projeto(i.projeto_id)))) then
    raise exception 'Ideia de origem não encontrada.';
  end if;
  select case when i.arquivado_em is null then i.status else 'excluida' end, i.projeto_id
    into situacao, do_projeto
    from public.ideias i where i.id = new.ideia_id;
  if situacao is distinct from 'aprovada' then
    raise exception 'Só uma ideia aprovada pode virar tarefa ou projeto.';
  end if;
  if tg_table_name = 'tarefas' then
    if do_projeto is distinct from new.projeto_id then
      raise exception 'A tarefa criada de uma ideia precisa ficar no mesmo projeto da ideia.';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.origens_das_ideias()
 returns table (ideia_id uuid, tarefas integer, projetos integer)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select i.id,
         (select count(*)::integer from public.tarefas t where t.ideia_id = i.id),
         (select count(*)::integer from public.projetos p where p.ideia_id = i.id)
    from public.ideias i
   where (select private.usuario_ativo())
     and private.ve_ideia(i.id)
     and (exists (select 1 from public.tarefas t where t.ideia_id = i.id)
          or exists (select 1 from public.projetos p where p.ideia_id = i.id));
$function$;

revoke execute on function public.origens_das_ideias() from public, anon;
grant execute on function public.origens_das_ideias() to authenticated;
