// Projetos: a janela do projeto, quem pode ver (equipe) e a lista de tarefas dentro dele.
// No celular a janela ocupa a tela inteira, e o projeto que já existe abre primeiro em leitura.
import { sb } from "./supabase.js";
import { de } from "./ligacoes.js";
import { $, el, celular, dataCurta, aviso, traduz, preencherSelect, confirmar, soLer } from "./util.js";
import { estado, colunasDe, nomePerfil, proximaOrdem, avatar, atrasado, historico, travarConclusao, opcoesPessoas, vejoComoAdmin, NOTA_ADMIN } from "./estado.js";
import { botaoConcluir, abrirTarefa, linhaDaTarefa } from "./tarefas.js";
import { mover, chipsDoProjeto, andamentoDoProjeto } from "./quadro.js";
import { renderIdeiasDoProjeto } from "./ideias.js";

$("#novo-projeto").addEventListener("click", () => abrirProjeto(null));

let projetoAberto = null; // o projeto mostrado na janela, mesmo com a janela da tarefa por cima

export function abrirProjeto(id, colunaId) {
  const colunas = colunasDe("projetos");
  if (!colunas.length) { aviso("Crie ao menos uma coluna no quadro de projetos, em Configurações."); return; }
  const eu = estado.usuario.id;
  const p = id ? estado.projetos.find((x) => x.id === id) : null;
  estado.editando = { tipo: "projeto", id: p ? p.id : null };
  projetoAberto = estado.editando.id;
  const ro = !!p && vejoComoAdmin(p.id); // administrador em projeto de que não faz parte: só lê
  $("#p-janela").textContent = ro ? "Projeto" : p ? "Editar projeto" : "Novo projeto";
  $("#p-titulo").value = p?.titulo ?? "";
  $("#p-descricao").value = p?.descricao ?? "";
  preencherSelect($("#p-coluna"), colunas.map((c) => ({ v: c.id, t: c.nome })), p?.coluna_id ?? colunaId ?? colunas[0].id);
  $("#p-prioridade").value = p?.prioridade ?? "media";
  $("#p-prazo").value = p?.prazo ?? "";
  preencherSelect($("#p-responsavel"), opcoesPessoas(null, p?.responsavel_id), p?.responsavel_id ?? eu);
  // Só o responsável troca o responsável; a equipe é definida por ele (ou por quem criou o projeto).
  $("#p-responsavel").disabled = !!p && !!p.responsavel_id && p.responsavel_id !== eu;
  estado.editando.gerencia = !p || p.responsavel_id === eu || p.criado_por === eu;
  renderMembros(p ? estado.membros.filter((m) => m.projeto_id === p.id).map((m) => m.usuario_id) : []);
  $("#p-historico").textContent = p ? historico(p) : "";
  $("#p-historico").hidden = !p;
  $("#p-tarefas").hidden = !p;
  $("#p-ideias").hidden = !p; // como as tarefas, as ideias só entram no projeto que já existe
  $("#p-excluir").hidden = !p || p.responsavel_id !== eu; // só o responsável exclui
  travarConclusao($("#p-coluna"), !p || p.responsavel_id === eu, p?.coluna_id);
  soLer(ro, [$("#p-titulo"), $("#p-descricao"), $("#p-coluna"), $("#p-prioridade"), $("#p-prazo")],
    [$("#form-projeto button[type=submit]"), $("#p-adicionar"), $("#p-ideias .registro-linha"), $("#lp-nova"), $("#lp-ideias .registro-linha")]);
  $("#form-projeto .acoes [data-fechar]").textContent = ro ? "Fechar" : "Cancelar";
  $("#lp-editar").textContent = ro ? "Ver detalhes" : "Editar";
  const leitura = !!p && celular();
  $("#p-leitura").hidden = !leitura;
  $("#form-projeto").hidden = leitura;
  renderTarefasDoProjeto();
  $("#dlg-projeto").showModal();
  $("#dlg-projeto").scrollTop = 0;
}

