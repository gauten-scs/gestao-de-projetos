-- Quarta etapa da estrutura do banco: conclusão de tarefas, exclusão só pelo responsável e lixeira do usuário.
-- Cópia de segurança do que já está aplicado no Supabase. Não é preciso rodar de novo.

-- 1. Tarefa concluída passa a ser uma marca própria (antes dependia da coluna).
alter table public.tarefas
  add column if not exists concluida_em timestamptz,
  add column if not exists concluida_por uuid references public.perfis(id) on delete set null;
create index if not exists tarefas_concluida_por_idx on public.tarefas (concluida_por);

-- 2. Histórico e lixeira. Só o responsável exclui ou restaura; o admin restaura itens de projeto.
create or replace function private.marca_atualizacao() returns trigger
language plpgsql set search_path = '' as $$
declare
  quem uuid := (select auth.uid());
  de_projeto boolean := tg_table_name = 'projetos' or (to_jsonb(old) ->> 'projeto_id') is not null;
begin
  if quem is not null and (new.arquivado_em is null) <> (old.arquivado_em is null) then
    if not (coalesce(old.responsavel_id, old.criado_por) = quem or (de_projeto and private.usuario_admin())) then
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
$$;

-- 3. Data e autor da conclusão são definidos pelo banco.
create or replace function private.marca_conclusao() returns trigger
language plpgsql set search_path = '' as $$
declare
  quem uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if new.concluida_em is not null then new.concluida_em := now(); new.concluida_por := quem; else new.concluida_por := null; end if;
  elsif new.concluida_em is not null and old.concluida_em is null then
    new.concluida_em := now(); new.concluida_por := quem;
  elsif new.concluida_em is null then
    new.concluida_por := null;
  else
    new.concluida_em := old.concluida_em; new.concluida_por := old.concluida_por;
  end if;
  return new;
end;
$$;
create trigger marca_conclusao before insert or update on public.tarefas
for each row execute function private.marca_conclusao();

-- 4. Tarefas que estavam em coluna "concluída" viram tarefas concluídas; as colunas de tarefas deixam de ter essa marca.
alter table public.tarefas disable trigger marca_conclusao;
update public.tarefas t set concluida_em = t.atualizado_em, concluida_por = t.atualizado_por
  from public.colunas c where c.id = t.coluna_id and c.concluida and t.concluida_em is null;
alter table public.tarefas enable trigger marca_conclusao;
update public.colunas set concluida = false where quadro = 'tarefas';

-- 5. Admin não enxerga tarefas avulsas excluídas; só itens de projeto.
alter policy tarefas_ver on public.tarefas using (
  (select private.usuario_ativo()) and (
    (projeto_id is not null and private.acessa_projeto(projeto_id))
    or (projeto_id is null and (criado_por = (select auth.uid()) or responsavel_id = (select auth.uid())))
    or ((select private.usuario_admin()) and arquivado_em is not null and projeto_id is not null)));
alter policy tarefas_excluir on public.tarefas
  using ((select private.usuario_admin()) and arquivado_em is not null and projeto_id is not null);

-- 6. Restaurar da lixeira: o responsável (até 30 dias) ou o admin (itens de projeto).
create or replace function public.restaurar_item(tabela text, item uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  quem uuid := (select auth.uid());
  adm boolean := private.usuario_admin();
  n integer;
begin
  if not private.usuario_ativo() then
    raise exception 'Sem acesso.';
  end if;
  if tabela = 'projetos' then
    update public.projetos set arquivado_em = null
     where id = item and arquivado_em is not null
       and (adm or (responsavel_id = quem and arquivado_em > now() - interval '30 days'));
  elsif tabela = 'tarefas' then
    update public.tarefas set arquivado_em = null
     where id = item and arquivado_em is not null
       and ((adm and projeto_id is not null) or (responsavel_id = quem and arquivado_em > now() - interval '30 days'));
  else
    raise exception 'Tipo de item desconhecido.';
  end if;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Você não pode restaurar este item.';
  end if;
end;
$$;
