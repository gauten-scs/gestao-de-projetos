// Configurações (somente admin): usuários, colunas dos quadros, lixeira geral e convites.
import { sb } from "./supabase.js";
import { de } from "./ligacoes.js";
import { $, el, dataHora, aviso, mensagem, traduz, confirmar } from "./util.js";
import { estado, colunasDe, nomePerfil, avatar } from "./estado.js";
import { restaurar } from "./lixeira.js";

export function renderConfig() {
  const mini = (texto, acao, desligado) => el("button", { class: "btn secundario mini", type: "button", text: texto, disabled: desligado, onclick: acao });

  // Usuários
  const usuarios = $("#tabela-usuarios");
  usuarios.replaceChildren(el("tr", {}, ...["Nome", "E-mail", "Tipo", "Acesso", ""].map((t) => el("th", { text: t, scope: "col" }))));
  for (const p of estado.perfis) {
    const eu = p.id === estado.usuario.id;
    const tipo = el("select", { disabled: eu, "aria-label": "Tipo de usuário de " + (p.nome || p.email) },
      el("option", { value: "membro", text: "Usuário" }), el("option", { value: "admin", text: "Administrador" }));
    tipo.value = p.papel;
    tipo.addEventListener("change", () => alterarPerfil(p.id, { papel: tipo.value }));
    usuarios.append(el("tr", {},
      el("td", { class: "pessoa" }, avatar(p.id), (p.nome || "(sem nome)") + (eu ? " (você)" : "")),
      el("td", { text: p.email }),
      el("td", {}, tipo),
      el("td", {}, el("span", { class: "selo" + (p.ativo ? " sim" : ""), text: p.ativo ? "Liberado" : "Bloqueado" })),
      el("td", {}, el("div", { class: "acoes" },
        mini(p.ativo ? "Bloquear" : "Liberar", () => alterarPerfil(p.id, { ativo: !p.ativo }), eu),
        mini("Gerar novo link", () => novoLink(p))))));
  }

  // Colunas
  for (const quadro of ["projetos", "tarefas"]) {
    const tabela = $("#tabela-colunas-" + quadro);
    const colunas = colunasDe(quadro);
    const titulos = ["Coluna", "Conta como concluído", ""];
    tabela.replaceChildren(el("tr", {}, ...titulos.map((t) => el("th", { text: t, scope: "col" }))));
    colunas.forEach((c, n) => {
      tabela.append(el("tr", {},
        el("td", { text: c.nome }),
        el("td", {}, el("span", { class: "selo" + (c.concluida ? " sim" : ""), text: c.concluida ? "Sim" : "Não" })),
        el("td", {}, el("div", { class: "acoes" },
          mini("Subir", () => reordenarColuna(quadro, n, -1), n === 0),
          mini("Descer", () => reordenarColuna(quadro, n, 1), n === colunas.length - 1),
          mini("Editar", () => abrirColuna(quadro, c.id)),
          mini("Excluir", () => excluirColuna(c))))));
    });
    if (!colunas.length) tabela.append(el("tr", {}, el("td", { colSpan: 3, class: "apoio", text: "Nenhuma coluna." })));
  }

  // Lixeira
  const lixeira = $("#tabela-lixeira");
  const itens = [
    ...estado.lixeira.projetos.map((i) => ({ ...i, tabela: "projetos", tipo: "Projeto" })),
    ...estado.lixeira.tarefas.map((i) => ({ ...i, tabela: "tarefas", tipo: "Tarefa" })),
    ...estado.lixeira.ideias.map((i) => ({ ...i, titulo: i.texto.length > 80 ? i.texto.slice(0, 80).trimEnd() + "..." : i.texto, tabela: "ideias", tipo: "Ideia" })),
  ].sort((a, b) => (a.arquivado_em < b.arquivado_em ? 1 : -1));
  lixeira.replaceChildren(el("tr", {}, ...["Item", "Tipo", "Excluído por", "Quando", ""].map((t) => el("th", { text: t, scope: "col" }))));
  for (const i of itens) {
    lixeira.append(el("tr", {},
      el("td", { text: i.titulo }),
      el("td", {}, el("span", { class: "selo", text: i.tipo })),
      el("td", { text: nomePerfil(i.arquivado_por) || "usuário removido" }),
      el("td", { text: dataHora(i.arquivado_em) }),
      el("td", {}, el("div", { class: "acoes" },
        mini("Restaurar", () => restaurar(i)),
        mini("Excluir de vez", () => excluirDeVez(i))))));
  }
  if (!itens.length) lixeira.append(el("tr", {}, el("td", { colSpan: 5, class: "apoio", text: "A lixeira está vazia." })));
}

export async function excluirDeVez(item) {
  const extra = item.tabela === "projetos" ? " As tarefas dele também serão apagadas." : "";
  if (!(await confirmar(`Excluir de vez "${item.titulo}"?${extra} Esta ação não pode ser desfeita.`, "Excluir de vez"))) return;
  const { error } = await sb.from(item.tabela).delete().eq("id", item.id);
  if (error) aviso("Não foi possível excluir: " + traduz(error));
  await de.carregar();
}

