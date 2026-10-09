// Ideias: lista com filtros e a janela da ideia (criar, editar, apoiar e comentar). A ideia tem título e descrição (opcional).
// Ideia avulsa (sem projeto) é privada: só quem criou vê. Ideia de projeto é vista por quem acessa o projeto e pelo administrador.
// Só o autor altera título e descrição, vincula, desvincula e exclui. O status é do autor ou do responsável pelo projeto.
import { sb } from "./supabase.js";
import { de } from "./ligacoes.js";
import { $, el, celular, plural, dataCurta, dataHora, dois, ICONES, aviso, traduz, preencherSelect, confirmar } from "./util.js";
import { estado, nomePerfil, avatar, vejoComoAdmin, NOTA_ADMIN, projetosQueGravo } from "./estado.js";

export const STATUS_IDEIA = { nova: "Nova", em_analise: "Em análise", aprovada: "Aprovada", descartada: "Descartada" };
const opcoesStatus = Object.entries(STATUS_IDEIA).map(([v, t]) => ({ v, t }));
const projetosEmOrdem = () => estado.projetos.slice().sort((a, b) => a.titulo.localeCompare(b.titulo)).map((p) => ({ v: p.id, t: p.titulo }));
// Para registrar ou vincular uma ideia, só os projetos de que a pessoa faz parte (o administrador só lê os demais)
const projetosParaGravar = () => projetosQueGravo().sort((a, b) => a.titulo.localeCompare(b.titulo)).map((p) => ({ v: p.id, t: p.titulo }));
const tituloDoProjeto = (id) => estado.projetos.find((p) => p.id === id)?.titulo;
const souAutor = (i) => i.criado_por === estado.usuario.id;
const respondoPeloProjeto = (i) => !!i.projeto_id && estado.projetos.find((p) => p.id === i.projeto_id)?.responsavel_id === estado.usuario.id;
// Dia em que a ideia foi registrada, no horário do aparelho, no formato das datas do site (ano-mês-dia)
function diaDe(iso) { const d = new Date(iso); return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`; }

export function origemDaIdeia(i) { return tituloDoProjeto(i.projeto_id) ?? "Ideia avulsa"; }

// ---------- Tela ----------
export function renderIdeias() {
  // Filtros
  preencherSelect($("#filtro-ideia-projeto"), [{ v: "todos", t: "Todas" }, { v: "avulsas", t: "Somente avulsas" }, ...projetosEmOrdem()], estado.filtroIdeiaProjeto);
  estado.filtroIdeiaProjeto = $("#filtro-ideia-projeto").value;
  preencherSelect($("#filtro-ideia-status"), [{ v: "todos", t: "Todos" }, ...opcoesStatus], estado.filtroIdeiaStatus);
  // Resumo do cabeçalho
  const avulsas = estado.ideias.filter((i) => !i.projeto_id).length;
  $("#resumo-ideias").replaceChildren(el("b", { text: plural(estado.ideias.length, "ideia", "ideias") }),
    ...(avulsas ? [" · ", plural(avulsas, "avulsa", "avulsas")] : []));
  // Lista, da mais recente para a mais antiga
  const fp = estado.filtroIdeiaProjeto, fs = estado.filtroIdeiaStatus;
  const ideias = estado.ideias.filter((i) => (fp === "todos" || (fp === "avulsas" ? !i.projeto_id : i.projeto_id === fp)) && (fs === "todos" || i.status === fs))
    .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));
  const raiz = $("#lista-ideias");
  raiz.replaceChildren();
  if (!ideias.length) {
    raiz.append(el("p", { class: "apoio", text: estado.ideias.length ? "Nenhuma ideia com esses filtros." : "Nenhuma ideia registrada ainda. Use o botão \"Nova ideia\"." }));
    return;
  }
  raiz.append(el("section", { class: "grupo-datas" },
    el("h2", {}, "Ideias", el("span", { class: "contagem", text: String(ideias.length) })),
    ...ideias.map((i) => linhaDaIdeia(i))));
}

// Apoios e comentários da ideia (só as de projeto recebem; o banco entrega só os das ideias que a pessoa enxerga)
const SVG_APOIO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6M6 11l6-6 6 6"/></svg>';
const SVG_COMENTARIO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v10H10l-4 4v-4H5z"/></svg>';
export const apoiosDa = (i) => estado.apoios.filter((a) => a.ideia_id === i.id);
export const comentariosDa = (i) => estado.comentarios.filter((c) => c.ideia_id === i.id).sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1));
const teveParticipacao = (i) => apoiosDa(i).length + comentariosDa(i).length > 0;
function chipComIcone(svg, n, titulo) { const c = el("span", { class: "chip", title: titulo }); c.innerHTML = svg; c.append(String(n)); return c; }

// Etiquetas da ideia: status, data do registro e, se houver, apoios e comentários
export function chipsDaIdeia(i) {
  const data = el("span", { class: "chip", title: "Registrada em " + dataHora(i.criado_em) });
  data.innerHTML = ICONES.data;
  data.append(dataCurta(diaDe(i.criado_em)));
  const na = apoiosDa(i).length, nc = comentariosDa(i).length;
  return el("div", { class: "chips" }, el("span", { class: "chip status-" + i.status, text: STATUS_IDEIA[i.status] ?? i.status }), data,
    na ? chipComIcone(SVG_APOIO, na, plural(na, "apoio", "apoios")) : null,
    nc ? chipComIcone(SVG_COMENTARIO, nc, plural(nc, "comentário", "comentários")) : null);
}

// Uma ideia em lista, no modelo do cartão: título na primeira linha, com o autor à direita; projeto embaixo; depois as etiquetas.
// Dentro do projeto a linha não repete o nome do projeto.
export function linhaDaIdeia(i, semOrigem) {
  return el("div", { class: "linha-tarefa ideia" },
    el("button", { class: "abrir", type: "button", onclick: () => abrirIdeia(i.id) },
      el("span", { class: "nome", text: i.titulo, title: i.titulo }),
      semOrigem ? null : el("span", { class: "origem" + (i.projeto_id ? "" : " avulsa"), text: origemDaIdeia(i) })),
    chipsDaIdeia(i),
    i.criado_por ? avatar(i.criado_por) : null);
}

$("#filtro-ideia-projeto").addEventListener("change", (e) => { estado.filtroIdeiaProjeto = e.target.value; renderIdeias(); });
$("#filtro-ideia-status").addEventListener("change", (e) => { estado.filtroIdeiaStatus = e.target.value; renderIdeias(); });

// ---------- Nova ideia ----------
// O botão da aba abre a janela da ideia em modo de criação (avulsa ou em um projeto de que a pessoa faz parte).
$("#ideia-nova").addEventListener("click", () => novaIdeia(null));

// ---------- Ideias dentro do projeto ----------
// Na janela do projeto (computador, no formulário) e na leitura do projeto (celular, tela cheia).
// Ordem: as da mais recente para a mais antiga e, no fim, as descartadas (decisão dele: a equipe vê o que já foi descartado).
export function ideiasDoProjeto(projetoId) {
  const chave = (i) => (i.status === "descartada" ? "1" : "0");
  return estado.ideias.filter((i) => i.projeto_id === projetoId)
    .sort((a, b) => chave(a).localeCompare(chave(b)) || (a.criado_em < b.criado_em ? 1 : -1));
}
let projetoDasIdeias = null;
export function renderIdeiasDoProjeto(projetoId) {
  projetoDasIdeias = projetoId;
  const ideias = ideiasDoProjeto(projetoId);
  for (const pre of ["p", "lp"]) {
    $(`#${pre}-ideias-contagem`).textContent = String(ideias.length);
    $(`#${pre}-ideias-lista`).replaceChildren(...(ideias.length
      ? ideias.map((i) => linhaDaIdeia(i, true))
      : [el("p", { class: "apoio", text: "Este projeto ainda não tem ideias." })]));
  }
}
for (const pre of ["p", "lp"]) $(`#${pre}-ideia-nova`).addEventListener("click", () => novaIdeia(projetoDasIdeias));

