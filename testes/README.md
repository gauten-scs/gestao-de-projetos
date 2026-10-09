# Teste de tela

Confere, em um navegador automatizado, se as telas do site continuam funcionando depois de uma alteração no código. São 270 verificações: entrada, moldura e barra de baixo do celular, quadro de uma coluna por vez no celular (etiquetas, coluna lembrada), botão "+" e painel "Novo" do celular, tarefa como painel vindo de baixo no celular (leitura, campo "Coluna", "Editar" e "Concluir"), projeto em tela cheia no celular (leitura, campo "Coluna", tarefas do projeto, "Editar" e "Nova tarefa"), "Quem pode ver" e janelas pequenas como painel vindo de baixo no celular, fechar ao clicar fora, resumo dos cabeçalhos, quadros de projetos e de tarefas, arrastar cartão com o mouse, janelas de tarefa e de projeto, Lista por data, Concluídas, Ideias (registro, filtros, janela, vincular a projeto, status, exclusão, ideias dentro do projeto, apoios e comentários), lixeiras, Configurações, convites, Minha conta, escolha de tema, versão do site, atualização de páginas já abertas e visão do administrador (projetos, tarefas e ideias de outras pessoas, somente para leitura, no computador e no celular).

## O que este teste é, e o que não é

- Usa só dados de exemplo (as pessoas "Ana Teste", "Bruno Silva" e "Abel Costa", um "Projeto Exemplo" e algumas tarefas inventadas). Não há dado real aqui.
- Não se conecta ao Supabase. O arquivo `supabase-de-mentira.js` entra no lugar da biblioteca do Supabase e apenas anota o que o site tentaria gravar.
- Por isso, ele não prova que o banco aceita cada gravação. Quem confere as regras do banco é `supabase/testes/regras_de_acesso.sql`.
- Não cobre o arrastar com o dedo, que só existe em tela larga com toque (tablet); no celular não há arrastar. Da escolha de quem pode ver o projeto, cobre a lista, a busca e o que o site manda gravar ao incluir ou retirar uma pessoa.

## Arquivos

- `telas.mjs`: o roteiro do teste.
- `supabase-de-mentira.js`: os dados de exemplo e o Supabase de mentira.

## Como rodar

É preciso ter o Node.js e o Playwright com o Chromium instalados. Na pasta do repositório:

```
node testes/telas.mjs
```

O teste sobe um servidor local na porta 8123, abre o site, percorre as telas e termina com uma linha `RESULTADO: N ok, N falhas`. Cada verificação que falhar aparece com a palavra `FALHA`.

Para testar uma cópia do site que esteja em outra pasta: `SITE=/caminho/da/pasta node testes/telas.mjs`.

## Ao alterar o site

Tela ou botão novo: acrescentar verificações em `telas.mjs`. Campo novo no banco: acrescentar aos dados de exemplo em `supabase-de-mentira.js`.