export async function alterarPerfil(id, dados) {
  const { error } = await sb.from("perfis").update(dados).eq("id", id);
  if (error) aviso("Não foi possível alterar o usuário: " + traduz(error));
  await de.carregar();
}

export async function reordenarColuna(quadro, indice, passo) {
  const colunas = colunasDe(quadro);
  const [movida] = colunas.splice(indice, 1);
  colunas.splice(indice + passo, 0, movida);
  const mudancas = [];
  colunas.forEach((c, n) => { if (c.ordem !== n + 1) { c.ordem = n + 1; mudancas.push(c); } });
  de.renderizar();
  const respostas = await Promise.all(mudancas.map((c) => sb.from("colunas").update({ ordem: c.ordem }).eq("id", c.id)));
  const falha = respostas.find((r) => r.error);
  if (falha) { aviso("Não foi possível reordenar: " + traduz(falha.error)); await de.carregar(); }
}

export function abrirColuna(quadro, id) {
  const c = id ? estado.colunas.find((x) => x.id === id) : null;
  estado.editando = { tipo: "coluna", id, quadro };
  $("#c-janela").textContent = c ? "Editar coluna" : "Nova coluna";
  $("#c-nome").value = c?.nome ?? "";
  $("#c-concluida").checked = c?.concluida ?? false;
  $("#dlg-coluna").showModal();
}

$("#form-coluna").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { id, quadro } = estado.editando;
  const dados = { nome: $("#c-nome").value.trim(), concluida: $("#c-concluida").checked };
  if (!dados.nome) return;
  const { error } = id
    ? await sb.from("colunas").update(dados).eq("id", id)
    : await sb.from("colunas").insert({ ...dados, quadro, ordem: Math.max(0, ...colunasDe(quadro).map((c) => c.ordem)) + 1 });
  if (error) { aviso("Não foi possível salvar a coluna: " + traduz(error)); return; }
  $("#dlg-coluna").close();
  await de.carregar();
});

export async function excluirColuna(c) {
  const quantos = estado[c.quadro].filter((i) => i.coluna_id === c.id).length;
  if (quantos) { aviso(`A coluna "${c.nome}" ainda tem ${quantos} ${quantos === 1 ? "cartão" : "cartões"}. Mova ou exclua antes.`); return; }
  if (!(await confirmar(`Excluir a coluna "${c.nome}"?`))) return;
  const { error } = await sb.from("colunas").delete().eq("id", c.id);
  if (error) aviso(error.code === "23503"
    ? "Há cartões na lixeira que ainda usam esta coluna. Restaure ou exclua de vez esses cartões antes."
    : "Não foi possível excluir a coluna: " + traduz(error));
  await de.carregar();
}

// ---------- Convites ----------
export async function chamarConvites(corpo) {
  const { data, error } = await sb.functions.invoke("convites", { body: corpo });
  if (error) {
    let texto = error.message;
    try { const j = await error.context.json(); if (j?.erro) texto = j.erro; } catch (_) { /* mantém o texto padrão */ }
    throw new Error(texto);
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

export function mostrarLink(resposta, nome) {
  const base = location.href.split(/[?#]/)[0];
  $("#v-link").value = `${base}?convite=${encodeURIComponent(resposta.token)}&tipo=${resposta.tipo}`;
  $("#convite-texto").textContent = resposta.tipo === "invite"
    ? `Envie este link para ${nome}. Ao abrir, a pessoa cria a própria senha e entra no site.`
    : `Envie este link para ${nome}. Ao abrir, a pessoa define uma nova senha.`;
  $("#convite-dados").hidden = true; $("#v-gerar").hidden = true;
  $("#convite-link").hidden = false; $("#v-copiar").hidden = false;
}

export function abrirConvite() {
  $("#form-convite").reset();
  mensagem("#convite-msg", "");
  $("#convite-dados").hidden = false; $("#v-gerar").hidden = false;
  $("#convite-link").hidden = true; $("#v-copiar").hidden = true;
  for (const campo of ["#v-nome", "#v-email"]) $(campo).required = true;
  $("#dlg-convite").showModal();
}
$("#convidar").addEventListener("click", abrirConvite);

$("#form-convite").addEventListener("submit", async (e) => {
  e.preventDefault();
  mensagem("#convite-msg", "");
  const nome = $("#v-nome").value.trim();
  $("#v-gerar").disabled = true;
  try {
    const resposta = await chamarConvites({ acao: "convidar", nome, email: $("#v-email").value.trim(), papel: $("#v-papel").value });
    mostrarLink(resposta, nome);
    await de.carregar();
  } catch (erro) { mensagem("#convite-msg", traduz(erro)); }
  $("#v-gerar").disabled = false;
});

export async function novoLink(p) {
  try {
    const resposta = await chamarConvites({ acao: "novo_link", usuario_id: p.id });
    abrirConvite();
    for (const campo of ["#v-nome", "#v-email"]) $(campo).required = false;
    mostrarLink(resposta, p.nome || p.email);
  } catch (erro) { aviso(traduz(erro)); }
}

$("#v-copiar").addEventListener("click", async () => {
  const campo = $("#v-link");
  try { await navigator.clipboard.writeText(campo.value); }
  catch (_) { campo.select(); document.execCommand("copy"); }
  aviso("Link copiado.");
});
