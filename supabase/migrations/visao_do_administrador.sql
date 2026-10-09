-- Takt: visão do administrador (09/10/2026).
--
-- O administrador passa a VER todos os projetos e tudo o que é vinculado a eles (tarefas, ideias,
-- comentários, apoios e a lista de quem pode ver), em SOMENTE LEITURA: nos projetos de que não faz parte
-- ele não altera, não inclui e não exclui nada. O que é privado continua privado: tarefa avulsa e
-- ideia avulsa não passam por projeto, e por isso não entram nesta regra.
--
-- São duas funções, uma para cada pergunta:
--   private.ve_projeto(id)      quem pode LER: quem participa do projeto e o administrador.
--   private.acessa_projeto(id)  quem pode GRAVAR: só quem participa (responsável e pessoas selecionadas).
--
-- Regra para o que vier: toda tabela nova ligada a projeto usa private.ve_projeto nas regras de leitura
-- (select) e private.acessa_projeto nas de gravação (insert, update, delete). Assim a funcionalidade nova
-- já nasce visível para o administrador, e só para leitura.
--
-- No Supabase esta etapa foi aplicada em duas partes, no mesmo dia: "visao_do_administrador" e
-- "visao_do_administrador_somente_leitura". Este arquivo traz o resultado final das duas.