// ---------- Janela da ideia ----------
// A ideia pode abrir por cima da janela do projeto. Ao fechar, a edição do projeto é retomada (como na tarefa).
let projetoPorBaixo = null;
$("#dlg-ideia").addEventListener("close", () => {
  if (projetoPorBaixo && $("#dlg-projeto").open) estado.editando = projetoPorBaixo;
  projetoPorBaixo = null;
});

// Título e descrição: campos para quem edita; para os demais, o título em destaque e a descrição, se houver
function camposDeTexto(edita, titulo, descricao) {
  $("#i-campo-titulo").hidden = $("#i-campo-descricao").hidden = !edita;
  $("#i-titulo-leitura").hidden = edita;
  $("#i-titulo-leitura").textContent = titulo ?? "";
  $("#i-leitura").textContent = descricao ?? "";
  $("#i-leitura").hidden = edita || !descricao;
}

// Janela da nova ideia: título, descrição e projeto. Em um projeto, o projeto já vem escolhido e fica travado.
export function novaIdeia(projetoId) {
  projetoPorBaixo = $("#dlg-projeto").open && estado.editando?.tipo === "projeto" ? estado.editando : null;
  estado.editando = { tipo: "ideia", id: null, novo: true };
  $("#i-janela").textContent = "Nova ideia";
  $("#i-origem").hidden = $("#i-autor").hidden = $("#i-historico").hidden = $("#i-campo-status").hidden = true;
  $("#i-titulo").value = $("#i-descricao").value = "";
  camposDeTexto(true);
  preencherSelect($("#i-projeto"), projetoId ? [{ v: projetoId, t: tituloDoProjeto(projetoId) }] : [{ v: "", t: "Ideia avulsa (só você vê)" }, ...projetosParaGravar()], projetoId ?? "");
  $("#i-campo-projeto").hidden = false;
  $("#i-projeto").disabled = !!projetoId;
  $("#i-projeto-nota").hidden = true;
  notaDoDestino();
  $("#i-comentario-texto").value = "";
  $("#i-participacao").hidden = $("#i-sem-participacao").hidden = true;
  $("#i-salvar").hidden = false;
  $("#i-salvar").textContent = "Salvar";
  $("#i-cancelar").textContent = "Cancelar";
  $("#i-excluir").hidden = true;
  $("#dlg-ideia").showModal();
  document.activeElement?.blur();
}
function notaDoDestino() {
  if (!estado.editando?.novo) return;
  $("#i-destino-nota").hidden = false;
  $("#i-destino-nota").textContent = $("#i-projeto").value
    ? "Todos que têm acesso ao projeto e o administrador vão ver esta ideia."
    : "Ideia avulsa: só você vê. Dá para vincular a um projeto depois.";
}
$("#i-projeto").addEventListener("change", notaDoDestino);

