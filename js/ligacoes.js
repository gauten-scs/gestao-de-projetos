// Funções do app.js que os outros arquivos precisam chamar (redesenhar a tela, recarregar os dados, abrir janelas).
// O app.js entrega essas funções na partida, com ligar({ ... }); os outros arquivos as chamam como de.nome().
// Evita que os arquivos se importem em círculo.
export const de = {};
export function ligar(funcoes) { Object.assign(de, funcoes); }
