-- Ideias: status "executada" (etapa I6, parte 2).
-- Rodar no SQL Editor DEPOIS de a parte 1 (ideias_fluxo_de_status.sql) estar aplicada e ANTES do commit do site novo.
-- Troca a regra do status para aceitar também "executada". Supabase pode pedir confirmação por causa do "drop".
-- As ideias que já existem (nova e descartada) continuam válidas.

alter table public.ideias drop constraint if exists ideias_status_check;
alter table public.ideias add constraint ideias_status_check
  check (status in ('nova', 'em_analise', 'aprovada', 'executada', 'descartada'));
