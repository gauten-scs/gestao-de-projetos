# Testes das regras do banco

Esta pasta guarda os testes que conferem se as regras de acesso do banco continuam valendo: quem vê cada projeto e cada tarefa, quem conclui, quem exclui e quem restaura, e as regras das ideias.

## Arquivos

- `regras_de_acesso.sql`: 57 verificações sobre acesso por convite, perfis, colunas, projetos, tarefas de projeto, tarefas avulsas, conclusão, histórico e lixeira.
- `exclusao_definitiva_e_limpeza.sql`: 19 verificações sobre a exclusão definitiva pelo administrador ("Excluir de vez") e a limpeza diária da lixeira, que apaga o que está lá há mais de 30 dias.
- `regras_das_ideias.sql`: 46 verificações sobre as ideias: quem vê a ideia avulsa e a de projeto, quem altera o texto e o status, vincular e desvincular de projeto, comentários, apoios, ideia de origem de tarefa e de projeto, lixeira e limpeza diária.

- `senha_pendente.sql`: 20 verificações sobre a trava de senha pendente: quem ainda não criou a senha (convite novo ou "Gerar novo link") não vê nem grava nada, mesmo com a sessão aberta; só o banco desliga a trava, ao gravar a senha; "Gerar novo link" liga a trava e encerra as sessões da conta.

## Como rodar

1. No Supabase, abrir o projeto `gestao-de-projetos` e clicar em "SQL Editor".
2. Colar o conteúdo inteiro de um dos arquivos e clicar em "Run". Um arquivo de cada vez.
3. Ler a mensagem que aparece. Ela vem como erro, de propósito, e começa com `RESULTADO`.

Resultados esperados: `RESULTADO: 57 verificações, 0 falhas.` no primeiro arquivo, `RESULTADO: 19 verificações, 0 falhas.` no segundo `RESULTADO: 46 verificações, 0 falhas.` no terceiro e `RESULTADO: 20 verificações, 0 falhas.` no quarto.

O segundo e o terceiro arquivos apagam linhas durante o teste. O Supabase pode pedir confirmação antes de rodar ("destructive operation"): pode confirmar, porque tudo é desfeito no fim.

## Por que termina em erro

Não há banco de teste. O teste roda no banco real, cria usuários e dados fictícios e, no fim, provoca um erro com o resultado. Esse erro faz o banco desfazer tudo o que o teste criou. Nenhum dado de teste fica gravado e os dados reais não são alterados.

## Quando rodar

Depois de qualquer mudança em `supabase/migrations` (regras de acesso, gatilhos ou funções) e antes de publicar uma versão nova do site.

## Função de convites: conferência manual

A função de convites (`supabase/functions/convites`) não pode ser testada por SQL. Conferir no site, depois de qualquer alteração nela:

1. Entrar com a conta de admin, abrir Configurações e clicar em "Gerar novo link" de um usuário de teste. Deve aparecer o link. Na própria linha do admin o botão fica desligado. Atenção: gerar o link invalida na hora a senha antiga dessa pessoa e encerra as sessões abertas dela.
2. Ainda como admin, clicar em "Convidar usuário", preencher um nome e um e-mail de teste e gerar o convite. Deve aparecer o link, e a pessoa deve surgir na lista de usuários.
3. Abrir o link em uma aba anônima e, sem criar a senha, atualizar a página: deve continuar na tela de senha. Criada a senha, o site entra.
4. Entrar com uma conta comum. O menu Configurações não deve aparecer.

A função só responde ao endereço do site (`https://gauten-scs.github.io`). Se o site mudar de endereço, trocar a constante `ORIGEM_DO_SITE` no arquivo da função e publicar a função de novo, senão os convites param de funcionar.
