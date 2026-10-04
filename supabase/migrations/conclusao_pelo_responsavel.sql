-- Quinta etapa da estrutura do banco: conclusão só pelo responsável.
-- Cópia de segurança do que já está aplicado no Supabase. Não é preciso rodar de novo.

-- 1. A coluna "Feito" do quadro de tarefas passa a se chamar "Concluído" e volta a contar como concluída.
update public.colunas set nome = 'Concluído', concluida = true where quadro = 'tarefas' and nome = 'Feito';
insert into public.colunas (quadro, nome, ordem, concluida)
select 'tarefas', 'Concluído', coalesce(max(ordem), 0) + 1, true
  from public.colunas where quadro = 'tarefas'
having not exists (select 1 from public.colunas where quadro = 'tarefas' and concluida);

-- 2. Tarefas: concluir e reabrir só pelo responsável. Concluir leva o cartão para a coluna concluída;
--    arrastar o cartão para a coluna concluída conclui; tirar de lá reabre.
create or replace function private.marca_conclusao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  quem uuid := (select auth.uid());
  col_nova boolean;
  col_antiga boolean := false;
  era boolean := false;
  fica boolean;
  destino uuid;
begin
  select coalesce(concluida, false) into col_nova from public.colunas where id = new.coluna_id;
  col_nova := coalesce(col_nova, false);
  if tg_op = 'INSERT' then
    fica := new.concluida_em is not null or col_nova;
  else
    era := old.concluida_em is not null;
    select coalesce(concluida, false) into col_antiga from public.colunas where id = old.coluna_id;
    col_antiga := coalesce(col_antiga, false);
    if (new.concluida_em is null) <> (old.concluida_em is null) then
      fica := new.concluida_em is not null;
    elsif new.coluna_id is distinct from old.coluna_id and col_nova then
      fica := true;
    elsif new.coluna_id is distinct from old.coluna_id and col_antiga then
      fica := false;
    else
      fica := era;
    end if;
    if fica <> era and quem is not null and quem is distinct from coalesce(old.responsavel_id, old.criado_por) then
      raise exception 'Somente o responsável pode concluir ou reabrir a tarefa.';
    end if;
  end if;

  if fica and not era then
    new.concluida_em := now();
    new.concluida_por := quem;
    if not col_nova then
      select id into destino from public.colunas where quadro = 'tarefas' and concluida order by ordem limit 1;
      if destino is not null then new.coluna_id := destino; new.ordem := 0; end if;
    end if;
  elsif not fica and era then
    new.concluida_em := null;
    new.concluida_por := null;
    if col_nova then
      select id into destino from public.colunas where quadro = 'tarefas' and not concluida order by ordem limit 1;
      if destino is not null then new.coluna_id := destino; new.ordem := 0; end if;
    end if;
  elsif fica then
    new.concluida_em := old.concluida_em;
    new.concluida_por := old.concluida_por;
  else
    new.concluida_em := null;
    new.concluida_por := null;
  end if;
  return new;
end;
$$;

-- Tarefas já concluídas vão para a coluna concluída.
update public.tarefas t set coluna_id = c.id
  from (select id from public.colunas where quadro = 'tarefas' and concluida order by ordem limit 1) c
 where t.concluida_em is not null and t.coluna_id <> c.id;

-- 3. Projetos: só o responsável leva o projeto para uma coluna concluída (ou tira de lá).
create or replace function private.protege_conclusao_projeto() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  quem uuid := (select auth.uid());
  nova boolean;
  antiga boolean;
begin
  if quem is null or new.coluna_id is not distinct from old.coluna_id then
    return new;
  end if;
  select coalesce(concluida, false) into nova from public.colunas where id = new.coluna_id;
  select coalesce(concluida, false) into antiga from public.colunas where id = old.coluna_id;
  if coalesce(nova, false) <> coalesce(antiga, false) and quem is distinct from coalesce(old.responsavel_id, old.criado_por) then
    raise exception 'Somente o responsável pode concluir ou reabrir o projeto.';
  end if;
  return new;
end;
$$;
create trigger protege_conclusao_projeto before update of coluna_id on public.projetos
for each row execute function private.protege_conclusao_projeto();

revoke all on function private.marca_conclusao(), private.protege_conclusao_projeto() from public, anon, authenticated;
