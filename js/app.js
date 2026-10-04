// Gestão de Projetos | Gauten Smart.GOV
// Site estático (GitHub Pages) + Supabase (login, banco de dados e tempo real).

import { sb } from "./supabase.js";
import { ligar } from "./ligacoes.js";
import { $, el, dois, dataHora, plural, mostrar, aviso, mensagem, traduz, confirmar } from "./util.js";
import { estado, colunasDe, nomePerfil, souAdmin, avatar, atrasado, noMeuQuadro } from "./estado.js";
import { renderQuadro } from "./quadro.js";
import { renderFiltros, botaoConcluir, renderTarefas, abrirTarefa } from "./tarefas.js";
import { abrirProjeto, renderTarefasDoProjeto } from "./projetos.js";

(() => {
  "use strict";

  ligar({ abrirProjeto, abrirTarefa, botaoConcluir, renderizar, carregar });

  // ---------- Entrada ----------
  async function iniciar() {
    const parametros = new URLSearchParams(location.search);
    const token = parametros.get("convite");
    if (token) {
      const tipo = parametros.get("tipo") === "recovery" ? "recovery" : "invite";
      history.replaceState(null, "", location.pathname);
      await sb.auth.signOut({ scope: "local" }).catch(() => {});
      const { error } = await sb.auth.verifyOtp({ token_hash: token, type: tipo });
      if (error) {
        mostrar("tela-login");
        mensagem("#login-msg", "Este link venceu ou já foi usado. Peça um novo link ao administrador.");
        return;
      }
      $("#senha-titulo").textContent = tipo === "invite" ? "Crie a sua senha" : "Defina uma nova senha";
      mostrar("tela-senha");
      return;
    }
    const { data } = await sb.auth.getSession();
    if (data.session) await entrar(); else mostrar("tela-login");
  }

  async function entrar() {
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) { mostrar("tela-login"); return; }
    estado.usuario = data.user;
    const { data: perfil } = await sb.from("perfis").select("*").eq("id", data.user.id).maybeSingle();
    if (!perfil || !perfil.ativo) { mostrar("tela-sem-acesso"); return; }
    estado.perfil = perfil;
    const visao = location.hash.replace("#", "");
    if (["projetos", "tarefas", "lixeira", "config"].includes(visao)) estado.visao = visao;
    if (!(await carregar())) return;
    mostrar("app");
    assinar();
  }

  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    mensagem("#login-msg", "");
    const { error } = await sb.auth.signInWithPassword({ email: $("#login-email").value.trim(), password: $("#login-senha").value });
    if (error) { mensagem("#login-msg", traduz(error)); return; }
    $("#login-senha").value = "";
    await entrar();
  });

  $("#form-senha").addEventListener("submit", async (e) => {
    e.preventDefault();
    mensagem("#senha-msg", "");
    const senha = $("#senha-nova").value;
    if (senha !== $("#senha-repete").value) { mensagem("#senha-msg", "As duas senhas não são iguais."); return; }
    const { error } = await sb.auth.updateUser({ password: senha });
    if (error) { mensagem("#senha-msg", traduz(error)); return; }
    await entrar();
  });

  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-acao='sair']")) { await sb.auth.signOut().catch(() => {}); location.reload(); }
    const fechar = e.target.closest("[data-fechar]");
    if (fechar) fechar.closest("dialog").close();
    const menu = e.target.closest("[data-visao]");
    if (menu) irPara(menu.dataset.visao);
    for (const s of document.querySelectorAll("details.seletor[open]")) if (!s.contains(e.target)) s.open = false;
    const nova = e.target.closest("[data-nova-coluna]");
    if (nova) abrirColuna(nova.dataset.novaColuna, null);
  });

  // ---------- Dados ----------
  async function carregar() {
    const [perfis, colunas, projetos, tarefas, membros] = await Promise.all([
      sb.from("perfis").select("*").order("nome"),
      sb.from("colunas").select("*").order("ordem"),
      sb.from("projetos").select("*").order("ordem"),
      sb.from("tarefas").select("*").order("ordem"),
      sb.from("projeto_membros").select("projeto_id, usuario_id"),
    ]);
    const falha = [perfis, colunas, projetos, tarefas, membros].find((r) => r.error);
    if (falha) { aviso("Não foi possível carregar os dados: " + traduz(falha.error)); return false; }
    estado.perfis = perfis.data; estado.colunas = colunas.data; estado.membros = membros.data;
    // Itens excluídos ficam na lixeira. Tarefas de um projeto excluído acompanham o projeto.
    const foraP = new Set(projetos.data.filter((p) => p.arquivado_em).map((p) => p.id));
    estado.lixeira = {
      projetos: projetos.data.filter((p) => p.arquivado_em),
      tarefas: tarefas.data.filter((t) => t.arquivado_em && t.projeto_id && !foraP.has(t.projeto_id)),
    };
    // Lixeira de cada pessoa: o que ela excluiu como responsável, nos últimos 30 dias.
    const limite = new Date(Date.now() - 30 * 86400000).toISOString();
    const minha = (i) => i.arquivado_em && i.arquivado_em > limite && i.responsavel_id === estado.usuario.id;
    estado.minhaLixeira = [
      ...projetos.data.filter(minha).map((i) => ({ ...i, tabela: "projetos", tipo: "Projeto" })),
      ...tarefas.data.filter((t) => minha(t) && !foraP.has(t.projeto_id)).map((i) => ({ ...i, tabela: "tarefas", tipo: i.projeto_id ? "Tarefa de projeto" : "Tarefa avulsa" })),
    ].sort((a, b) => (a.arquivado_em < b.arquivado_em ? 1 : -1));
    estado.projetos = projetos.data.filter((p) => !p.arquivado_em);
    estado.tarefas = tarefas.data.filter((t) => !t.arquivado_em && !foraP.has(t.projeto_id));
    const eu = estado.perfis.find((p) => p.id === estado.usuario.id);
    if (!eu || !eu.ativo) { mostrar("tela-sem-acesso"); return false; }
    estado.perfil = eu;
    renderizar();
    return true;
  }

  function assinar() {
    if (estado.canal) return;
    let relogio;
    estado.canal = sb.channel("dados")
      .on("postgres_changes", { event: "*", schema: "public" }, () => {
        clearTimeout(relogio);
        relogio = setTimeout(carregar, 400);
      })
      .subscribe();
  }

  // ---------- Navegação ----------
  function irPara(visao) {
    estado.visao = visao;
    history.replaceState(null, "", "#" + visao);
    renderizar();
  }

  function renderizar() {
    if (estado.arrastando) { estado.pendente = true; return; }
    if (estado.visao === "config" && !souAdmin()) estado.visao = "projetos";
    $("#menu-config").hidden = !souAdmin();
    $("#conta-nome").textContent = estado.perfil.nome || estado.perfil.email;
    $("#conta-papel").textContent = souAdmin() ? "Administrador" : "Usuário";
    $("#conta-avatar").replaceWith(Object.assign(avatar(estado.perfil.id), { id: "conta-avatar" }));
    renderResumos();
    for (const b of document.querySelectorAll("[data-visao]")) {
      if (b.dataset.visao === estado.visao) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    }
    for (const v of ["projetos", "tarefas", "lixeira", "config"]) $("#visao-" + v).hidden = v !== estado.visao;
    if (estado.visao === "projetos") renderQuadro("projetos");
    if (estado.visao === "tarefas") { renderFiltros(); renderTarefas(); }
    if (estado.visao === "lixeira") renderMinhaLixeira();
    if (estado.visao === "config") renderConfig();
    if ($("#dlg-projeto").open) renderTarefasDoProjeto();
  }

  // ---------- Resumos do menu ----------
  function renderResumos() {
    const pAtrasados = estado.projetos.filter(atrasado).length;
    $("#resumo-projetos").replaceChildren(plural(estado.projetos.length, "projeto", "projetos"),
      ...(pAtrasados ? [", ", el("strong", { text: plural(pAtrasados, "atrasado", "atrasados") })] : []));
    const abertas = estado.tarefas.filter((t) => noMeuQuadro(t) && !t.concluida_em);
    const tAtrasadas = abertas.filter(atrasado).length;
    $("#resumo-tarefas").replaceChildren(plural(abertas.length, "tarefa aberta", "tarefas abertas"),
      ...(tAtrasadas ? [", ", el("strong", { text: plural(tAtrasadas, "atrasada", "atrasadas") })] : []));
  }

  // ---------- Lixeira de cada pessoa ----------
  function renderMinhaLixeira() {
    const tabela = $("#tabela-minha-lixeira");
    tabela.replaceChildren(el("tr", {}, ...["Item", "Tipo", "Excluído em", "Sai da lixeira em", ""].map((t) => el("th", { text: t, scope: "col" }))));
    for (const i of estado.minhaLixeira) {
      const sai = new Date(new Date(i.arquivado_em).getTime() + 30 * 86400000);
      tabela.append(el("tr", {},
        el("td", { text: i.titulo }),
        el("td", {}, el("span", { class: "selo", text: i.tipo })),
        el("td", { text: dataHora(i.arquivado_em) }),
        el("td", { text: `${dois(sai.getDate())}/${dois(sai.getMonth() + 1)}/${sai.getFullYear()}` }),
        el("td", {}, el("div", { class: "acoes" },
          el("button", { class: "btn secundario mini", type: "button", text: "Restaurar", onclick: () => restaurar(i) })))));
    }
    if (!estado.minhaLixeira.length) tabela.append(el("tr", {}, el("td", { colSpan: 5, class: "apoio", text: "A sua lixeira está vazia." })));
  }

  // ---------- Configurações (somente admin) ----------
  function renderConfig() {
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

  async function restaurar(item) {
    const { error } = await sb.rpc("restaurar_item", { tabela: item.tabela, item: item.id });
    if (error) aviso("Não foi possível restaurar: " + traduz(error)); else aviso(item.tabela === "tarefas" ? "Tarefa restaurada." : "Projeto restaurado.");
    await carregar();
  }

  async function excluirDeVez(item) {
    const extra = item.tabela === "projetos" ? " As tarefas dele também serão apagadas." : "";
    if (!(await confirmar(`Excluir de vez "${item.titulo}"?${extra} Esta ação não pode ser desfeita.`, "Excluir de vez"))) return;
    const { error } = await sb.from(item.tabela).delete().eq("id", item.id);
    if (error) aviso("Não foi possível excluir: " + traduz(error));
    await carregar();
  }

  async function alterarPerfil(id, dados) {
    const { error } = await sb.from("perfis").update(dados).eq("id", id);
    if (error) aviso("Não foi possível alterar o usuário: " + traduz(error));
    await carregar();
  }

  async function reordenarColuna(quadro, indice, passo) {
    const colunas = colunasDe(quadro);
    const [movida] = colunas.splice(indice, 1);
    colunas.splice(indice + passo, 0, movida);
    const mudancas = [];
    colunas.forEach((c, n) => { if (c.ordem !== n + 1) { c.ordem = n + 1; mudancas.push(c); } });
    renderizar();
    const respostas = await Promise.all(mudancas.map((c) => sb.from("colunas").update({ ordem: c.ordem }).eq("id", c.id)));
    const falha = respostas.find((r) => r.error);
    if (falha) { aviso("Não foi possível reordenar: " + traduz(falha.error)); await carregar(); }
  }

  function abrirColuna(quadro, id) {
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
    await carregar();
  });

  async function excluirColuna(c) {
    const quantos = estado[c.quadro].filter((i) => i.coluna_id === c.id).length;
    if (quantos) { aviso(`A coluna "${c.nome}" ainda tem ${quantos} ${quantos === 1 ? "cartão" : "cartões"}. Mova ou exclua antes.`); return; }
    if (!(await confirmar(`Excluir a coluna "${c.nome}"?`))) return;
    const { error } = await sb.from("colunas").delete().eq("id", c.id);
    if (error) aviso(error.code === "23503"
      ? "Há cartões na lixeira que ainda usam esta coluna. Restaure ou exclua de vez esses cartões antes."
      : "Não foi possível excluir a coluna: " + traduz(error));
    await carregar();
  }

  // ---------- Convites ----------
  async function chamarConvites(corpo) {
    const { data, error } = await sb.functions.invoke("convites", { body: corpo });
    if (error) {
      let texto = error.message;
      try { const j = await error.context.json(); if (j?.erro) texto = j.erro; } catch (_) { /* mantém o texto padrão */ }
      throw new Error(texto);
    }
    if (data?.erro) throw new Error(data.erro);
    return data;
  }

  function mostrarLink(resposta, nome) {
    const base = location.href.split(/[?#]/)[0];
    $("#v-link").value = `${base}?convite=${encodeURIComponent(resposta.token)}&tipo=${resposta.tipo}`;
    $("#convite-texto").textContent = resposta.tipo === "invite"
      ? `Envie este link para ${nome}. Ao abrir, a pessoa cria a própria senha e entra no site.`
      : `Envie este link para ${nome}. Ao abrir, a pessoa define uma nova senha.`;
    $("#convite-dados").hidden = true; $("#v-gerar").hidden = true;
    $("#convite-link").hidden = false; $("#v-copiar").hidden = false;
  }

  function abrirConvite() {
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
      await carregar();
    } catch (erro) { mensagem("#convite-msg", traduz(erro)); }
    $("#v-gerar").disabled = false;
  });

  async function novoLink(p) {
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

  // ---------- Minha conta ----------
  $("#btn-conta").addEventListener("click", () => {
    $("#m-nome").value = estado.perfil.nome;
    $("#m-senha").value = "";
    mensagem("#conta-msg", "");
    $("#dlg-conta").showModal();
  });

  $("#form-conta").addEventListener("submit", async (e) => {
    e.preventDefault();
    mensagem("#conta-msg", "");
    const nome = $("#m-nome").value.trim();
    const senha = $("#m-senha").value;
    const { error } = await sb.from("perfis").update({ nome }).eq("id", estado.usuario.id);
    if (error) { mensagem("#conta-msg", traduz(error)); return; }
    if (senha) {
      const { error: erroSenha } = await sb.auth.updateUser({ password: senha });
      if (erroSenha) { mensagem("#conta-msg", traduz(erroSenha)); return; }
    }
    $("#dlg-conta").close();
    aviso("Dados salvos.");
    await carregar();
  });

  iniciar().catch((erro) => { mostrar("tela-login"); mensagem("#login-msg", traduz(erro)); });
})();
