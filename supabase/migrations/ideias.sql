-- Sétima etapa da estrutura do banco: ideias.
-- Cópia de segurança do que já está aplicado no Supabase. Não é preciso rodar de novo.
--
-- Regras:
--   Ideia de projeto: vista por quem acessa o projeto.
--   Ideia avulsa (sem projeto): vista só por quem criou. Pode ser vinculada a um projeto depois.
--   Só o autor altera o texto, vincula, desvincula e exclui a ideia.
--   Ideia de projeto que já recebeu comentário ou apoio não muda mais de projeto nem volta a ser avulsa.
--   Status: alterado pelo autor ou pelo responsável do projeto.
--   Comentários e apoios: só em ideia de projeto, por quem acessa o projeto.
--   Tarefas e projetos guardam a ideia de origem (ideia_id).
--   Exclusão vai para a lixeira por 30 dias, como projetos e tarefas.

-- 1. Tabelas
create table if not exists public.ideias (
  id uuid primary key default gen_random_uuid(),
  texto text not null check (length(trim(texto)) > 0),
  projeto_id uuid references public.projetos(id) on delete cascade,
  status text not null default 'nova' check (status in ('nova', 'em_analise', 'aprovada', 'descartada')),
  criado_por uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references public.perfis(id) on delete set null,
  arquivado_em timestamptz,
  arquivado_por uuid references public.perfis(id) on delete set null
);
create index if not exists ideias_projeto_idx on public.ideias (projeto_id);
create index if not exists ideias_criado_por_idx on public.ideias (criado_por);
create index if not exists ideias_atualizado_por_idx on public.ideias (atualizado_por);
create index if not exists ideias_arquivado_por_idx on public.ideias (arquivado_por);