-- Quem participa do projeto (grava): o responsável e as pessoas selecionadas. Igual ao que era antes desta etapa.
create or replace function private.acessa_projeto(pid uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select exists (
    select 1 from public.projetos p
    where p.id = pid
      and (p.responsavel_id = (select auth.uid())
           or exists (select 1 from public.projeto_membros m
                      where m.projeto_id = p.id and m.usuario_id = (select auth.uid()))));
$function$;

-- Quem enxerga o projeto (lê): quem participa e o administrador.
create or replace function private.ve_projeto(pid uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select (select private.usuario_admin()) or private.acessa_projeto(pid);
$function$;

revoke all on function private.ve_projeto(uuid) from public, anon;
grant execute on function private.ve_projeto(uuid) to authenticated;

-- Regras de leitura: passam a usar ve_projeto. As de gravação não mudam (continuam em acessa_projeto).
alter policy projetos_ver on public.projetos using (
  (select private.usuario_ativo())
  and (responsavel_id = (select auth.uid()) or private.ve_projeto(id)));

alter policy tarefas_ver on public.tarefas using (
  (select private.usuario_ativo())
  and ((projeto_id is not null and private.ve_projeto(projeto_id))
       or (projeto_id is null and (criado_por = (select auth.uid()) or responsavel_id = (select auth.uid())))));

alter policy ideias_ver on public.ideias using (
  (select private.usuario_ativo())
  and ((projeto_id is null and criado_por = (select auth.uid()))
       or (projeto_id is not null and private.ve_projeto(projeto_id))));

alter policy membros_ver on public.projeto_membros using (
  (select private.usuario_ativo())
  and (private.ve_projeto(projeto_id) or private.gerencia_projeto(projeto_id)));

-- Comentários e apoios são lidos por quem enxerga a ideia.
create or replace function private.ve_ideia(iid uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select exists (
    select 1 from public.ideias i
    where i.id = iid
      and ((i.projeto_id is null and i.criado_por = (select auth.uid()))
           or (i.projeto_id is not null and private.ve_projeto(i.projeto_id))));
$function$;

-- Criar tarefa ou projeto a partir de uma ideia é gravar: exige participar do projeto da ideia (ou ser o autor da avulsa).
create or replace function private.confere_ideia_de_origem()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  quem uuid := (select auth.uid());
  do_projeto uuid;
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
  if tg_table_name = 'tarefas' then
    select i.projeto_id into do_projeto from public.ideias i where i.id = new.ideia_id;
    if do_projeto is distinct from new.projeto_id then
      raise exception 'A tarefa criada de uma ideia precisa ficar no mesmo projeto da ideia.';
    end if;
  end if;
  return new;
end;
$function$;

-- Lixeira geral (Configurações): o administrador continua restaurando o que é de projeto, mas não manda para a lixeira.
-- Projetos e tarefas: mandar para a lixeira é só do responsável; o administrador só restaura (item de projeto).
create or replace function private.marca_atualizacao()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  quem uuid := (select auth.uid());
  de_projeto boolean := tg_table_name = 'projetos' or (to_jsonb(old) ->> 'projeto_id') is not null;
begin
  if quem is not null and (new.arquivado_em is null) <> (old.arquivado_em is null) then
    if not (coalesce(old.responsavel_id, old.criado_por) = quem
            or (de_projeto and new.arquivado_em is null and private.usuario_admin())) then
      raise exception 'Somente o responsável pode excluir ou restaurar este item.';
    end if;
  end if;
  if (to_jsonb(new) - 'ordem' - 'atualizado_em' - 'atualizado_por')
     is distinct from (to_jsonb(old) - 'ordem' - 'atualizado_em' - 'atualizado_por') then
    new.atualizado_em := now();
    new.atualizado_por := coalesce(quem, old.atualizado_por);
  else
    new.atualizado_em := old.atualizado_em;
    new.atualizado_por := old.atualizado_por;
  end if;
  if new.arquivado_em is not null and old.arquivado_em is null then
    new.arquivado_em := now();
    new.arquivado_por := quem;
  elsif new.arquivado_em is null then
    new.arquivado_por := null;
  else
    new.arquivado_em := old.arquivado_em;
    new.arquivado_por := old.arquivado_por;
  end if;
  return new;
end;
$function$;

-- Ideias: mandar para a lixeira é só do autor; o administrador só restaura (ideia de projeto).
create or replace function private.protege_ideia()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  quem uuid := (select auth.uid());
  autor boolean;
begin
  if quem is not null then
    autor := old.criado_por is not distinct from quem;
    if new.criado_por is distinct from old.criado_por or new.criado_em is distinct from old.criado_em then
      raise exception 'O autor e a data da ideia não podem ser alterados.';
    end if;
    if new.texto is distinct from old.texto and not autor then
      raise exception 'Somente o autor pode alterar o texto da ideia.';
    end if;
    if new.projeto_id is distinct from old.projeto_id then
      if not autor then
        raise exception 'Somente o autor pode vincular a ideia a um projeto ou desvincular.';
      end if;
      if old.projeto_id is not null and (
           exists (select 1 from public.ideia_comentarios c where c.ideia_id = old.id)
           or exists (select 1 from public.ideia_apoios a where a.ideia_id = old.id)) then
        raise exception 'Esta ideia já recebeu comentário ou apoio e não pode mais sair do projeto.';
      end if;
    end if;
    if new.status is distinct from old.status
       and not (autor or (old.projeto_id is not null and private.responde_pelo_projeto(old.projeto_id))) then
      raise exception 'Somente o autor ou o responsável pelo projeto pode mudar o status da ideia.';
    end if;
    if (new.arquivado_em is null) <> (old.arquivado_em is null)
       and not (autor or (old.projeto_id is not null and new.arquivado_em is null and private.usuario_admin())) then
      raise exception 'Somente o autor pode excluir ou restaurar a ideia.';
    end if;
  end if;

  if (to_jsonb(new) - 'atualizado_em' - 'atualizado_por')
     is distinct from (to_jsonb(old) - 'atualizado_em' - 'atualizado_por') then
    new.atualizado_em := now();
    new.atualizado_por := coalesce(quem, old.atualizado_por);
  else
    new.atualizado_em := old.atualizado_em;
    new.atualizado_por := old.atualizado_por;
  end if;
  if new.arquivado_em is not null and old.arquivado_em is null then
    new.arquivado_em := now();
    new.arquivado_por := quem;
  elsif new.arquivado_em is null then
    new.arquivado_por := null;
  else
    new.arquivado_em := old.arquivado_em;
    new.arquivado_por := old.arquivado_por;
  end if;
  return new;
end;
$function$;
