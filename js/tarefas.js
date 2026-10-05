// Tarefas: filtro por projeto, Quadro, Lista por data, Concluídas, botão de concluir e a janela da tarefa.
import { sb } from "./supabase.js";
import { de } from "./ligacoes.js";
import { $, PRIORIDADES, el, hoje, dataBR, dataCurta, ICONES, dataHora, aviso, traduz, preencherSelect, confirmar } from "./util.js";
import { estado, colunasDe, nomePerfil, proximaOrdem, avatar, atrasado, historico, passaFiltro, pessoasDoProjeto, travarConclusao, opcoesPessoas } from "./estado.js";
import { renderQuadro } from "./quadro.js";

export function renderFiltros() {
  preencherSelect($("#filtro-projeto"), [
    { v: "todos", t: "Todos" }, { v: "avulsas", t: "Somente avulsas" },
    ...estado.projetos.slice().sort((a, b) => a.titulo.localeCompare(b.titulo)).map((p) => ({ v: p.id, t: p.titulo })),
  ], estado.filtroProjeto);
  estado.filtroProjeto = $("#filtro-projeto").value;
}
$("#filtro-projeto").addEventListener("change", (e) => { estado.filtroProjeto = e.target.value; de.renderizar(); });

export function botaoConcluir(t) {
  const pode = t.responsavel_id === estado.usuario.id;
  const b = el("button", { class: "marcar" + (t.concluida_em ? " feita" : ""), type: "button", disabled: !pode,
    title: !pode ? "Só o responsável conclui a tarefa" : t.concluida_em ? "Reabrir tarefa" : "Marcar como concluída",
    "aria-label": (t.concluida_em ? "Reabrir a tarefa " : "Marcar como concluída a tarefa ") + t.titulo });
  b.innerHTML = ICONES.feito;
  b.addEventListener("click", (e) => { e.stopPropagation(); concluir(t.id, !t.concluida_em); });
  b.addEventListener("keydown", (e) => e.stopPropagation());
  return b;
}

export async function concluir(id, sim) {
  const { error } = await sb.from("tarefas").update({ concluida_em: sim ? new Date().toISOString() : null }).eq("id", id);
  if (error) { aviso("Não foi possível alterar a tarefa: " + traduz(error)); return; }
  aviso(sim ? "Tarefa concluída." : "Tarefa reaberta.");
  await de.carregar();
}

for (const b of document.querySelectorAll("[data-modo]")) {
  b.addEventListener("click", () => { estado.modoTarefas = b.dataset.modo; de.renderizar(); });
}
$("#busca-concluidas").addEventListener("input", (e) => { estado.busca = e.target.value; renderConcluidas(); });
$("#periodo-concluidas").addEventListener("change", (e) => { estado.periodo = e.target.value; renderConcluidas(); });

export function renderTarefas() {
  const modo = estado.modoTarefas;
  for (const b of document.querySelectorAll("[data-modo]")) b.setAttribute("aria-selected", String(b.dataset.modo === modo));
  $("#quadro-tarefas").hidden = modo !== "quadro";
  $("#lista-tarefas").hidden = modo !== "lista";
  $("#concluidas-tarefas").hidden = modo !== "concluidas";
  if (modo === "quadro") renderQuadro("tarefas");
  if (modo === "lista") renderLista();
  if (modo === "concluidas") renderConcluidas();
}

export function chipsDaTarefa(t) {
  const chips = el("div", { class: "chips" });
  chips.append(el("span", { class: "chip " + t.prioridade, text: "Prioridade " + PRIORIDADES[t.prioridade] }));
  if (t.prazo) {
    const chip = el("span", { class: "chip" + (atrasado(t) ? " atrasado" : ""), title: "Prazo: " + dataBR(t.prazo) });
    chip.innerHTML = ICONES.data;
    chip.append(dataCurta(t.prazo));
    chips.append(chip);
  }
  if (t.responsavel_id) chips.append(avatar(t.responsavel_id));
  return chips;
}
export function origemDaTarefa(t) {
  return estado.projetos.find((p) => p.id === t.projeto_id)?.titulo ?? "Tarefa avulsa";
}

