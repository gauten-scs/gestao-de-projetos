// Tarefas: filtro por projeto, Quadro, Lista por data, Concluídas, botão de concluir e a janela da tarefa.
// No celular a janela é um painel vindo de baixo, e a tarefa que já existe abre primeiro em leitura.
import { sb } from "./supabase.js";
import { de } from "./ligacoes.js";
import { $, celular, PRIORIDADES, el, hoje, dataBR, dataCurta, ICONES, dataHora, aviso, traduz, preencherSelect, confirmar, soLer } from "./util.js";
import { estado, colunasDe, nomePerfil, proximaOrdem, avatar, atrasado, historico, passaFiltro, pessoasDoProjeto, travarConclusao, opcoesPessoas, colunaConcluida, vejoComoAdmin, NOTA_ADMIN, projetosQueGravo } from "./estado.js";
import { renderQuadro, mover } from "./quadro.js";

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

// As etiquetas da tarefa, iguais no Quadro, na Lista e em Concluídas: prioridade e data.
// O responsável não entra aqui: fica na primeira linha, à direita do nome.
// Na tarefa concluída a data mostrada é a da conclusão, no lugar do prazo.
export function chipsDaTarefa(t) {
  const chips = el("div", { class: "chips" });
  chips.append(el("span", { class: "chip " + t.prioridade, text: "Prioridade " + PRIORIDADES[t.prioridade] }));
  if (t.concluida_em) {
    const chip = el("span", { class: "chip", title: "Concluída em " + dataHora(t.concluida_em) });
    chip.innerHTML = ICONES.feito;
    chip.append("Concluída em " + dataCurta(t.concluida_em.slice(0, 10)));
    chips.append(chip);
  } else if (t.prazo) {
    const chip = el("span", { class: "chip" + (atrasado(t) ? " atrasado" : ""), title: "Prazo: " + dataBR(t.prazo) });
    chip.innerHTML = ICONES.data;
    chip.append(dataCurta(t.prazo));
    chips.append(chip);
  }
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
  if (!tarefas.length) { raiz.append(el("p", { class: "apoio", text: "Nenhuma tarefa aberta. " + (celular() ? "Toque em \"+\" para criar uma." : "Crie uma em \"Nova tarefa\".") })); return; }
  for (const g of grupos) {
    if (!g.itens.length) continue;
    raiz.append(el("section", { class: "grupo-datas " + g.classe },
      el("h2", {}, g.nome, el("span", { class: "contagem", text: String(g.itens.length) })),
      ...g.itens.map((t) => {
        const coluna = estado.colunas.find((c) => c.id === t.coluna_id)?.nome;
        return linhaDaTarefa(t, coluna && el("span", { class: "chip", text: coluna, title: "Coluna no quadro" }));
      })));
  }
}

// Uma tarefa em lista: círculo de concluir, nome e projeto, etiquetas e o responsável. Usada na Lista por data e em Concluídas.
// No celular o estilo.css leva as etiquetas para a linha de baixo, e o responsável fica na primeira linha, à direita.
// Dentro do projeto aberto (celular) a linha não repete o nome do projeto.
export function linhaDaTarefa(t, etiquetaNaFrente, semOrigem) {
  const chips = chipsDaTarefa(t);
  if (etiquetaNaFrente) chips.prepend(etiquetaNaFrente);
  return el("div", { class: "linha-tarefa" + (t.concluida_em ? " feita" : "") },
    botaoConcluir(t),
    el("button", { class: "abrir", type: "button", onclick: () => abrirTarefa(t.id) },
      el("span", { class: "nome", text: t.titulo, title: t.titulo }),
      semOrigem ? null : el("span", { class: "origem" + (t.projeto_id ? "" : " avulsa"), text: origemDaTarefa(t) })),
    chips,
    t.responsavel_id ? avatar(t.responsavel_id) : null);
}