export function abrirIdeia(id) {
  const i = estado.ideias.find((x) => x.id === id);
  if (!i) return;
  projetoPorBaixo = $("#dlg-projeto").open && estado.editando?.tipo === "projeto" ? estado.editando : null;
  const autor = souAutor(i), mudaStatus = autor || respondoPeloProjeto(i);
  estado.editando = { tipo: "ideia", id: i.id };
  $("#i-janela").textContent = "Ideia";
  $("#i-origem").hidden = $("#i-autor").hidden = $("#i-historico").hidden = $("#i-campo-status").hidden = false;
  $("#i-destino-nota").hidden = true;
  $("#i-salvar").textContent = "Salvar";
  $("#i-origem").textContent = i.projeto_id ? origemDaIdeia(i) : (autor ? "Ideia avulsa: só você vê" : "Ideia avulsa");
  $("#i-origem").className = "origem" + (i.projeto_id ? "" : " avulsa");
  // O autor edita título e descrição; os demais leem
  $("#i-titulo").value = i.titulo;
  $("#i-descricao").value = i.descricao ?? "";
  camposDeTexto(autor, i.titulo, i.descricao);
  $("#i-autor").replaceChildren(i.criado_por ? avatar(i.criado_por) : "", el("span", { text: nomePerfil(i.criado_por) || "usuário removido" }));
  preencherSelect($("#i-status"), opcoesStatus, i.status);
  $("#i-status").disabled = !mudaStatus;
  preencherSelect($("#i-projeto"), [{ v: "", t: "Ideia avulsa (só você vê)" }, ...projetosParaGravar()], i.projeto_id ?? "");
  $("#i-campo-projeto").hidden = !autor;
  $("#i-comentario-texto").value = "";
  let historico = `Registrada por ${nomePerfil(i.criado_por) || "usuário removido"} em ${dataHora(i.criado_em)}.`;
  if (i.atualizado_em && i.atualizado_em !== i.criado_em) historico += ` Última alteração por ${nomePerfil(i.atualizado_por) || "usuário removido"} em ${dataHora(i.atualizado_em)}.`;
  if (vejoComoAdmin(i.projeto_id)) historico += " " + NOTA_ADMIN;
  $("#i-historico").textContent = historico;
  $("#i-salvar").hidden = !mudaStatus;
  $("#i-cancelar").textContent = mudaStatus ? "Cancelar" : "Fechar";
  $("#i-excluir").hidden = !autor;
  renderParticipacao();
  $("#dlg-ideia").showModal();
}

