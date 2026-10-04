// Gestão de Projetos | Gauten Smart.GOV
// Site estático (GitHub Pages) + Supabase (login, banco de dados e tempo real).

import { sb } from "./supabase.js";
import { $, PRIORIDADES, el, porOrdem, dois, hoje, dataBR, dataCurta, ICONES, icone, dataHora, plural, mostrar, aviso, mensagem, traduz, preencherSelect, confirmar } from "./util.js";
import { estado, colunasDe, nomePerfil, souAdmin, proximaOrdem, avatar, atrasado, historico } from "./estado.js";

(() => {
  "use strict";

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

  // ---------- Quadros ----------
  function renderFiltros() {
    preencherSelect($("#filtro-projeto"), [
      { v: "todos", t: "Todos" }, { v: "avulsas", t: "Somente avulsas" },
      ...estado.projetos.slice().sort((a, b) => a.titulo.localeCompare(b.titulo)).map((p) => ({ v: p.id, t: p.titulo })),
    ], estado.filtroProjeto);
    estado.filtroProjeto = $("#filtro-projeto").value;
  }
  $("#filtro-projeto").addEventListener("change", (e) => { estado.filtroProjeto = e.target.value; renderizar(); });

  // No quadro de tarefas cada pessoa vê só as tarefas em que é responsável,
  // mais as avulsas que ela mesma criou (mesmo delegadas a outra pessoa).
  function noMeuQuadro(t) {
    const eu = estado.usuario.id;
    return t.responsavel_id === eu || (!t.projeto_id && t.criado_por === eu);
  }

  // Tarefa concluída fica 7 dias na coluna concluída do quadro; depois, só na aba Concluídas.
  const DIAS_NO_QUADRO = 7;
  function noQuadro(t) {
    return !t.concluida_em || t.concluida_em > new Date(Date.now() - DIAS_NO_QUADRO * 86400000).toISOString();
  }
  function colunaConcluida(id) { return !!estado.colunas.find((c) => c.id === id)?.concluida; }
  // Em uma lista de colunas, quem não é responsável não pode escolher uma coluna concluída.
  function travarConclusao(select, pode, atual) {
    for (const o of select.options) o.disabled = !pode && o.value !== atual && colunaConcluida(o.value) !== colunaConcluida(atual);
  }

  function passaFiltro(t) {
    const fp = estado.filtroProjeto;
    if (!noMeuQuadro(t)) return false;
    if (fp === "avulsas" && t.projeto_id) return false;
    if (fp !== "todos" && fp !== "avulsas" && t.projeto_id !== fp) return false;
    return true;
  }

  // Quem enxerga um projeto: o responsável e os usuários selecionados.
  function pessoasDoProjeto(projetoId) {
    const p = estado.projetos.find((x) => x.id === projetoId);
    const ids = new Set(estado.membros.filter((m) => m.projeto_id === projetoId).map((m) => m.usuario_id));
    if (p?.responsavel_id) ids.add(p.responsavel_id);
    return [...ids];
  }

  function renderResumos() {
    const pAtrasados = estado.projetos.filter(atrasado).length;
    $("#resumo-projetos").replaceChildren(plural(estado.projetos.length, "projeto", "projetos"),
      ...(pAtrasados ? [", ", el("strong", { text: plural(pAtrasados, "atrasado", "atrasados") })] : []));
    const abertas = estado.tarefas.filter((t) => noMeuQuadro(t) && !t.concluida_em);
    const tAtrasadas = abertas.filter(atrasado).length;
    $("#resumo-tarefas").replaceChildren(plural(abertas.length, "tarefa aberta", "tarefas abertas"),
      ...(tAtrasadas ? [", ", el("strong", { text: plural(tAtrasadas, "atrasada", "atrasadas") })] : []));
  }

  // ---------- Tarefas: quadro, lista por data e concluídas ----------
  function botaoConcluir(t) {
    const pode = t.responsavel_id === estado.usuario.id;
    const b = el("button", { class: "marcar" + (t.concluida_em ? " feita" : ""), type: "button", disabled: !pode,
      title: !pode ? "Só o responsável conclui a tarefa" : t.concluida_em ? "Reabrir tarefa" : "Marcar como concluída",
      "aria-label": (t.concluida_em ? "Reabrir a tarefa " : "Marcar como concluída a tarefa ") + t.titulo });
    b.innerHTML = ICONES.feito;
    b.addEventListener("click", (e) => { e.stopPropagation(); concluir(t.id, !t.concluida_em); });
    b.addEventListener("keydown", (e) => e.stopPropagation());
    return b;
  }

  async function concluir(id, sim) {
    const { error } = await sb.from("tarefas").update({ concluida_em: sim ? new Date().toISOString() : null }).eq("id", id);
    if (error) { aviso("Não foi possível alterar a tarefa: " + traduz(error)); return; }
    aviso(sim ? "Tarefa concluída." : "Tarefa reaberta.");
    await carregar();
  }

  for (const b of document.querySelectorAll("[data-modo]")) {
    b.addEventListener("click", () => { estado.modoTarefas = b.dataset.modo; renderizar(); });
  }
  $("#busca-concluidas").addEventListener("input", (e) => { estado.busca = e.target.value; renderConcluidas(); });
  $("#periodo-concluidas").addEventListener("change", (e) => { estado.periodo = e.target.value; renderConcluidas(); });

  function renderTarefas() {
    const modo = estado.modoTarefas;
    for (const b of document.querySelectorAll("[data-modo]")) b.setAttribute("aria-selected", String(b.dataset.modo === modo));
    $("#quadro-tarefas").hidden = modo !== "quadro";
    $("#lista-tarefas").hidden = modo !== "lista";
    $("#concluidas-tarefas").hidden = modo !== "concluidas";
    if (modo === "quadro") renderQuadro("tarefas");
    if (modo === "lista") renderLista();
    if (modo === "concluidas") renderConcluidas();
  }

  function chipsDaTarefa(t) {
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
  function origemDaTarefa(t) {
    return estado.projetos.find((p) => p.id === t.projeto_id)?.titulo ?? "Tarefa avulsa";
  }

  function renderLista() {
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
        ...g.itens.map((t) => el("div", { class: "linha-tarefa" },
          botaoConcluir(t),
          el("button", { class: "abrir", type: "button", onclick: () => abrirTarefa(t.id) },
            el("span", { class: "nome", text: t.titulo }), el("span", { class: "origem", text: origemDaTarefa(t) })),
          chipsDaTarefa(t)))));
    }
  }

  function renderConcluidas() {
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

  function renderQuadro(quadro) {
    const raiz = $("#quadro-" + quadro);
    const colunas = colunasDe(quadro);
    raiz.replaceChildren();
    if (!colunas.length) {
      raiz.append(el("p", { class: "apoio", text: "Este quadro ainda não tem colunas. O administrador pode criar colunas em Configurações." }));
      return;
    }
    for (const col of colunas) {
      let itens = estado[quadro].filter((i) => i.coluna_id === col.id).sort(porOrdem);
      if (quadro === "tarefas") itens = itens.filter((t) => passaFiltro(t) && noQuadro(t));
      const lista = el("div", { class: "coluna-lista" });
      lista.dataset.coluna = col.id;
      for (const item of itens) lista.append(cartao(quadro, item, col));
      if (!itens.length) lista.append(el("p", { class: "vazio", text: quadro === "projetos" ? "Nenhum projeto aqui." : "Nenhuma tarefa aqui." }));

      lista.addEventListener("dragover", (e) => {
        if (estado.arrastando?.quadro !== quadro) return;
        e.preventDefault();
        lista.classList.add("sobre");
      });
      lista.addEventListener("dragleave", (e) => { if (!lista.contains(e.relatedTarget)) lista.classList.remove("sobre"); });
      lista.addEventListener("drop", (e) => {
        if (estado.arrastando?.quadro !== quadro) return;
        e.preventDefault();
        lista.classList.remove("sobre");
        const antes = [...lista.querySelectorAll(".cartao:not(.arrastando)")].find((c) => {
          const r = c.getBoundingClientRect();
          return e.clientY < r.top + r.height / 2;
        });
        mover(quadro, estado.arrastando.id, col.id, antes ? antes.dataset.id : null);
      });

      raiz.append(el("section", { class: "coluna" + (col.concluida ? " concluida" : "") },
        el("header", { class: "coluna-topo" },
          col.concluida ? icone("feito") : null,
          el("h2", { text: col.nome }),
          el("span", { class: "contagem", text: String(itens.length), title: "Cartões nesta coluna" })),
        lista,
        el("button", {
          class: "coluna-novo", type: "button",
          onclick: () => (quadro === "projetos" ? abrirProjeto(null, col.id) : abrirTarefa(null, col.id)),
        }, icone("mais"), quadro === "projetos" ? "Adicionar projeto" : "Adicionar tarefa")));
    }
  }

  function cartao(quadro, item, col) {
    const abrir = () => (quadro === "projetos" ? abrirProjeto(item.id) : abrirTarefa(item.id));
    const c = el("article", { class: "cartao" + (item.concluida_em ? " feita" : ""), draggable: true, tabIndex: 0, role: "button", onclick: abrir });
    c.dataset.id = item.id;
    c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); } });

    if (quadro === "tarefas") {
      const projeto = estado.projetos.find((p) => p.id === item.projeto_id);
      c.append(el("span", { class: "origem" + (projeto ? "" : " avulsa"), text: projeto ? projeto.titulo : "Tarefa avulsa" }));
    }
    if (quadro === "tarefas") {
      c.append(el("div", { class: "topo-tarefa" }, botaoConcluir(item), el("span", { class: "nome", text: item.titulo })));
    } else {
      c.append(el("span", { class: "nome", text: item.titulo }));
    }

    const chips = el("div", { class: "chips" });
    chips.append(el("span", { class: "chip " + item.prioridade, text: "Prioridade " + PRIORIDADES[item.prioridade] }));
    if (quadro === "projetos") {
      const equipe = pessoasDoProjeto(item.id).length;
      if (equipe > 1) chips.append(el("span", { class: "chip", text: plural(equipe, "pessoa", "pessoas"), title: "Pessoas que podem ver este projeto" }));
    }
    if (item.prazo) {
      const fora = atrasado(item);
      const chip = el("span", { class: "chip" + (fora ? " atrasado" : ""), title: "Prazo: " + dataBR(item.prazo) });
      chip.innerHTML = ICONES.data;
      chip.append((fora ? "Atrasado, " : "") + dataCurta(item.prazo));
      chips.append(chip);
    }
    c.append(chips);

    const rodape = el("div", { class: "rodape" });
    if (quadro === "projetos") {
      const tarefas = estado.tarefas.filter((t) => t.projeto_id === item.id);
      if (tarefas.length) {
        const feitas = tarefas.filter((t) => t.concluida_em).length;
        const barra = el("i"); barra.style.width = Math.round((feitas / tarefas.length) * 100) + "%";
        rodape.append(el("span", { class: "progresso", title: `${feitas} de ${tarefas.length} tarefas concluídas` },
          el("span", { class: "barra" }, barra), `${feitas} de ${tarefas.length}`));
      }
    }
    if (item.responsavel_id) (rodape.childNodes.length ? rodape : chips).append(avatar(item.responsavel_id));
    if (rodape.childNodes.length) c.append(rodape);

    toqueArrastar(c, quadro, item);
    c.addEventListener("dragstart", (e) => {
      estado.arrastando = { quadro, id: item.id };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.id);
      c.classList.add("arrastando");
    });
    c.addEventListener("dragend", () => {
      c.classList.remove("arrastando");
      estado.arrastando = null;
      for (const l of document.querySelectorAll(".coluna-lista.sobre")) l.classList.remove("sobre");
      if (estado.pendente) { estado.pendente = false; renderizar(); }
    });
    return c;
  }

  // Arrastar com o dedo (celular e tablet): segurar o cartão por um instante e então arrastar.
  function toqueArrastar(c, quadro, item) {
    let relogio = null, fantasma = null, inicio = null, ativo = false, alvo = null, desvio = { x: 0, y: 0 };
    const posicionar = (x, y) => { fantasma.style.left = x - desvio.x + "px"; fantasma.style.top = y - desvio.y + "px"; };
    const limparAlvos = () => { for (const l of document.querySelectorAll(".coluna-lista.sobre")) l.classList.remove("sobre"); };

    c.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      inicio = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      relogio = setTimeout(() => {
        const r = c.getBoundingClientRect();
        desvio = { x: inicio.x - r.left, y: inicio.y - r.top };
        fantasma = c.cloneNode(true);
        fantasma.classList.add("fantasma");
        fantasma.style.width = r.width + "px";
        document.body.append(fantasma);
        posicionar(inicio.x, inicio.y);
        c.classList.add("arrastando");
        estado.arrastando = { quadro, id: item.id };
        ativo = true;
        if (navigator.vibrate) navigator.vibrate(25);
      }, 350);
    }, { passive: true });

    c.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      if (!ativo) {
        if (inicio && Math.hypot(t.clientX - inicio.x, t.clientY - inicio.y) > 8) clearTimeout(relogio);
        return;
      }
      e.preventDefault();
      posicionar(t.clientX, t.clientY);
      limparAlvos();
      alvo = document.elementFromPoint(t.clientX, t.clientY)?.closest(".coluna")?.querySelector(".coluna-lista") ?? null;
      if (alvo) alvo.classList.add("sobre");
      const q = c.closest(".quadro");
      if (q) {
        const r = q.getBoundingClientRect();
        if (t.clientX > r.right - 48) q.scrollLeft += 8; else if (t.clientX < r.left + 48) q.scrollLeft -= 8;
      }
    }, { passive: false });

    const fim = (e) => {
      clearTimeout(relogio);
      if (!ativo) return;
      ativo = false;
      if (e.cancelable) e.preventDefault(); // evita abrir o cartão ao soltar
      const y = e.changedTouches[0].clientY;
      const lista = alvo; alvo = null;
      fantasma.remove(); fantasma = null;
      limparAlvos();
      if (lista && e.type === "touchend") {
        const antes = [...lista.querySelectorAll(".cartao:not(.arrastando)")].find((k) => {
          const r = k.getBoundingClientRect();
          return y < r.top + r.height / 2;
        });
        mover(quadro, item.id, lista.dataset.coluna, antes ? antes.dataset.id : null);
      } else {
        c.classList.remove("arrastando");
        estado.arrastando = null;
        if (estado.pendente) { estado.pendente = false; renderizar(); }
      }
    };
    c.addEventListener("touchend", fim);
    c.addEventListener("touchcancel", fim);
    c.addEventListener("contextmenu", (e) => { if (ativo || relogio) e.preventDefault(); });
  }

  async function mover(quadro, id, colunaId, antesId) {
    const item = estado[quadro].find((i) => i.id === id);
    if (!item) return;
    const mudaConclusao = colunaConcluida(colunaId) !== colunaConcluida(item.coluna_id);
    if (mudaConclusao && item.responsavel_id !== estado.usuario.id) {
      estado.arrastando = null; estado.pendente = false;
      renderizar();
      aviso(quadro === "tarefas" ? "Só o responsável pode concluir ou reabrir a tarefa." : "Só o responsável pode concluir ou reabrir o projeto.");
      return;
    }
    const destino = estado[quadro].filter((i) => i.coluna_id === colunaId && i.id !== id).sort(porOrdem);
    let posicao = antesId ? destino.findIndex((i) => i.id === antesId) : destino.length;
    if (posicao < 0) posicao = destino.length;
    destino.splice(posicao, 0, item);
    const mudancas = [];
    destino.forEach((i, n) => {
      if (i.ordem !== n + 1 || i.coluna_id !== colunaId) { i.ordem = n + 1; i.coluna_id = colunaId; mudancas.push(i); }
    });
    estado.arrastando = null; estado.pendente = false;
    renderizar();
    const respostas = await Promise.all(mudancas.map((i) =>
      sb.from(quadro).update({ coluna_id: i.coluna_id, ordem: i.ordem }).eq("id", i.id)));
    const falha = respostas.find((r) => r.error);
    if (falha) { aviso("Não foi possível mover o cartão: " + traduz(falha.error)); await carregar(); }
    else if (mudaConclusao) await carregar();
  }

  // ---------- Projeto ----------
  $("#novo-projeto").addEventListener("click", () => abrirProjeto(null));

  function opcoesPessoas(ids, atual) {
    return estado.perfis.filter((p) => (p.ativo && (!ids || ids.includes(p.id))) || p.id === atual)
      .map((p) => ({ v: p.id, t: p.nome || p.email }));
  }

  function abrirProjeto(id, colunaId) {
    const colunas = colunasDe("projetos");
    if (!colunas.length) { aviso("Crie ao menos uma coluna no quadro de projetos, em Configurações."); return; }
    const eu = estado.usuario.id;
    const p = id ? estado.projetos.find((x) => x.id === id) : null;
    estado.editando = { tipo: "projeto", id: p ? p.id : null };
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

  function renderMembros(marcados) {
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
  function membrosMarcados() {
    const responsavel = $("#p-responsavel").value;
    return [...document.querySelectorAll("#p-membros input:checked")].map((c) => c.value).filter((v) => v !== responsavel);
  }
  function resumoMembros() {
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

  function renderTarefasDoProjeto() {
    const id = estado.editando?.tipo === "projeto" ? estado.editando.id : null;
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
        el("button", { type: "button", onclick: () => { $("#dlg-projeto").close(); abrirTarefa(t.id); } },
          el("span", { class: "titulo-tarefa", text: t.titulo }),
          el("span", { class: "situacao", text: [resp, situacao].filter(Boolean).join(", ") }))));
    }
  }

  $("#p-adicionar").addEventListener("click", () => {
    const projetoId = estado.editando.id;
    $("#dlg-projeto").close();
    abrirTarefa(null, null, projetoId);
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
        if (error) { aviso("Não foi possível salvar quem pode ver o projeto: " + traduz(error)); await carregar(); return; }
      }
      if (retirar.length) {
        const { error } = await sb.from("projeto_membros").delete().eq("projeto_id", projetoId).in("usuario_id", retirar);
        if (error) { aviso("Não foi possível salvar quem pode ver o projeto: " + traduz(error)); await carregar(); return; }
      }
    }
    if (id) {
      if ($("#p-responsavel").disabled) delete dados.responsavel_id;
      const { error } = await sb.from("projetos").update(dados).eq("id", id);
      if (error) { aviso("Não foi possível salvar o projeto: " + traduz(error)); await carregar(); return; }
    }
    $("#dlg-projeto").close();
    await carregar();
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
    await carregar();
  });

  // ---------- Tarefa ----------
  $("#nova-tarefa").addEventListener("click", () => abrirTarefa(null));
  $("#t-concluir").addEventListener("click", async () => {
    const t = estado.tarefas.find((x) => x.id === estado.editando.id);
    if (!t) return;
    $("#dlg-tarefa").close();
    await concluir(t.id, !t.concluida_em);
  });

  function abrirTarefa(id, colunaId, projetoId) {
    const colunas = colunasDe("tarefas");
    if (!colunas.length) { aviso("Crie ao menos uma coluna no quadro de tarefas, em Configurações."); return; }
    const t = id ? estado.tarefas.find((x) => x.id === id) : null;
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
  function pessoasDaTarefa(atual) {
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
    $("#dlg-tarefa").close();
    await carregar();
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
    $("#dlg-tarefa").close();
    await carregar();
  });

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