// Celular: o projeto em leitura, no modelo do cartão (nome, etiquetas, andamento), com o campo "Coluna" que grava na hora
// e as tarefas dele no mesmo modelo da Lista. É refeita sempre que os dados mudam, enquanto estiver à mostra.
function preencherLeitura(p) {
  const meu = p.responsavel_id === estado.usuario.id;
  $("#lp-titulo").textContent = p.titulo;
  $("#lp-chips").replaceChildren(chipsDoProjeto(p));
  $("#lp-responsavel").replaceChildren(avatar(p.responsavel_id), el("span", { text: nomePerfil(p.responsavel_id) || "Sem responsável" }));
  $("#lp-descricao").textContent = p.descricao || "";
  $("#lp-descricao").hidden = !p.descricao;
  preencherSelect($("#lp-coluna"), colunasDe("projetos").map((c) => ({ v: c.id, t: c.nome })), p.coluna_id);
  travarConclusao($("#lp-coluna"), meu, p.coluna_id); // só o responsável leva o projeto para a coluna concluída, ou tira de lá
  $("#lp-coluna").disabled = vejoComoAdmin(p.id);
  $("#lp-andamento").replaceChildren(...[andamentoDoProjeto(p)].filter(Boolean));
  const tarefas = tarefasDoProjeto(p.id);
  $("#lp-contagem").textContent = String(tarefas.length);
  $("#lp-lista").replaceChildren(...(tarefas.length
    ? tarefas.map((t) => {
        const coluna = estado.colunas.find((c) => c.id === t.coluna_id)?.nome;
        return linhaDaTarefa(t, !t.concluida_em && coluna ? el("span", { class: "chip", text: coluna, title: "Coluna no quadro" }) : null, true);
      })
    : [el("p", { class: "apoio", text: "Este projeto ainda não tem tarefas." })]));
  $("#lp-historico").textContent = historico(p) + (vejoComoAdmin(p.id) ? " " + NOTA_ADMIN : "");
}
$("#lp-editar").addEventListener("click", () => { $("#p-leitura").hidden = true; $("#form-projeto").hidden = false; $("#dlg-projeto").scrollTop = 0; });
$("#lp-nova").addEventListener("click", () => abrirTarefa(null, null, projetoAberto));
$("#lp-coluna").addEventListener("change", async (e) => {
  const p = estado.projetos.find((x) => x.id === projetoAberto);
  if (!p) return;
  const nome = e.target.selectedOptions[0]?.textContent ?? "";
  const gravou = await mover("projetos", p.id, e.target.value, null);
  if (gravou) aviso("Projeto movido para " + nome + ".");
  const atual = estado.projetos.find((x) => x.id === p.id);
  if (atual && $("#dlg-projeto").open) { $("#p-coluna").value = atual.coluna_id; if (!$("#p-leitura").hidden) preencherLeitura(atual); }
});

// Abertas primeiro, por data; concluídas no fim da fila, tachadas.
function tarefasDoProjeto(id) {
  const chave = (t) => (t.concluida_em ? "1" : "0") + (t.prazo || "9999") + t.criado_em;
  return estado.tarefas.filter((t) => t.projeto_id === id).sort((a, b) => (chave(a) < chave(b) ? -1 : 1));
}