export function renderLista() {
  const raiz = $("#lista-tarefas");
  const dia = hoje();
  const tarefas = estado.tarefas.filter((t) => passaFiltro(t) && !t.concluida_em)
    .sort((a, b) => (a.prazo || "9999") < (b.prazo || "9999") ? -1 : (a.prazo || "9999") > (b.prazo || "9999") ? 1 : a.titulo.localeCompare(b.titulo));
  const grupos = [
    { nome: "Atrasadas", classe: "atrasadas", itens: tarefas.filter((t) => t.prazo && t.prazo < dia) },
    { nome: "Para hoje", classe: "", itens: tarefas.filter((t) => t.prazo === dia) },
    { nome: "Próximas", classe: "", itens: tarefas.filter((t) => !t.prazo || t.prazo > dia) },
  ];
  raiz.replaceChildren();
  if (!tarefas.length) { raiz.append(el("p", { class: "apoio", text: "Nenhuma tarefa aberta. Crie uma em \"Nova tarefa\"." })); return; }
  for (const g of grupos) {
    if (!g.itens.length) continue;
    raiz.append(el("section", { class: "grupo-datas " + g.classe },
      el("h2", {}, g.nome, el("span", { class: "contagem", text: String(g.itens.length) })),
      ...g.itens.map((t) => {
        const chips = chipsDaTarefa(t), coluna = estado.colunas.find((c) => c.id === t.coluna_id)?.nome;
        if (coluna) chips.prepend(el("span", { class: "chip", text: coluna, title: "Coluna no quadro" }));
        return el("div", { class: "linha-tarefa" },
          botaoConcluir(t),
          el("button", { class: "abrir", type: "button", onclick: () => abrirTarefa(t.id) },
            el("span", { class: "nome", text: t.titulo }),
            el("span", { class: "origem" + (t.projeto_id ? "" : " avulsa"), text: origemDaTarefa(t) })),
          chips);
      })));
  }
}

export function renderConcluidas() {
  const tabela = $("#tabela-concluidas");
  const termo = estado.busca.trim().toLowerCase();
  const desde = estado.periodo === "todos" ? "" : new Date(Date.now() - Number(estado.periodo) * 86400000).toISOString();
  const tarefas = estado.tarefas.filter((t) => passaFiltro(t) && t.concluida_em
      && (!termo || (t.titulo + " " + t.descricao).toLowerCase().includes(termo))
      && (!desde || t.concluida_em >= desde))
    .sort((a, b) => (a.concluida_em < b.concluida_em ? 1 : -1));
  tabela.replaceChildren(el("tr", {}, ...["", "Tarefa", "Projeto", "Concluída em", "Responsável"].map((t) => el("th", { text: t, scope: "col" }))));
  for (const t of tarefas) {
    tabela.append(el("tr", {},
      el("td", {}, botaoConcluir(t)),
      el("td", {}, el("button", { class: "abrir-texto", type: "button", text: t.titulo, onclick: () => abrirTarefa(t.id) })),
      el("td", { text: origemDaTarefa(t) }),
      el("td", { text: dataHora(t.concluida_em) }),
      el("td", { class: "pessoa" }, t.responsavel_id ? avatar(t.responsavel_id) : null, nomePerfil(t.responsavel_id))));
  }
  if (!tarefas.length) tabela.append(el("tr", {}, el("td", { colSpan: 5, class: "apoio", text: termo || desde || estado.filtroProjeto !== "todos" ? "Nenhuma tarefa concluída com esses filtros." : "Nenhuma tarefa concluída ainda." })));
}

$("#nova-tarefa").addEventListener("click", () => abrirTarefa(null));
$("#t-concluir").addEventListener("click", async () => {
  const t = estado.tarefas.find((x) => x.id === estado.editando.id);
  if (!t) return;
  fecharTarefa();
  await concluir(t.id, !t.concluida_em);
});

// A janela da tarefa pode abrir por cima da janela do projeto. Ao fechar, a edição do projeto é retomada.
let projetoPorBaixo = null;
function fecharTarefa() {
  if ($("#dlg-tarefa").open) $("#dlg-tarefa").close();
  if (projetoPorBaixo && $("#dlg-projeto").open) estado.editando = projetoPorBaixo;
  projetoPorBaixo = null;
}
$("#dlg-tarefa").addEventListener("close", fecharTarefa); // cobre o Cancelar, o X e a tecla Esc