export function renderConcluidas() {
  const raiz = $("#lista-concluidas");
  const termo = estado.busca.trim().toLowerCase();
  const desde = estado.periodo === "todos" ? "" : new Date(Date.now() - Number(estado.periodo) * 86400000).toISOString();
  const tarefas = estado.tarefas.filter((t) => passaFiltro(t) && t.concluida_em
      && (!termo || (t.titulo + " " + t.descricao).toLowerCase().includes(termo))
      && (!desde || t.concluida_em >= desde))
    .sort((a, b) => (a.concluida_em < b.concluida_em ? 1 : -1));
  raiz.replaceChildren();
  if (!tarefas.length) {
    raiz.append(el("p", { class: "apoio", text: termo || desde || estado.filtroProjeto !== "todos" ? "Nenhuma tarefa concluída com esses filtros." : "Nenhuma tarefa concluída ainda." }));
    return;
  }
  raiz.append(el("section", { class: "grupo-datas" },
    el("h2", {}, "Concluídas", el("span", { class: "contagem", text: String(tarefas.length) })),
    ...tarefas.map((t) => linhaDaTarefa(t))));
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
// Tarefa que está nascendo de uma ideia (etapa I7): { ideia_id, titulo, descricao, projeto_id, aoFechar }.
// Ao salvar, a tarefa guarda a ideia de origem; ao fechar sem salvar, nada é criado. Nos dois casos volta-se para a ideia.
let semente = null;
function fecharTarefa() {
  if ($("#dlg-tarefa").open) $("#dlg-tarefa").close();
  if (projetoPorBaixo && $("#dlg-projeto").open) estado.editando = projetoPorBaixo;
  projetoPorBaixo = null;
  const s = semente; semente = null;
  s?.aoFechar?.();
}
// Linha "Criada a partir da ideia": só para quem enxerga a ideia (a avulsa é privada do autor)
function daIdeia(t, raiz) {
  const i = t?.ideia_id ? estado.ideias.find((x) => x.id === t.ideia_id) : null;
  raiz.hidden = !i;
  raiz.replaceChildren(...(i ? ["Criada a partir da ideia: ", el("button", { class: "elo", type: "button", text: i.titulo, onclick: () => {
    if ($("#dlg-tarefa").dataset.alterado) { aviso("Salve ou cancele as alterações da tarefa antes de abrir a ideia."); return; }
    fecharTarefa(); de.abrirIdeia(i.id);
  } })] : []));
}
$("#dlg-tarefa").addEventListener("close", fecharTarefa); // cobre o Cancelar, o X e a tecla Esc

export function abrirTarefa(id, colunaId, projetoId, daIdeiaAprovada) {
  const colunas = colunasDe("tarefas");
  if (!colunas.length) { aviso("Crie ao menos uma coluna no quadro de tarefas, em Configurações."); return; }
  const t = id ? estado.tarefas.find((x) => x.id === id) : null;
  projetoPorBaixo = $("#dlg-projeto").open && estado.editando?.tipo === "projeto" ? estado.editando : null;
  estado.editando = { tipo: "tarefa", id: t ? t.id : null };
  semente = t ? null : (daIdeiaAprovada ?? null);
  const ro = !!t && vejoComoAdmin(t.projeto_id); // administrador em tarefa de projeto de que não faz parte: só lê
  $("#t-janela").textContent = ro ? "Tarefa" : t ? "Editar tarefa" : "Nova tarefa";
  $("#t-titulo").value = t?.titulo ?? semente?.titulo ?? "";
  $("#t-descricao").value = t?.descricao ?? semente?.descricao ?? "";
  const filtro = estado.filtroProjeto;
  // Tarefa que nasce de uma ideia fica no projeto da ideia (ou avulsa, se a ideia é avulsa)
  const projetoPadrao = semente ? (semente.projeto_id ?? "") : projetoId ?? (filtro !== "todos" && filtro !== "avulsas" ? filtro : "");
  preencherSelect($("#t-projeto"), [{ v: "", t: "Tarefa avulsa (sem projeto)" },
    ...(ro ? estado.projetos : projetosQueGravo()).slice().sort((a, b) => a.titulo.localeCompare(b.titulo)).map((p) => ({ v: p.id, t: p.titulo }))],
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
  soLer(ro, [$("#t-titulo"), $("#t-descricao"), $("#t-projeto"), $("#t-coluna"), $("#t-prioridade"), $("#t-prazo"), $("#t-responsavel")],
    [$("#form-tarefa button[type=submit]")]);
  if (semente) $("#t-projeto").disabled = true; // o banco exige o mesmo projeto da ideia
  $("#t-da-ideia").hidden = !semente && !t?.ideia_id;
  if (semente) $("#t-da-ideia").textContent = "Esta tarefa nasce da ideia aprovada e fica ligada a ela.";
  else daIdeia(t, $("#t-da-ideia"));
  $("#form-tarefa .acoes [data-fechar]").textContent = ro ? "Fechar" : "Cancelar";
  $("#l-editar").textContent = ro ? "Ver detalhes" : "Editar";
  if (ro) $("#t-visivel").textContent = NOTA_ADMIN;
  const leitura = !!t && celular();
  if (leitura) preencherLeitura(t);
  $("#t-leitura").hidden = !leitura;
  $("#form-tarefa").hidden = leitura;
  $("#dlg-tarefa").showModal();
}

// Celular: a tarefa em leitura, no modelo do cartão (nome, projeto, etiquetas), com o campo "Coluna" que grava na hora.
function preencherLeitura(t) {
  const meu = t.responsavel_id === estado.usuario.id;
  $("#l-titulo").textContent = t.titulo;
  $("#l-titulo").classList.toggle("feita", !!t.concluida_em);
  $("#l-origem").textContent = origemDaTarefa(t);
  $("#l-origem").className = "origem" + (t.projeto_id ? "" : " avulsa");
  $("#l-chips").replaceChildren(chipsDaTarefa(t));
  $("#l-responsavel").replaceChildren(avatar(t.responsavel_id), el("span", { text: nomePerfil(t.responsavel_id) || "Sem responsável" }));
  $("#l-descricao").textContent = t.descricao || "";
  $("#l-descricao").hidden = !t.descricao;
  daIdeia(t, $("#l-da-ideia"));
  preencherSelect($("#l-coluna"), colunasDe("tarefas").map((c) => ({ v: c.id, t: c.nome })), t.coluna_id);
  travarConclusao($("#l-coluna"), meu, t.coluna_id); // só o responsável leva para a coluna concluída, ou tira de lá
  $("#l-coluna").disabled = vejoComoAdmin(t.projeto_id);
  $("#l-historico").textContent = historico(t);
  $("#l-concluir").hidden = !meu; // só o responsável conclui
  $("#l-concluir").textContent = t.concluida_em ? "Reabrir" : "Concluir";
}
$("#l-editar").addEventListener("click", () => { $("#t-leitura").hidden = true; $("#form-tarefa").hidden = false; });
$("#l-concluir").addEventListener("click", () => $("#t-concluir").click());
$("#l-coluna").addEventListener("change", async (e) => {
  const t = estado.tarefas.find((x) => x.id === estado.editando?.id);
  if (!t) return;
  const destino = e.target.value;
  const nome = e.target.selectedOptions[0]?.textContent ?? "";
  // Entrar na coluna concluída conclui a tarefa, e sair dela reabre: nesses casos o painel fecha, como no botão "Concluir"
  const mudaConclusao = colunaConcluida(destino) !== colunaConcluida(t.coluna_id);
  if (mudaConclusao) fecharTarefa();
  const gravou = await mover("tarefas", t.id, destino, null);
  if (gravou) aviso("Tarefa movida para " + nome + ".");
  const atual = estado.tarefas.find((x) => x.id === t.id);
  if (!mudaConclusao && atual && $("#dlg-tarefa").open && !$("#t-leitura").hidden) { $("#t-coluna").value = atual.coluna_id; preencherLeitura(atual); }
});

// O responsável de uma tarefa de projeto precisa ter acesso ao projeto.
export function pessoasDaTarefa(atual) {
  const projetoId = $("#t-projeto").value;
  const ids = projetoId ? pessoasDoProjeto(projetoId) : null;
  const opcoes = opcoesPessoas(ids, ids ? null : atual);
  preencherSelect($("#t-responsavel"), opcoes, opcoes.some((o) => o.v === atual) ? atual : (opcoes.some((o) => o.v === estado.usuario.id) ? estado.usuario.id : ""));
  $("#t-visivel").textContent = projetoId
    ? "Todos que têm acesso ao projeto veem esta tarefa dentro dele. No quadro de tarefas ela aparece só para o responsável e para o administrador."
    : "Tarefa avulsa: só você e o responsável enxergam.";
}
$("#t-projeto").addEventListener("change", () => pessoasDaTarefa($("#t-responsavel").value));

$("#form-tarefa").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = estado.editando.id;
  const atual = id ? estado.tarefas.find((x) => x.id === id) : null;
  if (atual && vejoComoAdmin(atual.projeto_id)) return;
  const dados = {
    titulo: $("#t-titulo").value.trim(), descricao: $("#t-descricao").value.trim(),
    projeto_id: $("#t-projeto").value || null, coluna_id: $("#t-coluna").value,
    prioridade: $("#t-prioridade").value, prazo: $("#t-prazo").value || null,
    responsavel_id: $("#t-responsavel").value || null,
  };
  if (!dados.titulo || !dados.prazo || !dados.responsavel_id) return;
  if (!atual || atual.coluna_id !== dados.coluna_id) dados.ordem = proximaOrdem("tarefas", dados.coluna_id);
  const origem = !id ? semente : null;
  if (origem) dados.ideia_id = origem.ideia_id;
  const { error } = id ? await sb.from("tarefas").update(dados).eq("id", id) : await sb.from("tarefas").insert(dados);
  if (error) { aviso("Não foi possível salvar a tarefa: " + traduz(error)); return; }
  semente = null; // a volta para a ideia acontece depois de os dados serem recarregados
  fecharTarefa();
  await de.carregar();
  if (origem) { aviso("Tarefa criada a partir da ideia."); origem.aoFechar?.(); return; }
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
