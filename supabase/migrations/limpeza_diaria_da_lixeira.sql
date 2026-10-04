-- Sexta etapa da estrutura do banco: limpeza diária da lixeira.
-- Cópia de segurança do que já está aplicado no Supabase (rodado pelo SQL Editor em 04/10/2026). Não é preciso rodar de novo.
--
-- Limpeza diária: o que está na lixeira há mais de 30 dias é apagado de vez.
-- Ao apagar um projeto, as tarefas dele são apagadas junto.

create extension if not exists pg_cron;

create or replace function private.limpa_lixeira() returns void
language sql security definer set search_path = '' as $$
  delete from public.tarefas where arquivado_em < now() - interval '30 days';
  delete from public.projetos where arquivado_em < now() - interval '30 days';
$$;
revoke all on function private.limpa_lixeira() from public, anon, authenticated;

-- Todos os dias às 03h15 (horário de Brasília).
select cron.schedule('limpa-lixeira', '15 6 * * *', 'select private.limpa_lixeira()');
