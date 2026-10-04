-- Gestão de Projetos do Gauten Smart.GOV: estrutura do banco de dados.
-- Cópia de segurança do que já está aplicado no Supabase. Não é preciso rodar de novo.

create schema if not exists private;

-- ---------- Tabelas ----------
create table public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  email text not null,
  papel text not null default 'membro' check (papel in ('admin','membro')),
  ativo boolean not null default false,
  criado_em timestamptz not null default now()
);

create table public.colunas (
  id uuid primary key default gen_random_uuid(),
  quadro text not null check (quadro in ('projetos','tarefas')),
  nome text not null check (length(trim(nome)) > 0),
  ordem integer not null default 0,
  concluida boolean not null default false,
  criado_em timestamptz not null default now()
);

create table public.projetos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) > 0),
  descricao text not null default '',
  coluna_id uuid not null references public.colunas(id) on delete restrict,
  ordem integer not null default 0,
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta')),
  prazo date,
  responsavel_id uuid references public.perfis(id) on delete set null,
  criado_por uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) > 0),
  descricao text not null default '',
  projeto_id uuid references public.projetos(id) on delete cascade,
  coluna_id uuid not null references public.colunas(id) on delete restrict,
  ordem integer not null default 0,
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta')),
  prazo date,
  responsavel_id uuid references public.perfis(id) on delete set null,
  criado_por uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index on public.colunas (quadro, ordem);
create index on public.projetos (coluna_id, ordem);
create index on public.projetos (responsavel_id);
create index on public.projetos (criado_por);
create index on public.tarefas (coluna_id, ordem);
create index on public.tarefas (projeto_id);
create index on public.tarefas (responsavel_id);
create index on public.tarefas (criado_por);

-- ---------- Funções de apoio (fora do esquema público) ----------
create function private.usuario_ativo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis where id = (select auth.uid()) and ativo);
$$;

create function private.usuario_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis where id = (select auth.uid()) and ativo and papel = 'admin');
$$;

-- Cria o perfil quando um usuário nasce no Auth. Todo perfil nasce SEM acesso.
-- Exceção: o primeiro administrador é quem for criado, já confirmado, pelo painel do Supabase
-- enquanto ainda não existir nenhum administrador ativo.
create function private.novo_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  primeiro boolean;
begin
  primeiro := new.email_confirmed_at is not null
    and not exists (select 1 from public.perfis where papel = 'admin' and ativo);
  insert into public.perfis (id, nome, email, papel, ativo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    coalesce(new.email, ''),
    case when primeiro then 'admin' else 'membro' end,
    primeiro
  );
  return new;
end;
$$;

create trigger ao_criar_usuario after insert on auth.users
for each row execute function private.novo_usuario();

-- Impede que alguém mude papel ou acesso sem ser admin, ou mude o próprio.
create function private.protege_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return new; -- chamadas internas (função de convites, painel)
  end if;
  if new.id <> old.id or new.email <> old.email then
    raise exception 'Não é permitido alterar o identificador ou o e-mail.';
  end if;
  if new.papel <> old.papel or new.ativo <> old.ativo then
    if not private.usuario_admin() then
      raise exception 'Somente o administrador pode alterar papel ou acesso.';
    end if;
    if old.id = (select auth.uid()) then
      raise exception 'Você não pode alterar o próprio papel ou acesso.';
    end if;
  end if;
  return new;
end;
$$;

create trigger protege_perfil before update on public.perfis
for each row execute function private.protege_perfil();

-- Garante que o cartão está em uma coluna do quadro certo.
create function private.confere_quadro() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.colunas where id = new.coluna_id and quadro = tg_argv[0]) then
    raise exception 'A coluna escolhida não pertence a este quadro.';
  end if;
  return new;
end;
$$;

create trigger confere_quadro before insert or update of coluna_id on public.projetos
for each row execute function private.confere_quadro('projetos');
create trigger confere_quadro before insert or update of coluna_id on public.tarefas
for each row execute function private.confere_quadro('tarefas');

create function private.marca_atualizacao() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger marca_atualizacao before update on public.projetos
for each row execute function private.marca_atualizacao();
create trigger marca_atualizacao before update on public.tarefas
for each row execute function private.marca_atualizacao();

-- ---------- Permissões ----------
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon;
grant execute on function private.usuario_ativo(), private.usuario_admin() to authenticated;

revoke all on public.perfis, public.colunas, public.projetos, public.tarefas from anon;
grant select, update on public.perfis to authenticated;
grant select, insert, update, delete on public.colunas, public.projetos, public.tarefas to authenticated;

alter table public.perfis enable row level security;
alter table public.colunas enable row level security;
alter table public.projetos enable row level security;
alter table public.tarefas enable row level security;

-- Perfis: quem tem acesso vê todos; cada um vê o próprio. Admin altera todos; cada um altera o próprio nome.
create policy perfis_ver on public.perfis for select to authenticated
  using ((select private.usuario_ativo()) or id = (select auth.uid()));
create policy perfis_alterar on public.perfis for update to authenticated
  using ((select private.usuario_admin()) or (id = (select auth.uid()) and (select private.usuario_ativo())))
  with check ((select private.usuario_admin()) or (id = (select auth.uid()) and (select private.usuario_ativo())));

-- Colunas (configurações): todos com acesso veem; só admin altera.
create policy colunas_ver on public.colunas for select to authenticated
  using ((select private.usuario_ativo()));
create policy colunas_incluir on public.colunas for insert to authenticated
  with check ((select private.usuario_admin()));
create policy colunas_alterar on public.colunas for update to authenticated
  using ((select private.usuario_admin())) with check ((select private.usuario_admin()));
create policy colunas_excluir on public.colunas for delete to authenticated
  using ((select private.usuario_admin()));

-- Projetos e tarefas: qualquer usuário com acesso faz tudo.
create policy projetos_ver on public.projetos for select to authenticated using ((select private.usuario_ativo()));
create policy projetos_incluir on public.projetos for insert to authenticated with check ((select private.usuario_ativo()));
create policy projetos_alterar on public.projetos for update to authenticated
  using ((select private.usuario_ativo())) with check ((select private.usuario_ativo()));
create policy projetos_excluir on public.projetos for delete to authenticated using ((select private.usuario_ativo()));

create policy tarefas_ver on public.tarefas for select to authenticated using ((select private.usuario_ativo()));
create policy tarefas_incluir on public.tarefas for insert to authenticated with check ((select private.usuario_ativo()));
create policy tarefas_alterar on public.tarefas for update to authenticated
  using ((select private.usuario_ativo())) with check ((select private.usuario_ativo()));
create policy tarefas_excluir on public.tarefas for delete to authenticated using ((select private.usuario_ativo()));

-- ---------- Atualização em tempo real ----------
alter publication supabase_realtime add table public.perfis, public.colunas, public.projetos, public.tarefas;

-- ---------- Colunas iniciais ----------
insert into public.colunas (quadro, nome, ordem, concluida) values
  ('projetos', 'Ideias', 1, false),
  ('projetos', 'Planejamento', 2, false),
  ('projetos', 'Em andamento', 3, false),
  ('projetos', 'Concluído', 4, true),
  ('tarefas', 'A fazer', 1, false),
  ('tarefas', 'Fazendo', 2, false),
  ('tarefas', 'Aguardando', 3, false),
  ('tarefas', 'Feito', 4, true);
