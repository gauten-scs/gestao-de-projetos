// Lixeira de cada pessoa (o que ela excluiu nos últimos 30 dias) e a restauração de itens.
import { sb } from "./supabase.js";
import { de } from "./ligacoes.js";
import { $, el, dois, dataHora, aviso, traduz } from "./util.js";
import { estado } from "./estado.js";

export function renderMinhaLixeira() {
  const tabela = $("#tabela-minha-lixeira");
  tabela.replaceChildren(el("tr", { class: "linha-titulos" }, ...["Item", "Tipo", "Excluído em", "Sai da lixeira em", ""].map((t) => el("th", { text: t, scope: "col" }))));
  for (const i of estado.minhaLixeira) {
    const sai = new Date(new Date(i.arquivado_em).getTime() + 30 * 86400000);
    tabela.append(el("tr", {},
      el("td", { class: "c-nome", text: i.titulo }),
      el("td", { class: "c-tipo" }, el("span", { class: "selo", text: i.tipo })),
      el("td", { class: "c-dado", "data-rotulo": "Excluído em", text: dataHora(i.arquivado_em) }),
      el("td", { class: "c-dado", "data-rotulo": "Sai da lixeira em", text: `${dois(sai.getDate())}/${dois(sai.getMonth() + 1)}/${sai.getFullYear()}` }),
      el("td", { class: "c-acoes" }, el("div", { class: "acoes" },
        el("button", { class: "btn secundario mini", type: "button", text: "Restaurar", onclick: () => restaurar(i) })))));
  }
  if (!estado.minhaLixeira.length) tabela.append(el("tr", {}, el("td", { colSpan: 5, class: "apoio", text: "A sua lixeira está vazia." })));
}

export async function restaurar(item) {
  const { error } = await sb.rpc("restaurar_item", { tabela: item.tabela, item: item.id });
  if (error) aviso("Não foi possível restaurar: " + traduz(error)); else aviso({ tarefas: "Tarefa restaurada.", ideias: "Ideia restaurada." }[item.tabela] ?? "Projeto restaurado.");
  await de.carregar();
}
