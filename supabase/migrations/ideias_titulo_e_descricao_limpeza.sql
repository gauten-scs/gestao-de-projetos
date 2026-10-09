-- Limpeza das ideias com título e descrição (etapa I5, passo 2).
-- Rodar no SQL Editor SOMENTE depois que o site novo (versão 2026.10.09-2) estiver no ar e testado.
-- Remove o gatilho de compatibilidade e a coluna antiga "texto", e torna o título obrigatório.
-- Supabase pode pedir confirmação por conter "drop".

drop trigger if exists ideia_compat on public.ideias;
drop function if exists private.ideia_compat();
alter table public.ideias drop column if exists texto;
alter table public.ideias alter column titulo set not null;
