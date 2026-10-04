// Projetos: a janela do projeto, quem pode ver (equipe) e a lista de tarefas dentro dele.
import { sb } from "./supabase.js";
import { de } from "./ligacoes.js";
import { $, el, dataCurta, aviso, traduz, preencherSelect, confirmar } from "./util.js";
import { estado, colunasDe, nomePerfil, proximaOrdem, atrasado, historico, travarConclusao, opcoesPessoas } from "./estado.js";
import { botaoConcluir, abrirTarefa } from "./tarefas.js";

$("#novo-projeto").addEventListener("click", () => abrirProjeto(null));

let projetoAberto = null; // o projeto mostrado na janela, mesmo com a janela da tarefa por cima

export function abrirProjeto(id, colunaId) {
  const colunas = colunasDe("projetos");
  if (!colunas.length) { aviso("Crie ao menos uma coluna no quadro de projetos, em Configurações."); return; }
  const eu = estado.usuario.id;
  const p = id ? estado.projetos.find((x) => x.id === id) : null;
  estado.editando = { tipo: "projeto", id: p ? p.id : null };
  projetoAberto = estado.editando.id;
  $("#p-janela").textContent = p ? "Editar projeto" : "Novo projeto";
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
  $("#p-excluir").hidden = !p || p.responsavel_id !== eu; // só o responsável exclui
  travarConclusao($("#p-coluna"), !p || p.responsavel_id === eu, p?.coluna_id);
  renderTarefasDoProjeto();
  $("#dlg-projeto").showModal();
}

export function renderMembros(marcados) {
  const responsavel = $("#p-responsavel").value;
  const pode = estado.editando.gerencia;
  const caixa = $("#p-membros");
  caixa.replaceChildren();
  for (const p of estado.perfis.filter((x) => x.ativo || marcados.includes(x.id))) {
    const fixo = p.id === responsavel;
    const campo = el("input", { type: "checkbox", value: p.id, checked: fixo || marcados.includes(p.id), disabled: fixo || !pode });
    campo.addEventListener("change", resumoMembros);
    caixa.append(el("label", { class: fixo ? "fixo" : "" }, campo, (p.nome || p.email) + (fixo ? " (responsável)" : "")));
  }
  $("#p-seletor").open = false;
  $("#p-membros-busca").value = "";
  $("#p-membros-nota").textContent = pode
    ? "Só o responsável e as pessoas selecionadas enxergam o projeto e as tarefas dele."
    : "Só o responsável pelo projeto altera quem pode ver.";
  resumoMembros();
}
export function membrosMarcados() {
  const responsavel = $("#p-responsavel").value;
  return [...document.querySelectorAll("#p-membros input:checked")].map((c) => c.value).filter((v) => v !== responsavel);
}
export function resumoMembros() {
  const nomes = membrosMarcados().map(nomePerfil);
  $("#p-membros-resumo").textContent = !nomes.length ? "Só o responsável"
    : nomes.length <= 2 ? nomes.join(" e ")
    : `${nomes[0]}, ${nomes[1]} e mais ${nomes.length - 2}`;
}
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
  // Abertas primeiro, por data; concluídas no fim da fila, tachadas.
  const chave = (t) => (t.concluida_em ? "1" : "0") + (t.prazo || "9999") + t.criado_em;
  const tarefas = estado.tarefas.filter((t) => t.projeto_id === id).sort((a, b) => (chave(a) < chave(b) ? -1 : 1));
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
