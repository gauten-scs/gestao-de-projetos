-- Oitava etapa da estrutura do banco: trava de senha pendente.
-- Cópia de segurança do que já está aplicado no Supabase. Não é preciso rodar de novo.
--
-- Por quê: o link de convite (ou de nova senha) abre a sessão antes de a pessoa escolher a senha.
-- Sem esta trava, quem abrisse o link e não criasse a senha já enxergava os dados da conta.
--
-- Regras:
--   Todo perfil tem o campo senha_pendente. Ele nasce ligado para quem ainda não tem senha
--   e é ligado de novo pela função de convites a cada "Gerar novo link".
--   Enquanto estiver ligado, a conta não é tratada como ativa nem como admin: o banco não entrega
--   nem aceita projetos, tarefas, ideias, colunas e perfis dos outros. A pessoa só enxerga o próprio perfil.
--   O campo só é desligado pelo próprio banco, quando a senha é gravada no cadastro (auth.users).
--   Ninguém desliga pelo site, nem o administrador.
--   "Gerar novo link" também encerra as sessões abertas da conta: só o link mais recente vale.

-- 1. Campo no perfil. Quem já tem senha fica com o campo desligado.
alter table public.perfis add column if not exists senha_pendente boolean not null default false;

update public.perfis p set senha_pendente = true
  from auth.users u
 where u.id = p.id and coalesce(u.encrypted_password, '') = '' and not p.senha_pendente;

-- 2. Conta com senha pendente não conta como ativa nem como admin.
--    Todas as regras de acesso passam por estas duas funções.
create or replace function private.usuario_ativo() returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.perfis where id = (select auth.uid()) and ativo and not senha_pendente);
$$;

create or replace function private.usuario_admin() returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.perfis where id = (select auth.uid()) and ativo and not senha_pendente and papel = 'admin');
$$;

-- 3. Usuário novo: nasce com a senha pendente quando é criado sem senha (caso do convite).
create or replace function private.novo_usuario() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  insert into public.perfis (id, nome, email, papel, ativo, senha_pendente)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''), coalesce(new.email, ''), 'membro', false,
          coalesce(new.encrypted_password, '') = '');
  return new;
end;
$$;

-- 4. Ninguém altera o campo pelo site.
create or replace function private.protege_perfil() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if (select auth.uid()) is null then
    return new; -- chamadas internas (função de convites, painel, gravação da senha)
  end if;
  if new.id <> old.id or new.email <> old.email then
    raise exception 'Não é permitido alterar o identificador ou o e-mail.';
  end if;
  if new.senha_pendente <> old.senha_pendente then
    raise exception 'A situação da senha não pode ser alterada pelo site.';
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

-- 5. A senha foi gravada no cadastro: desliga o campo.
create or replace function private.senha_definida() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  update public.perfis set senha_pendente = false where id = new.id and senha_pendente;
  return new;
end;
$$;
revoke all on function private.senha_definida() from public, anon, authenticated;

drop trigger if exists ao_definir_senha on auth.users;
create trigger ao_definir_senha
  after update of encrypted_password on auth.users
  for each row
  when (new.encrypted_password is distinct from old.encrypted_password and coalesce(new.encrypted_password, '') <> '')
  execute function private.senha_definida();

-- 6. Usada só pela função de convites, ao gerar um novo link:
--    liga a senha pendente e encerra as sessões abertas da conta.
create or replace function public.preparar_novo_link(usuario uuid) returns void
language plpgsql security definer set search_path to '' as $$
begin
  update public.perfis set senha_pendente = true where id = usuario;
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;
  delete from auth.sessions where user_id = usuario;
end;
$$;
revoke all on function public.preparar_novo_link(uuid) from public, anon, authenticated;
grant execute on function public.preparar_novo_link(uuid) to service_role;
