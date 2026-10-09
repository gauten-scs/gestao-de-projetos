-- Fluxo de status das ideias e histórico (etapa I6).
-- Parte 1 (este arquivo): já aplicada no Supabase. Cria a tabela de histórico, o gatilho que a preenche
-- e troca as regras de quem altera (função private.protege_ideia).
-- Parte 2: ideias_fluxo_de_status_executada.sql, que o Guilherme roda no SQL Editor (troca a regra do
-- status para aceitar "executada"; tem um drop, que o Supabase cancela quando parte do Claude).
--
-- Fluxo: nova -> em_analise -> aprovada -> executada, um passo por vez, voltando só um passo.
-- Nova, em análise e aprovada podem ir para descartada; descartada só volta para em_analise.
-- Ideia que deu origem a tarefa ou projeto não pode ser descartada.
-- Para entrar em aprovada, executada ou descartada, ou sair delas: o responsável pelo projeto
-- (na ideia avulsa, o autor). Entre nova e em_analise: o autor ou o responsável.
-- Título e descrição: o autor, nos status nova e em_analise; nos demais, o responsável pelo projeto
-- (na avulsa, o autor). Vincular e desvincular de projeto: só em nova e em_analise.
-- Histórico: toda mudança de status que entra ou sai de aprovada, executada ou descartada, e toda
-- alteração de texto feita com a ideia nesses status.

create table if not exists public.ideia_historico (
  id uuid primary key default gen_random_uuid(),
  ideia_id uuid not null references public.ideias(id) on delete cascade,
  usuario_id uuid references public.perfis(id) on delete set null,
  em timestamptz not null default now(),
  tipo text not null check (tipo in ('status', 'texto')),
  status_de text,
  status_para text,
  titulo_antes text,
  titulo_depois text,
  descricao_antes text,
  descricao_depois text
);
create index if not exists ideia_historico_ideia_idx on public.ideia_historico (ideia_id, em);

alter table public.ideia_historico enable row level security;
revoke all on public.ideia_historico from anon, authenticated;
grant select on public.ideia_historico to authenticated;
-- Só leitura para quem enxerga a ideia (o administrador, nos projetos dos outros, também lê).
-- Ninguém grava direto: o registro nasce do gatilho abaixo.
create policy ideia_historico_ver on public.ideia_historico for select to authenticated
  using ((select private.usuario_ativo()) and private.ve_ideia(ideia_id));

-- O passo de status é permitido?
create or replace function private.passo_de_ideia_valido(de text, para text) returns boolean
language sql immutable set search_path = '' as $$
  select (de, para) in (
    ('nova', 'em_analise'), ('em_analise', 'nova'),
    ('em_analise', 'aprovada'), ('aprovada', 'em_analise'),
    ('aprovada', 'executada'), ('executada', 'aprovada'),
    ('nova', 'descartada'), ('em_analise', 'descartada'), ('aprovada', 'descartada'),
    ('descartada', 'em_analise'));
$$;
revoke all on function private.passo_de_ideia_valido(text, text) from public, anon, authenticated;

create or replace function private.protege_ideia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  quem uuid := (select auth.uid());
  autor boolean;
  resp boolean;
  dono boolean;
  alto_antes boolean := old.status in ('aprovada', 'executada', 'descartada');
begin
  if quem is not null then
    autor := old.criado_por is not distinct from quem;
    resp := old.projeto_id is not null and private.responde_pelo_projeto(old.projeto_id);
    -- Quem decide nos status aprovada, executada e descartada: o responsável pelo projeto; na ideia avulsa, o autor
    dono := case when old.projeto_id is null then autor else resp end;
    if new.criado_por is distinct from old.criado_por or new.criado_em is distinct from old.criado_em then
      raise exception 'O autor e a data da ideia não podem ser alterados.';
    end if;
    if new.titulo is distinct from old.titulo or new.descricao is distinct from old.descricao then
      if alto_antes then
        if not dono then
          raise exception 'Com a ideia em Aprovada, Executada ou Descartada, somente o responsável pelo projeto (na ideia avulsa, o autor) altera o título e a descrição.';
        end if;
      elsif not autor then
        raise exception 'Somente o autor pode alterar o título e a descrição da ideia.';
      end if;
    end if;
    if new.projeto_id is distinct from old.projeto_id then
      if not autor then
        raise exception 'Somente o autor pode vincular a ideia a um projeto ou desvincular.';
      end if;
      if alto_antes then
        raise exception 'Só dá para vincular ou desvincular a ideia quando ela está em Nova ou Em análise.';
      end if;
      if old.projeto_id is not null and (
           exists (select 1 from public.ideia_comentarios c where c.ideia_id = old.id)
           or exists (select 1 from public.ideia_apoios a where a.ideia_id = old.id)) then
        raise exception 'Esta ideia já recebeu comentário ou apoio e não pode mais sair do projeto.';
      end if;
    end if;
    if new.status is distinct from old.status then
      if not private.passo_de_ideia_valido(old.status, new.status) then
        raise exception 'Passo de status não permitido. A ideia segue Nova, Em análise, Aprovada e Executada, um passo por vez, e só volta para o status anterior.';
      end if;
      if new.status = 'descartada' and (
           exists (select 1 from public.tarefas t where t.ideia_id = old.id)
           or exists (select 1 from public.projetos p where p.ideia_id = old.id)) then
        raise exception 'Ideia que deu origem a uma tarefa ou a um projeto não pode ser descartada.';
      end if;
      if alto_antes or new.status in ('aprovada', 'executada', 'descartada') then
        if not dono then
          raise exception 'Somente o responsável pelo projeto (na ideia avulsa, o autor) leva a ideia para Aprovada, Executada ou Descartada, ou a tira desses status.';
        end if;
      elsif not (autor or resp) then
        raise exception 'Somente o autor ou o responsável pelo projeto pode mudar o status da ideia.';
      end if;
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

-- Registro do histórico (depois da alteração gravada)
create or replace function private.registra_historico_ideia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  quem uuid := (select auth.uid());
  alto_antes boolean := old.status in ('aprovada', 'executada', 'descartada');
  alto_depois boolean := new.status in ('aprovada', 'executada', 'descartada');
begin
  if new.status is distinct from old.status and (alto_antes or alto_depois) then
    insert into public.ideia_historico (ideia_id, usuario_id, tipo, status_de, status_para)
    values (new.id, quem, 'status', old.status, new.status);
  end if;
  if (new.titulo is distinct from old.titulo or new.descricao is distinct from old.descricao) and alto_antes then
    insert into public.ideia_historico (ideia_id, usuario_id, tipo, titulo_antes, titulo_depois, descricao_antes, descricao_depois)
    values (new.id, quem, 'texto', old.titulo, new.titulo, old.descricao, new.descricao);
  end if;
  return null;
end;
$function$;
revoke all on function private.registra_historico_ideia() from public, anon, authenticated;

create trigger registra_historico_ideia after update on public.ideias
  for each row execute function private.registra_historico_ideia();
