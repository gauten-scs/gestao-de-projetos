// O quadro Kanban: colunas, cartões, arrastar (mouse e toque) e gravação da posição.
import { sb } from "./supabase.js";
import { de } from "./ligacoes.js";
import { $, PRIORIDADES, el, porOrdem, dataBR, dataCurta, ICONES, icone, plural, aviso, traduz } from "./util.js";
import { estado, colunasDe, avatar, atrasado, noQuadro, colunaConcluida, passaFiltro, pessoasDoProjeto } from "./estado.js";

export function renderQuadro(quadro) {
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
        onclick: () => (quadro === "projetos" ? de.abrirProjeto(null, col.id) : de.abrirTarefa(null, col.id)),
      }, icone("mais"), quadro === "projetos" ? "Adicionar projeto" : "Adicionar tarefa")));
  }
}

export function cartao(quadro, item, col) {
  const abrir = () => (quadro === "projetos" ? de.abrirProjeto(item.id) : de.abrirTarefa(item.id));
  const c = el("article", { class: "cartao" + (item.concluida_em ? " feita" : ""), draggable: true, tabIndex: 0, role: "button", onclick: abrir });
  c.dataset.id = item.id;
  c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); } });

  if (quadro === "tarefas") {
    const projeto = estado.projetos.find((p) => p.id === item.projeto_id);
    c.append(el("span", { class: "origem" + (projeto ? "" : " avulsa"), text: projeto ? projeto.titulo : "Tarefa avulsa" }));
  }
  if (quadro === "tarefas") {
    c.append(el("div", { class: "topo-tarefa" }, de.botaoConcluir(item), el("span", { class: "nome", text: item.titulo })));
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
        el("span", { class: "barra" }, barra), `${feitas} de ${plural(tarefas.length, "tarefa", "tarefas")}`));
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
    if (estado.pendente) { estado.pendente = false; de.renderizar(); }
  });
  return c;
}

// Arrastar com o dedo (celular e tablet): segurar o cartão por um instante e então arrastar.
export function toqueArrastar(c, quadro, item) {
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
      if (estado.pendente) { estado.pendente = false; de.renderizar(); }
    }
  };
  c.addEventListener("touchend", fim);
  c.addEventListener("touchcancel", fim);
  c.addEventListener("contextmenu", (e) => { if (ativo || relogio) e.preventDefault(); });
}

export async function mover(quadro, id, colunaId, antesId) {
  const item = estado[quadro].find((i) => i.id === id);
  if (!item) return;
  const mudaConclusao = colunaConcluida(colunaId) !== colunaConcluida(item.coluna_id);
  if (mudaConclusao && item.responsavel_id !== estado.usuario.id) {
    estado.arrastando = null; estado.pendente = false;
    de.renderizar();
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
  de.renderizar();
  const respostas = await Promise.all(mudancas.map((i) =>
    sb.from(quadro).update({ coluna_id: i.coluna_id, ordem: i.ordem }).eq("id", i.id)));
  const falha = respostas.find((r) => r.error);
  if (falha) { aviso("Não foi possível mover o cartão: " + traduz(falha.error)); await de.carregar(); }
  else if (mudaConclusao) await de.carregar();
}