export function renderMembros(marcados) {
  const responsavel = $("#p-responsavel").value;
  const pode = estado.editando.gerencia;
  const caixa = $("#p-membros");
  caixa.replaceChildren();
  for (const p of estado.perfis.filter((x) => x.ativo || marcados.includes(x.id))) {
    const fixo = p.id === responsavel;
    const campo = el("input", { type: "checkbox", value: p.id, checked: fixo || marcados.includes(p.id), disabled: fixo || !pode });
    caixa.append(el("label", { class: fixo ? "fixo" : "" }, campo, (p.nome || p.email) + (fixo ? " (responsável)" : "")));
  }
  ordenarMembros();
  $("#p-seletor").open = false;
  $("#p-membros-busca").value = "";
  const id = estado.editando.id;
  $("#p-membros-nota").textContent = pode
    ? "Só o responsável, as pessoas selecionadas e o administrador enxergam o projeto e o que é dele."
    : id && vejoComoAdmin(id) ? NOTA_ADMIN : "Só o responsável pelo projeto altera quem pode ver.";
  resumoMembros();
}
export function membrosMarcados() {
  const responsavel = $("#p-responsavel").value;
  return [...document.querySelectorAll("#p-membros input:checked")].map((c) => c.value).filter((v) => v !== responsavel);
}
// Responsável primeiro, depois quem está selecionado, depois os demais; em ordem alfabética dentro de cada grupo.
// Só reordena ao montar e ao abrir a lista, para as linhas não pularem enquanto a pessoa marca.
function ordenarMembros() {
  const grupo = (l) => (l.classList.contains("fixo") ? 0 : l.querySelector("input").checked ? 1 : 2);
  const linhas = [...document.querySelectorAll("#p-membros label")];
  linhas.sort((a, b) => grupo(a) - grupo(b) || a.textContent.localeCompare(b.textContent, "pt-BR"));
  $("#p-membros").append(...linhas);
  $("#p-membros").scrollTop = 0;
}
$("#p-seletor").addEventListener("toggle", () => { if ($("#p-seletor").open) ordenarMembros(); });
// O campo mostra sempre o mesmo convite; quem está marcado aparece na lista, ao abrir.
export function resumoMembros() {
  $("#p-membros-resumo").textContent = estado.editando?.gerencia === false ? "Clique para ver" : "Clique para escolher";
}
// Celular: a escolha de quem pode ver abre em um painel vindo de baixo, com "Cancelar" e "Aplicar".
// A busca e a lista de pessoas são as mesmas do formulário: mudam de lugar ao abrir e voltam ao fechar.
// "Cancelar", o toque fora e a tecla Esc desfazem o que foi marcado; só "Aplicar" mantém.
let marcadosAntes = null;
$("#p-membros-resumo").addEventListener("click", (e) => {
  if (!celular()) return;
  e.preventDefault();
  const pode = estado.editando?.gerencia !== false;
  marcadosAntes = membrosMarcados();
  ordenarMembros();
  $("#equipe-lugar").append($("#p-membros-busca"), $("#p-membros"));
  $("#equipe-nota").textContent = $("#p-membros-nota").textContent;
  $("#equipe-aplicar").hidden = !pode;
  $("#equipe-cancelar").textContent = pode ? "Cancelar" : "Fechar";
  $("#dlg-equipe").showModal();
  document.activeElement?.blur(); // sem isto o campo de busca ganha o cursor e o teclado do celular sobe sozinho
});
$("#equipe-lugar").addEventListener("change", () => { $("#dlg-equipe").dataset.alterado = "1"; });
$("#equipe-cancelar").addEventListener("click", () => $("#dlg-equipe").close());
$("#equipe-aplicar").addEventListener("click", () => {
  if ($("#dlg-equipe").dataset.alterado) $("#dlg-projeto").dataset.alterado = "1";
  marcadosAntes = null;
  $("#dlg-equipe").close();
});
$("#dlg-equipe").addEventListener("close", () => {
  if (marcadosAntes) for (const c of document.querySelectorAll("#p-membros input:not(:disabled)")) c.checked = marcadosAntes.includes(c.value);
  marcadosAntes = null;
  $("#p-membros-busca").value = "";
  for (const linha of document.querySelectorAll("#p-membros label")) linha.hidden = false;
  $("#p-seletor .seletor-painel").append($("#p-membros-busca"), $("#p-membros"));
});

// A lista abre por cima do conteúdo; fecha ao clicar fora dela ou com a tecla Esc (sem fechar a janela do projeto).
$("#dlg-projeto").addEventListener("click", (e) => { if (!e.target.closest("#p-seletor")) $("#p-seletor").open = false; });
$("#p-seletor").addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !$("#p-seletor").open) return;
  e.preventDefault();
  $("#p-seletor").open = false;
  $("#p-membros-resumo").focus();
});
$("#p-membros-busca").addEventListener("input", (e) => {
  const termo = e.target.value.trim().toLowerCase();
  for (const linha of document.querySelectorAll("#p-membros label")) linha.hidden = !!termo && !linha.textContent.toLowerCase().includes(termo);
});
$("#p-membros-busca").addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
$("#p-responsavel").addEventListener("change", () => renderMembros(membrosMarcados()));