create table if not exists public.ideia_comentarios (
  id uuid primary key default gen_random_uuid(),
  ideia_id uuid not null references public.ideias(id) on delete cascade,
  texto text not null check (length(trim(texto)) > 0),
  criado_por uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists ideia_comentarios_ideia_idx on public.ideia_comentarios (ideia_id);
create index if not exists ideia_comentarios_criado_por_idx on public.ideia_comentarios (criado_por);

create table if not exists public.ideia_apoios (
  ideia_id uuid not null references public.ideias(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (ideia_id, usuario_id)
);
create index if not exists ideia_apoios_usuario_idx on public.ideia_apoios (usuario_id);

-- Ideia de origem da tarefa e do projeto.
alter table public.tarefas add column if not exists ideia_id uuid references public.ideias(id) on delete set null;
alter table public.projetos add column if not exists ideia_id uuid references public.ideias(id) on delete set null;
create index if not exists tarefas_ideia_idx on public.tarefas (ideia_id);
create index if not exists projetos_ideia_idx on public.projetos (ideia_id);

alter table public.ideias enable row level security;
alter table public.ideia_comentarios enable row level security;
alter table public.ideia_apoios enable row level security;
revoke all on public.ideias, public.ideia_comentarios, public.ideia_apoios from anon, authenticated;
grant select, insert, update on public.ideias to authenticated;
grant select, insert, delete on public.ideia_comentarios to authenticated;
grant select, insert, delete on public.ideia_apoios to authenticated;

-- 2. Funções de apoio às regras
-- A pessoa enxerga a ideia?
create or replace function private.ve_ideia(iid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ideias i
    where i.id = iid
      and ((i.projeto_id is null and i.criado_por = (select auth.uid()))
           or (i.projeto_id is not null and private.acessa_projeto(i.projeto_id))));
$$;

-- A ideia aceita comentário e apoio da pessoa? (ideia de projeto, fora da lixeira, de projeto que ela acessa)
create or replace function private.participa_da_ideia(iid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ideias i
    where i.id = iid and i.arquivado_em is null
      and i.projeto_id is not null and private.acessa_projeto(i.projeto_id));
$$;

-- A pessoa é a responsável pelo projeto?
create or replace function private.responde_pelo_projeto(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projetos p where p.id = pid and p.responsavel_id = (select auth.uid()));
$$;

revoke all on function private.ve_ideia(uuid), private.participa_da_ideia(uuid), private.responde_pelo_projeto(uuid) from public, anon;
grant execute on function private.ve_ideia(uuid), private.participa_da_ideia(uuid), private.responde_pelo_projeto(uuid) to authenticated;

-- 3. Regras de acesso
create policy ideias_ver on public.ideias for select to authenticated using (
  (select private.usuario_ativo()) and (
    (projeto_id is null and criado_por = (select auth.uid()))
    or (projeto_id is not null and private.acessa_projeto(projeto_id))
    or ((select private.usuario_admin()) and arquivado_em is not null and projeto_id is not null)));
create policy ideias_incluir on public.ideias for insert to authenticated with check (
  (select private.usuario_ativo()) and criado_por = (select auth.uid())
  and (projeto_id is null or private.acessa_projeto(projeto_id)));
create policy ideias_alterar on public.ideias for update to authenticated
  using ((select private.usuario_ativo()) and (
    criado_por = (select auth.uid())
    or (projeto_id is not null and private.responde_pelo_projeto(projeto_id))))
  with check ((select private.usuario_ativo()) and (projeto_id is null or private.acessa_projeto(projeto_id)));
-- Exclusão definitiva: só pelo administrador, de ideia de projeto que está na lixeira.
create policy ideias_excluir on public.ideias for delete to authenticated
  using ((select private.usuario_admin()) and arquivado_em is not null and projeto_id is not null);
grant delete on public.ideias to authenticated;

create policy ideia_comentarios_ver on public.ideia_comentarios for select to authenticated
  using ((select private.usuario_ativo()) and private.ve_ideia(ideia_id));
create policy ideia_comentarios_incluir on public.ideia_comentarios for insert to authenticated
  with check ((select private.usuario_ativo()) and criado_por = (select auth.uid()) and private.participa_da_ideia(ideia_id));
create policy ideia_comentarios_excluir on public.ideia_comentarios for delete to authenticated
  using ((select private.usuario_ativo()) and criado_por = (select auth.uid()));

create policy ideia_apoios_ver on public.ideia_apoios for select to authenticated
  using ((select private.usuario_ativo()) and private.ve_ideia(ideia_id));
create policy ideia_apoios_incluir on public.ideia_apoios for insert to authenticated
  with check ((select private.usuario_ativo()) and usuario_id = (select auth.uid()) and private.participa_da_ideia(ideia_id));
create policy ideia_apoios_excluir on public.ideia_apoios for delete to authenticated
  using ((select private.usuario_ativo()) and usuario_id = (select auth.uid()));

-- 4. Gatilhos
-- Autor e datas da ideia são definidos pelo banco.
create or replace function private.nasce_ideia() returns trigger
language plpgsql set search_path = '' as $$
declare
  quem uuid := (select auth.uid());
begin
  if quem is not null then
    new.criado_por := quem;
    new.atualizado_por := quem;
  end if;
  new.criado_em := now();
  new.atualizado_em := now();
  new.arquivado_em := null;
  new.arquivado_por := null;
  return new;
end;
$$;
create trigger nasce_ideia before insert on public.ideias
for each row execute function private.nasce_ideia();

-- Quem pode mudar o quê em uma ideia, e o histórico da alteração.
create or replace function private.protege_ideia() returns trigger
language plpgsql security definer set search_path = '' as $$
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
       and not (autor or (old.projeto_id is not null and private.usuario_admin())) then
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
$$;
create trigger protege_ideia before update on public.ideias
for each row execute function private.protege_ideia();

-- A tarefa ou o projeto só aponta para uma ideia que a pessoa enxerga.
-- A tarefa nascida de uma ideia fica no mesmo lugar da ideia: no projeto dela, ou avulsa se a ideia é avulsa.
create or replace function private.confere_ideia_de_origem() returns trigger
language plpgsql security definer set search_path = '' as $$
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
  if not private.ve_ideia(new.ideia_id) then
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
$$;
create trigger confere_ideia_de_origem before insert or update of ideia_id on public.tarefas
for each row execute function private.confere_ideia_de_origem();
create trigger confere_ideia_de_origem before insert or update of ideia_id on public.projetos
for each row execute function private.confere_ideia_de_origem();

revoke all on function private.nasce_ideia(), private.protege_ideia(), private.confere_ideia_de_origem() from public, anon, authenticated;

-- 5. Lixeira: restaurar e limpeza diária passam a incluir as ideias.
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
  elsif tabela = 'ideias' then
    update public.ideias set arquivado_em = null
     where id = item and arquivado_em is not null
       and ((adm and projeto_id is not null) or (criado_por = quem and arquivado_em > now() - interval '30 days'));
  else
    raise exception 'Tipo de item desconhecido.';
  end if;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Você não pode restaurar este item.';
  end if;
end;
$$;

create or replace function private.limpa_lixeira() returns void
language sql security definer set search_path = '' as $$
  delete from public.ideias where arquivado_em < now() - interval '30 days';
  delete from public.tarefas where arquivado_em < now() - interval '30 days';
  delete from public.projetos where arquivado_em < now() - interval '30 days';
$$;
revoke all on function private.limpa_lixeira() from public, anon, authenticated;

-- 6. Atualização em tempo real das telas abertas.
alter publication supabase_realtime add table public.ideias, public.ideia_comentarios, public.ideia_apoios;
