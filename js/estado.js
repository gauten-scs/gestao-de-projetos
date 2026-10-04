// Os dados carregados do banco e as funções que os consultam.
import { el, porOrdem, hoje, dataHora } from "./util.js";

export const estado = {
  usuario: null, perfil: null,
  perfis: [], colunas: [], projetos: [], tarefas: [],
  visao: "projetos", filtroProjeto: "todos", modoTarefas: "quadro", busca: "", periodo: "todos", minhaLixeira: [],
  arrastando: null, pendente: false, canal: null, editando: null,
  lixeira: { projetos: [], tarefas: [] }, membros: [],
};

export function colunasDe(quadro) { return estado.colunas.filter((c) => c.quadro === quadro).sort(porOrdem); }
export function nomePerfil(id) { const p = estado.perfis.find((x) => x.id === id); return p ? (p.nome || p.email) : ""; }
export function souAdmin() { return estado.perfil?.papel === "admin"; }
export function proximaOrdem(quadro, colunaId) {
  return Math.max(0, ...estado[quadro].filter((i) => i.coluna_id === colunaId).map((i) => i.ordem)) + 1;
}
export function avatar(id) {
  const p = estado.perfis.find((x) => x.id === id);
  const nome = p ? (p.nome || p.email) : "?";
  const partes = nome.trim().split(/\s+/);
  const letras = (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
  let soma = 0; for (const c of String(id)) soma += c.charCodeAt(0);
  const cor = ["", " c1", " c2", " c3", " c4"][soma % 5];
  return el("span", { class: "avatar" + cor, text: letras, title: nome });
}
export function atrasado(item) {
  return !!item.prazo && item.prazo < hoje() && !item.concluida_em && !estado.colunas.find((c) => c.id === item.coluna_id)?.concluida;
}
export function historico(item) {
  const quem = (id) => nomePerfil(id) || "usuário removido";
  let texto = `Criado por ${quem(item.criado_por)} em ${dataHora(item.criado_em)}.`;
  if (item.atualizado_em && item.atualizado_em !== item.criado_em) {
    texto += ` Última alteração por ${quem(item.atualizado_por)} em ${dataHora(item.atualizado_em)}.`;
  }
  return texto;
}
export function opcoesResponsavel(atual) {
  return [{ v: "", t: "Sem responsável" }].concat(
    estado.perfis.filter((p) => p.ativo || p.id === atual).map((p) => ({ v: p.id, t: p.nome || p.email })));
}
