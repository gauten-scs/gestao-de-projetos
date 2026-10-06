// O quadro Kanban: colunas, cartões, arrastar (mouse e, em tela larga, toque) e gravação da posição.
// No celular o quadro mostra uma coluna por vez, escolhida pelas etiquetas, e não há arrastar.
import { sb } from "./supabase.js";
import { de } from "./ligacoes.js";
import { $, celular, PRIORIDADES, el, porOrdem, dataBR, dataCurta, ICONES, icone, plural, aviso, traduz } from "./util.js";
import { estado, colunasDe, avatar, atrasado, noQuadro, colunaConcluida, passaFiltro, pessoasDoProjeto } from "./estado.js";

// Celular: a coluna mostrada em cada quadro fica guardada no aparelho, para ser a mesma na volta.
const chaveColuna = (quadro) => "gp-coluna-" + quadro;
function colunaLembrada(quadro, colunas) {
  let id = null;
  try { id = localStorage.getItem(chaveColuna(quadro)); } catch (_) { /* sem armazenamento: vale a primeira */ }
  return colunas.some((c) => c.id === id) ? id : colunas[0].id;
}
function mostrarColuna(quadro, id, guardar) {
  const raiz = $("#quadro-" + quadro);
  for (const s of raiz.querySelectorAll(".coluna")) s.classList.toggle("ativa", s.dataset.coluna === id);
  const fila = raiz.querySelector(".etiquetas");
  for (const b of fila.children) {
    const esta = b.dataset.coluna === id;
    b.setAttribute("aria-selected", String(esta));
    if (!esta) continue;
    // Traz a etiqueta escolhida para dentro da fileira, sem mexer na rolagem da página
    const r = b.getBoundingClientRect(), f = fila.getBoundingClientRect();
    if (r.left < f.left || r.right > f.right) fila.scrollLeft += r.left - f.left - 16;
  }
  if (guardar) try { localStorage.setItem(chaveColuna(quadro), id); } catch (_) { /* segue sem guardar */ }
}

export function renderQuadro(quadro) {
  const raiz = $("#quadro-" + quadro);
  const colunas = colunasDe(quadro);
  raiz.replaceChildren();
  if (!colunas.length) {
    raiz.append(el("p", { class: "apoio", text: "Este quadro ainda não tem colunas. O administrador pode criar colunas em Configurações." }));
    return;
  }
  // Só aparecem no celular (estilo.css): fileira de etiquetas e a frase de como mudar de coluna
  const etiquetas = el("div", { class: "etiquetas", role: "tablist", "aria-label": "Colunas do quadro" });
  raiz.append(etiquetas, el("p", { class: "dica-coluna", text: "Para mudar de coluna, abra " + (quadro === "projetos" ? "o projeto." : "a tarefa.") }));
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

    etiquetas.append(el("button", { type: "button", role: "tab", onclick: () => mostrarColuna(quadro, col.id, true) },
      col.nome, el("span", { class: "contagem", text: String(itens.length) })));
    etiquetas.lastChild.dataset.coluna = col.id;
    const secao = el("section", { class: "coluna" + (col.concluida ? " concluida" : "") },
      el("header", { class: "coluna-topo" },
        col.concluida ? icone("feito") : null,
        el("h2", { text: col.nome }),
        el("span", { class: "contagem", text: String(itens.length), title: "Cartões nesta coluna" })),
      lista,
      el("button", {
        class: "coluna-novo", type: "button",
        onclick: () => (quadro === "projetos" ? de.abrirProjeto(null, col.id) : de.abrirTarefa(null, col.id)),
      }, icone("mais"), quadro === "projetos" ? "Adicionar projeto" : "Adicionar tarefa"));
    secao.dataset.coluna = col.id;
    raiz.append(secao);
  }
  mostrarColuna(quadro, colunaLembrada(quadro, colunas), false);
}

export function cartao(quadro, item, col) {
  const abrir = () => (quadro === "projetos" ? de.abrirProjeto(item.id) : de.abrirTarefa(item.id));
  const c = el("article", { class: "cartao " + (quadro === "tarefas" ? "tarefa" : "projeto") + (item.concluida_em ? " feita" : ""), draggable: !celular(), tabIndex: 0, role: "button", onclick: abrir });
  c.dataset.id = item.id;
  c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); } });

  // Tarefa: o mesmo modelo da Lista. Nome com o responsável à direita, depois o projeto, depois as etiquetas.
  if (quadro === "tarefas") {
    const projeto = estado.projetos.find((p) => p.id === item.projeto_id);
    c.append(el("div", { class: "topo-tarefa" }, de.botaoConcluir(item), el("span", { class: "nome", text: item.titulo, title: item.titulo }),
        item.responsavel_id ? avatar(item.responsavel_id) : null),
      el("span", { class: "origem" + (projeto ? "" : " avulsa"), text: projeto ? projeto.titulo : "Tarefa avulsa" }),
      de.chipsDaTarefa(item));
    arrastavel(c, quadro, item);
    return c;
  }
  // Projeto: o mesmo modelo da tarefa. Nome com o responsável à direita, depois as etiquetas, depois o andamento.
  const chips = el("div", { class: "chips" });
  chips.append(el("span", { class: "chip " + item.prioridade, text: "Prioridade " + PRIORIDADES[item.prioridade] }));
  const equipe = pessoasDoProjeto(item.id).length;
  if (equipe > 1) chips.append(el("span", { class: "chip", text: plural(equipe, "pessoa", "pessoas"), title: "Pessoas que podem ver este projeto" }));
  if (item.prazo) {
    const chip = el("span", { class: "chip" + (atrasado(item) ? " atrasado" : ""), title: "Prazo: " + dataBR(item.prazo) });
    chip.innerHTML = ICONES.data;
    chip.append(dataCurta(item.prazo));
    chips.append(chip);
  }
  c.append(el("div", { class: "topo-projeto" }, el("span", { class: "nome", text: item.titulo, title: item.titulo }),
    item.responsavel_id ? avatar(item.responsavel_id) : null), chips);

  const tarefas = estado.tarefas.filter((t) => t.projeto_id === item.id);
  if (tarefas.length) {
    const feitas = tarefas.filter((t) => t.concluida_em).length;
    const barra = el("i"); barra.style.width = Math.round((feitas / tarefas.length) * 100) + "%";
    c.append(el("div", { class: "rodape" }, el("span", { class: "progresso", title: `${feitas} de ${tarefas.length} tarefas concluídas` },
      el("span", { class: "barra" }, barra), `${feitas} de ${plural(tarefas.length, "tarefa", "tarefas")}`)));
  }
  arrastavel(c, quadro, item);
  return c;
}

// Liga no cartão o arrastar com mouse e, em tela larga, com o dedo.
function arrastavel(c, quadro, item) {
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
}

// Arrastar com o dedo, só em tela larga (tablet): segurar o cartão por um instante e então arrastar.
// No celular não há arrastar: a coluna muda pelo campo "Coluna" da janela da tarefa ou do projeto.
export function toqueArrastar(c, quadro, item) {
  let relogio = null, fantasma = null, inicio = null, ativo = false, alvo = null, desvio = { x: 0, y: 0 };
  const posicionar = (x, y) => { fantasma.style.left = x - desvio.x + "px"; fantasma.style.top = y - desvio.y + "px"; };
  const limparAlvos = () => { for (const l of document.querySelectorAll(".coluna-lista.sobre")) l.classList.remove("sobre"); };

  c.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || celular()) return;
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
