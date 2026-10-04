-- Terceira etapa da estrutura do banco: quem pode ver cada projeto e cada tarefa.
-- Cópia de segurança do que já está aplicado no Supabase. Não é preciso rodar de novo.
--
-- Regras:
--   Projeto: visto pelo responsável e pelos usuários selecionados. Todos eles podem alterar.
--   Tarefa de projeto: vista por quem acessa o projeto.
--   Tarefa avulsa: vista por quem criou e pelo responsável.
--   Administrador: segue as mesmas regras; além disso vê os itens da lixeira para restaurar ou excluir de vez.

create table if not exists public.projeto_membros (
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  usuario_id uuid not null references public.perfis(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (projeto_id, usuario_id)
);
create index if not exists projeto_membros_usuario_idx on public.projeto_membros (usuario_id);
alter table public.projeto_membros enable row level security;
revoke all on public.projeto_membros from anon;
grant select, insert, delete on public.projeto_membros to authenticated;

update public.projetos set responsavel_id = criado_por where responsavel_id is null;
update public.tarefas set responsavel_id = criado_por where responsavel_id is null;

create or replace function private.acessa_projeto(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projetos p
    where p.id = pid
      and (p.responsavel_id = (select auth.uid())
           or exists (select 1 from public.projeto_membros m
                      where m.projeto_id = p.id and m.usuario_id = (select auth.uid()))));
$$;

-- Quem define os usuários do projeto: o responsável (e quem criou, para conseguir montar a equipe na criação).
create or replace function private.gerencia_projeto(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projetos p
    where p.id = pid and (p.responsavel_id = (select auth.uid()) or p.criado_por = (select auth.uid())));
$$;

revoke all on function private.acessa_projeto(uuid), private.gerencia_projeto(uuid) from public, anon;
grant execute on function private.acessa_projeto(uuid), private.gerencia_projeto(uuid) to authenticated;

-- Projetos
alter policy projetos_ver on public.projetos using (
  (select private.usuario_ativo()) and (
    responsavel_id = (select auth.uid())
    or private.acessa_projeto(id)
    or ((select private.usuario_admin()) and arquivado_em is not null)));
alter policy projetos_alterar on public.projetos
  using ((select private.usuario_ativo()) and (responsavel_id = (select auth.uid()) or private.acessa_projeto(id)))
  with check ((select private.usuario_ativo()));
alter policy projetos_excluir on public.projetos
  using ((select private.usuario_admin()) and arquivado_em is not null);

-- Tarefas
alter policy tarefas_ver on public.tarefas using (
  (select private.usuario_ativo()) and (
    (projeto_id is not null and private.acessa_projeto(projeto_id))
    or (projeto_id is null and (criado_por = (select auth.uid()) or responsavel_id = (select auth.uid())))
    or ((select private.usuario_admin()) and arquivado_em is not null)));
alter policy tarefas_incluir on public.tarefas
  with check ((select private.usuario_ativo()) and (projeto_id is null or private.acessa_projeto(projeto_id)));
alter policy tarefas_alterar on public.tarefas
  using ((select private.usuario_ativo()) and (
    (projeto_id is not null and private.acessa_projeto(projeto_id))
    or (projeto_id is null and (criado_por = (select auth.uid()) or responsavel_id = (select auth.uid())))))
  with check ((select private.usuario_ativo()) and (projeto_id is null or private.acessa_projeto(projeto_id)));
alter policy tarefas_excluir on public.tarefas
  using ((select private.usuario_admin()) and arquivado_em is not null);

-- Usuários do projeto
create policy membros_ver on public.projeto_membros for select to authenticated
  using ((select private.usuario_ativo()) and (private.acessa_projeto(projeto_id) or private.gerencia_projeto(projeto_id)));
create policy membros_incluir on public.projeto_membros for insert to authenticated
  with check ((select private.usuario_ativo()) and private.gerencia_projeto(projeto_id));
create policy membros_excluir on public.projeto_membros for delete to authenticated
  using ((select private.usuario_ativo()) and private.gerencia_projeto(projeto_id));

-- Só o responsável atual passa a responsabilidade do projeto para outra pessoa.
create or replace function private.protege_projeto() returns trigger
language plpgsql set search_path = '' as $$
declare
  quem uuid := (select auth.uid());
begin
  if quem is not null and old.responsavel_id is not null
     and new.responsavel_id is distinct from old.responsavel_id and old.responsavel_id <> quem then
    raise exception 'Somente o responsável pode trocar o responsável do projeto.';
  end if;
  return new;
end;
$$;
create trigger protege_projeto before update of responsavel_id on public.projetos
for each row execute function private.protege_projeto();

-- Restauração da lixeira, só pelo administrador.
create or replace function public.restaurar_item(tabela text, item uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.usuario_admin() then
    raise exception 'Somente o administrador pode restaurar itens da lixeira.';
  end if;
  if tabela = 'projetos' then
    update public.projetos set arquivado_em = null where id = item;
  elsif tabela = 'tarefas' then
    update public.tarefas set arquivado_em = null where id = item;
  else
    raise exception 'Tipo de item desconhecido.';
  end if;
end;
$$;
revoke all on function public.restaurar_item(text, uuid) from public, anon;
grant execute on function public.restaurar_item(text, uuid) to authenticated;

alter publication supabase_realtime add table public.projeto_membros;
