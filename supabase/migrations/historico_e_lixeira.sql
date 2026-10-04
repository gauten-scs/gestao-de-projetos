-- Segunda etapa da estrutura do banco: histórico de alterações e lixeira.
-- Cópia de segurança do que já está aplicado no Supabase. Não é preciso rodar de novo.

-- 1. Todo usuário novo nasce sem acesso. Só a função de convites libera.
create or replace function private.novo_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfis (id, nome, email, papel, ativo)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''), coalesce(new.email, ''), 'membro', false);
  return new;
end;
$$;

-- 2. Histórico: quem alterou por último, e lixeira (arquivamento em vez de exclusão).
alter table public.projetos
  add column if not exists atualizado_por uuid default auth.uid() references public.perfis(id) on delete set null,
  add column if not exists arquivado_em timestamptz,
  add column if not exists arquivado_por uuid references public.perfis(id) on delete set null;
alter table public.tarefas
  add column if not exists atualizado_por uuid default auth.uid() references public.perfis(id) on delete set null,
  add column if not exists arquivado_em timestamptz,
  add column if not exists arquivado_por uuid references public.perfis(id) on delete set null;

update public.projetos set atualizado_por = criado_por where atualizado_por is null;
update public.tarefas set atualizado_por = criado_por where atualizado_por is null;

create index if not exists projetos_atualizado_por_idx on public.projetos (atualizado_por);
create index if not exists projetos_arquivado_por_idx on public.projetos (arquivado_por);
create index if not exists tarefas_atualizado_por_idx on public.tarefas (atualizado_por);
create index if not exists tarefas_arquivado_por_idx on public.tarefas (arquivado_por);

-- Registra autor e data da última alteração. Só reordenar cartões dentro da coluna não conta.
-- As datas e os autores são definidos aqui, no banco, e não podem ser forjados pelo site.
create or replace function private.marca_atualizacao() returns trigger
language plpgsql set search_path = '' as $$
declare
  quem uuid := (select auth.uid());
begin
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

-- 3. Exclusão definitiva só pelo administrador. Os demais enviam para a lixeira.
alter policy projetos_excluir on public.projetos using ((select private.usuario_admin()));
alter policy tarefas_excluir on public.tarefas using ((select private.usuario_admin()));