// ---------- Apoiar e comentar (etapa I4) ----------
// Gravam na hora, sem o "Salvar". Refeito sempre que os dados mudam com a janela aberta (renderizar, em app.js).
export function renderParticipacao() {
  const i = estado.ideias.find((x) => x.id === estado.editando?.id);
  if (!i || estado.editando?.tipo !== "ideia") return;
  const eu = estado.usuario.id, deProjeto = !!i.projeto_id;
  $("#i-participacao").hidden = !deProjeto;
  $("#i-sem-participacao").hidden = deProjeto;
  // Ideia com participação não sai mais do projeto (regra do banco desde a I1)
  const travado = deProjeto && souAutor(i) && teveParticipacao(i);
  $("#i-projeto").disabled = travado;
  $("#i-projeto-nota").hidden = !travado;
  if (travado) $("#i-projeto").value = i.projeto_id;
  if (!deProjeto) return;
  // Administrador em projeto de que não faz parte: lê os apoios e os comentários, sem apoiar nem comentar
  const ro = vejoComoAdmin(i.projeto_id);
  $("#i-apoiar").hidden = ro;
  $("#i-participacao .registro-linha").hidden = ro;
  const apoios = apoiosDa(i), meu = apoios.some((a) => a.usuario_id === eu);
  $("#i-apoiar").replaceChildren();
  $("#i-apoiar").insertAdjacentHTML("afterbegin", SVG_APOIO);
  $("#i-apoiar").append(meu ? "Apoiada por você" : "Apoiar");
  $("#i-apoiar").setAttribute("aria-pressed", String(meu));
  const nomes = apoios.map((a) => nomePerfil(a.usuario_id) || "usuário removido");
  $("#i-apoios").textContent = apoios.length ? plural(apoios.length, "apoio", "apoios") : "Ninguém apoiou ainda";
  $("#i-apoios").title = nomes.join(", ");
  $("#i-apoios").disabled = !apoios.length;
  const comentarios = comentariosDa(i);
  $("#i-comentarios-contagem").textContent = String(comentarios.length);
  $("#i-comentarios").replaceChildren(...(comentarios.length ? comentarios.map((c) => el("div", { class: "comentario" },
    el("div", { class: "comentario-topo" },
      c.criado_por ? avatar(c.criado_por) : null,
      el("strong", { text: nomePerfil(c.criado_por) || "usuário removido" }),
      el("span", { class: "legenda", text: dataHora(c.criado_em) }),
      c.criado_por === eu ? el("button", { class: "excluir-comentario", type: "button", text: "Excluir", onclick: () => excluirComentario(c) }) : null),
    el("p", { class: "descricao", text: c.texto })))
    : [el("p", { class: "apoio", text: "Nenhum comentário ainda." })]));
}

$("#i-apoios").addEventListener("click", () => { if ($("#i-apoios").title) aviso("Apoiada por: " + $("#i-apoios").title + "."); });

$("#i-apoiar").addEventListener("click", async () => {
  const i = estado.ideias.find((x) => x.id === estado.editando?.id);
  if (!i) return;
  const eu = estado.usuario.id;
  const meu = apoiosDa(i).some((a) => a.usuario_id === eu);
  const { error } = meu
    ? await sb.from("ideia_apoios").delete().eq("ideia_id", i.id).eq("usuario_id", eu)
    : await sb.from("ideia_apoios").insert({ ideia_id: i.id });
  if (error) { aviso("Não foi possível registrar o apoio: " + traduz(error)); return; }
  await de.carregar();
});

