# Testes das regras do banco

Esta pasta guarda os testes que conferem se as regras de acesso do banco continuam valendo: quem vê cada projeto e cada tarefa, quem conclui, quem exclui e quem restaura.

## Arquivos

- `regras_de_acesso.sql`: 57 verificações sobre acesso por convite, perfis, colunas, projetos, tarefas de projeto, tarefas avulsas, conclusão, histórico e lixeira.

## Como rodar

1. No Supabase, abrir o projeto `gestao-de-projetos` e clicar em "SQL Editor".
2. Colar o conteúdo inteiro do arquivo e clicar em "Run".
3. Ler a mensagem que aparece. Ela vem como erro, de propósito, e começa com `RESULTADO`.

Resultado esperado: `RESULTADO: 57 verificações, 0 falhas.`

## Por que termina em erro

Não há banco de teste. O teste roda no banco real, cria usuários e dados fictícios e, no fim, provoca um erro com o resultado. Esse erro faz o banco desfazer tudo o que o teste criou. Nenhum dado de teste fica gravado e os dados reais não são alterados.

## Quando rodar

Depois de qualquer mudança em `supabase/migrations` (regras de acesso, gatilhos ou funções) e antes de publicar uma versão nova do site.

## O que ainda não está coberto

- Exclusão definitiva pelo administrador.
- Limpeza diária da lixeira (`limpa-lixeira`).
- A função de convites (`supabase/functions/convites`).
