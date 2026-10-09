-- Ideias com título e descrição (etapa I5).
-- Já aplicado no Supabase. Este arquivo guarda o registro no repositório.
--
-- Passo 1 (este arquivo): acrescenta as colunas titulo e descricao, preenche as ideias existentes
-- (primeira linha do texto vira o título, o resto vira a descrição) e cria um gatilho de
-- compatibilidade, para que o site antigo (que só grava "texto") continue funcionando
-- enquanto o site novo (que grava titulo e descricao) é publicado.
--
-- Passo 2 (depois que o site novo estiver no ar e testado): rodar o arquivo
-- ideias_titulo_e_descricao_limpeza.sql no SQL Editor, que remove o gatilho de compatibilidade
-- e a coluna "texto".

alter table public.ideias add column if not exists titulo text;
alter table public.ideias add column if not exists descricao text;

-- Preenche as ideias que já existiam.
do $$
declare
  esp constant text := E' \n\r\t';
begin
  update public.ideias i
     set titulo = left(btrim(split_part(btrim(i.texto, esp), E'\n', 1), esp), 200),
         descricao = nullif(btrim(
           case when length(btrim(split_part(btrim(i.texto, esp), E'\n', 1), esp)) <= 200
                then substr(btrim(i.texto, esp), length(split_part(btrim(i.texto, esp), E'\n', 1)) + 1)
                else btrim(i.texto, esp) end, esp), '')
   where i.titulo is null and i.texto is not null;
end $$;

alter table public.ideias drop constraint if exists ideias_titulo_ck;
alter table public.ideias add constraint ideias_titulo_ck
  check (titulo is null or (length(btrim(titulo)) > 0 and length(titulo) <= 200));
alter table public.ideias drop constraint if exists ideias_descricao_ck;
alter table public.ideias add constraint ideias_descricao_ck
  check (descricao is null or length(descricao) <= 2000);

-- Gatilho de compatibilidade (temporário, sai no passo 2).
create or replace function private.ideia_compat()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  t text;
  linha text;
  esp constant text := E' \n\r\t';
begin
  if tg_op = 'INSERT' then
    if new.titulo is null and new.texto is not null then
      t := btrim(new.texto, esp);
      linha := btrim(split_part(t, E'\n', 1), esp);
      new.titulo := left(linha, 200);
      new.descricao := nullif(btrim(case when length(linha) <= 200 then substr(t, length(split_part(t, E'\n', 1)) + 1) else t end, esp), '');
    elsif new.texto is null and new.titulo is not null then
      new.texto := new.titulo || coalesce(E'\n' || new.descricao, '');
    end if;
  else
    if new.titulo is distinct from old.titulo or new.descricao is distinct from old.descricao then
      if new.titulo is not null then
        new.texto := new.titulo || coalesce(E'\n' || new.descricao, '');
      end if;
    elsif new.texto is distinct from old.texto then
      t := btrim(new.texto, esp);
      linha := btrim(split_part(t, E'\n', 1), esp);
      new.titulo := left(linha, 200);
      new.descricao := nullif(btrim(case when length(linha) <= 200 then substr(t, length(split_part(t, E'\n', 1)) + 1) else t end, esp), '');
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.ideia_compat() from public, anon, authenticated;

drop trigger if exists ideia_compat on public.ideias;
create trigger ideia_compat
  before insert or update of texto, titulo, descricao on public.ideias
  for each row execute function private.ideia_compat();

-- Regra de quem altera: agora vale para título e descrição (antes era para o texto).
-- O restante da função é igual ao da versão anterior.
create or replace function private.protege_ideia()
returns trigger
language plpgsql
security definer
set search_path = ''
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
    if (new.titulo is distinct from old.titulo or new.descricao is distinct from old.descricao) and not autor then
      raise exception 'Somente o autor pode alterar o título e a descrição da ideia.';
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
