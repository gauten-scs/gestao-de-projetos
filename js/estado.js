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

// No quadro de tarefas cada pessoa vê só as tarefas em que é responsável,
// mais as avulsas que ela mesma criou (mesmo delegadas a outra pessoa).
export function noMeuQuadro(t) {
  const eu = estado.usuario.id;
  return t.responsavel_id === eu || (!t.projeto_id && t.criado_por === eu);
}

// Tarefa concluída fica 7 dias na coluna concluída do quadro; depois, só na aba Concluídas.
export const DIAS_NO_QUADRO = 7;
export function noQuadro(t) {
  return !t.concluida_em || t.concluida_em > new Date(Date.now() - DIAS_NO_QUADRO * 86400000).toISOString();
}
export function colunaConcluida(id) { return !!estado.colunas.find((c) => c.id === id)?.concluida; }

export function passaFiltro(t) {
  const fp = estado.filtroProjeto;
  if (!noMeuQuadro(t)) return false;
  if (fp === "avulsas" && t.projeto_id) return false;
  if (fp !== "todos" && fp !== "avulsas" && t.projeto_id !== fp) return false;
  return true;
}

// Quem enxerga um projeto: o responsável e os usuários selecionados.
export function pessoasDoProjeto(projetoId) {
  const p = estado.projetos.find((x) => x.id === projetoId);
  const ids = new Set(estado.membros.filter((m) => m.projeto_id === projetoId).map((m) => m.usuario_id));
  if (p?.responsavel_id) ids.add(p.responsavel_id);
  return [...ids];
}
