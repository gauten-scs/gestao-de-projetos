# Gestão de Projetos | Gauten Smart.GOV

Site em estilo Kanban para acompanhamento dos projetos e das tarefas do Gauten Smart.GOV.

## O que o site faz

- **Quadro de Projetos**: cada cartão é um projeto, que anda pelas colunas.
- **Tarefas**: cada cartão é uma tarefa, de um projeto ou avulsa. Há três formas de ver: Quadro, Lista por data (atrasadas, para hoje e próximas) e Concluídas (com busca e filtros).
- **Concluir tarefa**: só o responsável conclui (ou reabre), pelo círculo ao lado do título ou arrastando o cartão para a coluna concluída. No Quadro a tarefa vai sozinha para a coluna "Concluído" e fica lá por 7 dias; na Lista por data ela some na hora. Depois disso só aparece na aba Concluídas. Dentro do projeto fica tachada, no fim da fila.
- **Concluir projeto**: só o responsável leva o projeto para uma coluna que conta como concluída, ou o tira de lá.
- **Acesso somente por convite**: ninguém consegue se cadastrar sozinho. O administrador gera um link de convite e envia para a pessoa.
- **Quem vê o quê**: cada projeto é visto só pelo responsável e pelas pessoas selecionadas nele. As tarefas de um projeto são vistas por quem tem acesso ao projeto; no quadro de Tarefas, cada pessoa vê só as tarefas em que é responsável. Tarefa avulsa é vista só por quem criou e pelo responsável. O administrador segue as mesmas regras.
- **Tarefas**: toda tarefa precisa de um responsável e de uma data prevista para finalização.
- **Dois tipos de usuário**: o administrador acessa as Configurações (usuários e colunas dos quadros); os demais usuários fazem todo o resto.
- **Histórico**: cada cartão mostra quem criou e quem fez a última alteração, com data e hora.
- **Excluir**: só o responsável exclui um projeto ou uma tarefa.
- **Lixeira**: cada pessoa tem a sua, com o que ela excluiu nos últimos 30 dias, e pode restaurar. Passados 30 dias, o item é apagado de vez por uma rotina diária do banco (03h15), inclusive os que estão na lixeira do administrador. O administrador tem, em Configurações, a lixeira dos projetos e das tarefas de projetos de todos, onde restaura ou exclui de vez. Tarefas avulsas não aparecem para o administrador.
- **Celular**: os quadros mostram uma coluna por vez, escolhida pelas etiquetas no alto; para mudar um cartão de coluna, abra o cartão e use o campo "Coluna". O botão "+" cria tarefa ou projeto, e Tarefas abre na Lista.
- As mudanças aparecem para todos em tempo real.

## Como está montado

| Parte | Onde fica | Para que serve |
| --- | --- | --- |
| Site | Esta pasta (`index.html`, `css/`, `js/`, `img/`) | As telas. É um site estático, pronto para o GitHub Pages. |
| Banco de dados e login | Supabase, projeto `gestao-de-projetos` (região São Paulo) | Guarda usuários, colunas, projetos e tarefas. |
| Função de convites | Supabase, Edge Function `convites` | Gera os links de convite e de nova senha. Só o administrador consegue usar. |

Arquivos:

- `index.html`: as telas do site.
- `css/estilo.css`: aparência, conforme o Guia Visual do Gauten.
- `js/config.js`: endereço e chave pública do Supabase.
- `js/app.js`: funcionamento do site.
- `img/`: logos do Gauten Smart.GOV (fundo claro e fundo escuro) e ícone.
- `supabase/`: cópia de segurança da estrutura do banco e da função de convites. O que vale é o que está publicado no Supabase.

## Segurança

- A chave que aparece em `js/config.js` é pública por natureza e sozinha não dá acesso a nada.
- Quem protege os dados são as regras de acesso do banco (RLS): só usuário convidado e liberado lê ou altera alguma coisa, e só o administrador altera colunas, tipos de usuário e acessos.
- Todo usuário nasce bloqueado. Só a função de convites, chamada pelo administrador, libera o acesso.
- Nunca coloque neste repositório a chave secreta do Supabase (`service_role` ou `sb_secret_...`).

## Tabelas do banco

- `perfis`: nome, e-mail, tipo (`admin` ou `membro`) e se o acesso está liberado.
- `colunas`: colunas dos dois quadros, com a ordem e a marca de "conta como concluído".
- `projetos`: título, descrição, coluna, prioridade, prazo e responsável.
- `tarefas`: igual aos projetos, com o projeto a que pertence (vazio quando é avulsa).