async function comentar() {
  const i = estado.ideias.find((x) => x.id === estado.editando?.id);
  const campo = $("#i-comentario-texto");
  const texto = campo.value.trim();
  if (!i || !texto) { campo.focus(); return; }
  const { error } = await sb.from("ideia_comentarios").insert({ ideia_id: i.id, texto });
  if (error) { aviso("Não foi possível comentar: " + traduz(error)); return; }
  campo.value = "";
  await de.carregar();
}
$("#i-comentar").addEventListener("click", comentar);
// Como no registro de ideias: no computador, Enter grava e Shift+Enter quebra a linha; no celular, Enter quebra a linha
$("#i-comentario-texto").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !celular()) { e.preventDefault(); comentar(); }
});

async function excluirComentario(c) {
  if (!(await confirmar("Excluir o seu comentário? Esta ação não pode ser desfeita."))) return;
  const { error } = await sb.from("ideia_comentarios").delete().eq("id", c.id);
  if (error) { aviso("Não foi possível excluir o comentário: " + traduz(error)); return; }
  await de.carregar();
}

$("#form-ideia-janela").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (estado.editando?.novo) {
    const titulo = $("#i-titulo").value.trim();
    if (!titulo) return;
    const projeto_id = $("#i-projeto").value || null;
    const { error } = await sb.from("ideias").insert({ titulo, descricao: $("#i-descricao").value.trim() || null, projeto_id });
    if (error) { aviso("Não foi possível registrar a ideia: " + traduz(error)); return; }
    $("#dlg-ideia").close();
    aviso(projeto_id ? "Ideia registrada no projeto." : "Ideia registrada.");
    await de.carregar();
    return;
  }
  const i = estado.ideias.find((x) => x.id === estado.editando?.id);
  if (!i) return;
  const autor = souAutor(i), dados = {};
  if ($("#i-status").value !== i.status) dados.status = $("#i-status").value;
  if (autor) {
    const titulo = $("#i-titulo").value.trim();
    if (!titulo) return;
    if (titulo !== i.titulo) dados.titulo = titulo;
    const descricao = $("#i-descricao").value.trim() || null;
    if (descricao !== (i.descricao ?? null)) dados.descricao = descricao;
    const projeto = $("#i-projeto").value || null;
    if (projeto !== (i.projeto_id ?? null)) {
      // Mudar a ideia de lugar muda quem a enxerga: a pessoa confirma antes
      const pergunta = !projeto ? "Desvincular esta ideia do projeto? Ela volta a ser privada: só você vai ver."
        : `Vincular esta ideia ao projeto "${tituloDoProjeto(projeto)}"? Ela ficará visível para todos que têm acesso a esse projeto e para o administrador.`;
      if (!(await confirmar(pergunta, projeto ? "Vincular" : "Desvincular", false))) return;
      dados.projeto_id = projeto;
    }
  }
  if (!Object.keys(dados).length) { $("#dlg-ideia").close(); return; }
  const { error } = await sb.from("ideias").update(dados).eq("id", i.id);
  if (error) { aviso("Não foi possível salvar a ideia: " + traduz(error)); return; }
  $("#dlg-ideia").close();
  aviso("projeto_id" in dados ? (dados.projeto_id ? "Ideia vinculada ao projeto." : "Ideia desvinculada do projeto.") : "Ideia salva.");
  await de.carregar();
});

$("#i-excluir").addEventListener("click", async () => {
  const i = estado.ideias.find((x) => x.id === estado.editando?.id);
  if (!i) return;
  if (!(await confirmar("Excluir esta ideia? Ela vai para a sua lixeira e pode ser restaurada por 30 dias."))) return;
  const { error } = await sb.from("ideias").update({ arquivado_em: new Date().toISOString() }).eq("id", i.id);
  if (error) { aviso("Não foi possível excluir: " + traduz(error)); return; }
  $("#dlg-ideia").close();
  await de.carregar();
});