export function renderTarefasDoProjeto() {
  const id = $("#dlg-projeto").open || estado.editando?.tipo === "projeto" ? projetoAberto : null;
  const lista = $("#p-lista");
  lista.replaceChildren();
  if (!id) return;
  const aberto = estado.projetos.find((x) => x.id === id);
  if (aberto && !$("#p-leitura").hidden) preencherLeitura(aberto);
  renderIdeiasDoProjeto(id);
  const tarefas = tarefasDoProjeto(id);
  if (!tarefas.length) { lista.append(el("li", { class: "vazio", text: "Este projeto ainda não tem tarefas." })); return; }
  for (const t of tarefas) {
    const col = estado.colunas.find((c) => c.id === t.coluna_id);
    const resp = nomePerfil(t.responsavel_id);
    const situacao = t.concluida_em ? "Concluída" : (atrasado(t) ? "Atrasada, " : "") + (t.prazo ? dataCurta(t.prazo) : col?.nome ?? "");
    lista.append(el("li", { class: t.concluida_em ? "feita" : "" },
      botaoConcluir(t),
      el("button", { type: "button", onclick: () => abrirTarefa(t.id) },
        el("span", { class: "titulo-tarefa", text: t.titulo }),
        el("span", { class: "situacao", text: [resp, situacao].filter(Boolean).join(", ") }))));
  }
}

$("#p-adicionar").addEventListener("click", () => {
  abrirTarefa(null, null, projetoAberto);
});

$("#form-projeto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = estado.editando.id;
  if (id && vejoComoAdmin(id)) return;
  const atual = id ? estado.projetos.find((x) => x.id === id) : null;
  const dados = {
    titulo: $("#p-titulo").value.trim(), descricao: $("#p-descricao").value.trim(),
    coluna_id: $("#p-coluna").value, prioridade: $("#p-prioridade").value,
    prazo: $("#p-prazo").value || null, responsavel_id: $("#p-responsavel").value,
  };
  if (!dados.titulo || !dados.responsavel_id) return;
  if (!atual || atual.coluna_id !== dados.coluna_id) dados.ordem = proximaOrdem("projetos", dados.coluna_id);
  const projetoId = id ?? crypto.randomUUID();
  const marcados = membrosMarcados();
  const antes = id ? estado.membros.filter((m) => m.projeto_id === id).map((m) => m.usuario_id) : [];
  const incluir = marcados.filter((u) => !antes.includes(u));
  const retirar = antes.filter((u) => !marcados.includes(u));

  if (!id) {
    const { error } = await sb.from("projetos").insert({ id: projetoId, ...dados });
    if (error) { aviso("Não foi possível salvar o projeto: " + traduz(error)); return; }
  }
  if (estado.editando.gerencia) {
    if (incluir.length) {
      const { error } = await sb.from("projeto_membros").insert(incluir.map((u) => ({ projeto_id: projetoId, usuario_id: u })));
      if (error) { aviso("Não foi possível salvar quem pode ver o projeto: " + traduz(error)); await de.carregar(); return; }
    }
    if (retirar.length) {
      const { error } = await sb.from("projeto_membros").delete().eq("projeto_id", projetoId).in("usuario_id", retirar);
      if (error) { aviso("Não foi possível salvar quem pode ver o projeto: " + traduz(error)); await de.carregar(); return; }
    }
  }
  if (id) {
    if ($("#p-responsavel").disabled) delete dados.responsavel_id;
    const { error } = await sb.from("projetos").update(dados).eq("id", id);
    if (error) { aviso("Não foi possível salvar o projeto: " + traduz(error)); await de.carregar(); return; }
  }
  $("#dlg-projeto").close();
  await de.carregar();
});

$("#p-excluir").addEventListener("click", async () => {
  const p = estado.projetos.find((x) => x.id === estado.editando.id);
  if (!p) return;
  const n = estado.tarefas.filter((t) => t.projeto_id === p.id).length;
  const extra = n === 1 ? " A tarefa dele sai do quadro junto." : n > 1 ? ` As ${n} tarefas dele saem do quadro junto.` : "";
  if (!(await confirmar(`Excluir o projeto "${p.titulo}"?${extra} Ele vai para a lixeira, e o administrador pode restaurar.`))) return;
  const { error } = await sb.from("projetos").update({ arquivado_em: new Date().toISOString() }).eq("id", p.id);
  if (error) { aviso("Não foi possível excluir: " + traduz(error)); return; }
  $("#dlg-projeto").close();
  await de.carregar();
});