export function abrirTarefa(id, colunaId, projetoId) {
  const colunas = colunasDe("tarefas");
  if (!colunas.length) { aviso("Crie ao menos uma coluna no quadro de tarefas, em Configurações."); return; }
  const t = id ? estado.tarefas.find((x) => x.id === id) : null;
  projetoPorBaixo = $("#dlg-projeto").open && estado.editando?.tipo === "projeto" ? estado.editando : null;
  estado.editando = { tipo: "tarefa", id: t ? t.id : null };
  $("#t-janela").textContent = t ? "Editar tarefa" : "Nova tarefa";
  $("#t-titulo").value = t?.titulo ?? "";
  $("#t-descricao").value = t?.descricao ?? "";
  const filtro = estado.filtroProjeto;
  const projetoPadrao = projetoId ?? (filtro !== "todos" && filtro !== "avulsas" ? filtro : "");
  preencherSelect($("#t-projeto"), [{ v: "", t: "Tarefa avulsa (sem projeto)" },
    ...estado.projetos.slice().sort((a, b) => a.titulo.localeCompare(b.titulo)).map((p) => ({ v: p.id, t: p.titulo }))],
    t ? (t.projeto_id ?? "") : projetoPadrao);
  preencherSelect($("#t-coluna"), colunas.map((c) => ({ v: c.id, t: c.nome })), t?.coluna_id ?? colunaId ?? colunas[0].id);
  $("#t-prioridade").value = t?.prioridade ?? "media";
  $("#t-prazo").value = t?.prazo ?? "";
  pessoasDaTarefa(t ? t.responsavel_id : estado.usuario.id);
  $("#t-historico").textContent = t ? historico(t) : "";
  $("#t-historico").hidden = !t;
  $("#t-excluir").hidden = !t || t.responsavel_id !== estado.usuario.id; // só o responsável exclui
  $("#t-concluir").hidden = !t || t.responsavel_id !== estado.usuario.id; // só o responsável conclui
  travarConclusao($("#t-coluna"), t ? t.responsavel_id === estado.usuario.id : true, t?.coluna_id);
  $("#t-concluir").textContent = t?.concluida_em ? "Reabrir tarefa" : "Marcar como concluída";
  $("#dlg-tarefa").showModal();
}

// O responsável de uma tarefa de projeto precisa ter acesso ao projeto.
export function pessoasDaTarefa(atual) {
  const projetoId = $("#t-projeto").value;
  const ids = projetoId ? pessoasDoProjeto(projetoId) : null;
  const opcoes = opcoesPessoas(ids, ids ? null : atual);
  preencherSelect($("#t-responsavel"), opcoes, opcoes.some((o) => o.v === atual) ? atual : (opcoes.some((o) => o.v === estado.usuario.id) ? estado.usuario.id : ""));
  $("#t-visivel").textContent = projetoId
    ? "Todos que têm acesso ao projeto veem esta tarefa dentro dele. No quadro de tarefas ela aparece só para o responsável."
    : "Tarefa avulsa: só você e o responsável enxergam.";
}
$("#t-projeto").addEventListener("change", () => pessoasDaTarefa($("#t-responsavel").value));

$("#form-tarefa").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = estado.editando.id;
  const atual = id ? estado.tarefas.find((x) => x.id === id) : null;
  const dados = {
    titulo: $("#t-titulo").value.trim(), descricao: $("#t-descricao").value.trim(),
    projeto_id: $("#t-projeto").value || null, coluna_id: $("#t-coluna").value,
    prioridade: $("#t-prioridade").value, prazo: $("#t-prazo").value || null,
    responsavel_id: $("#t-responsavel").value || null,
  };
  if (!dados.titulo || !dados.prazo || !dados.responsavel_id) return;
  if (!atual || atual.coluna_id !== dados.coluna_id) dados.ordem = proximaOrdem("tarefas", dados.coluna_id);
  const { error } = id ? await sb.from("tarefas").update(dados).eq("id", id) : await sb.from("tarefas").insert(dados);
  if (error) { aviso("Não foi possível salvar a tarefa: " + traduz(error)); return; }
  fecharTarefa();
  await de.carregar();
  if (!id && dados.responsavel_id !== estado.usuario.id && dados.projeto_id) {
    aviso("Tarefa criada. Ela aparece dentro do projeto e no quadro de " + (nomePerfil(dados.responsavel_id) || "quem é responsável") + ".");
  }
});

$("#t-excluir").addEventListener("click", async () => {
  const t = estado.tarefas.find((x) => x.id === estado.editando.id);
  if (!t) return;
  if (!(await confirmar(`Excluir a tarefa "${t.titulo}"? Ela vai para a lixeira, e o administrador pode restaurar.`))) return;
  const { error } = await sb.from("tarefas").update({ arquivado_em: new Date().toISOString() }).eq("id", t.id);
  if (error) { aviso("Não foi possível excluir: " + traduz(error)); return; }
  fecharTarefa();
  await de.carregar();
});
