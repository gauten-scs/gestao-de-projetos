// Ideias: lista com filtros e a janela da ideia (criar, editar, apoiar e comentar). A ideia tem título e descrição (opcional).
// Ideia avulsa (sem projeto) é privada: só quem criou vê. Ideia de projeto é vista por quem acessa o projeto e pelo administrador.
// Fluxo do status: Nova, Em análise, Aprovada e Executada, um passo por vez (e voltando só um passo); Nova, Em análise e
// Aprovada podem ser descartadas, e a Descartada só volta para Em análise. Ideia que deu origem a tarefa ou projeto não é descartada.
// Aprovada, Executada e Descartada (entrar ou sair) só pelo responsável pelo projeto (na avulsa, o autor); entre Nova e Em análise,
// o autor ou o responsável. Título e descrição: o autor, em Nova e Em análise; nos demais status, o responsável (na avulsa, o autor).
// Só o autor vincula, desvincula (em Nova e Em análise) e exclui. Quem garante tudo isso é o banco; aqui a tela só oferece o que vale.
// Converter (etapa I7): só a ideia Aprovada vira tarefa ou projeto, por quem participa do projeto dela (na avulsa, o autor).
// A ideia continua na lista, marcada com o que gerou, e pode gerar mais de um item.
import { sb } from "./supabase.js";
import { de } from "./ligacoes.js";
import { $, el, celular, plural, dataCurta, dataHora, dois, ICONES, aviso, traduz, preencherSelect, confirmar } from "./util.js";
import { estado, nomePerfil, avatar, vejoComoAdmin, NOTA_ADMIN, projetosQueGravo } from "./estado.js";

export const STATUS_IDEIA = { nova: "Nova", em_analise: "Em análise", aprovada: "Aprovada", executada: "Executada", descartada: "Descartada" };
const opcoesStatusAbertas = ["nova", "em_analise", "aprovada"].map((v) => ({ v, t: STATUS_IDEIA[v] }));
// Abas: Abertas (Nova, Em análise e Aprovada), Executadas e Descartadas
const ABAS_IDEIA = { abertas: ["nova", "em_analise", "aprovada"], executadas: ["executada"], descartadas: ["descartada"] };
const NOMES_ABA = { abertas: "Abertas", executadas: "Executadas", descartadas: "Descartadas" };
const SEM_IDEIA = { abertas: "Nenhuma ideia aberta.", executadas: "Nenhuma ideia executada.", descartadas: "Nenhuma ideia descartada." };
const naAba = (i, aba) => ABAS_IDEIA[aba].includes(i.status);
function montarAbas(raiz, ideias, atual, aoTrocar) {
  raiz.replaceChildren(...Object.keys(ABAS_IDEIA).map((a) => el("button", {
    type: "button", role: "tab", "aria-selected": String(a === atual),
    text: `${NOMES_ABA[a]} (${ideias.filter((i) => naAba(i, a)).length})`, onclick: () => aoTrocar(a) })));
}
const projetosEmOrdem = () => estado.projetos.slice().sort((a, b) => a.titulo.localeCompare(b.titulo)).map((p) => ({ v: p.id, t: p.titulo }));
// Para registrar ou vincular uma ideia, só os projetos de que a pessoa faz parte (o administrador só lê os demais)
const projetosParaGravar = () => projetosQueGravo().sort((a, b) => a.titulo.localeCompare(b.titulo)).map((p) => ({ v: p.id, t: p.titulo }));
const tituloDoProjeto = (id) => estado.projetos.find((p) => p.id === id)?.titulo;
const souAutor = (i) => i.criado_por === estado.usuario.id;
const respondoPeloProjeto = (i) => !!i.projeto_id && estado.projetos.find((p) => p.id === i.projeto_id)?.responsavel_id === estado.usuario.id;
// Dia em que a ideia foi registrada, no horário do aparelho, no formato das datas do site (ano-mês-dia)
// Passos permitidos entre os status (espelham a regra do banco)
const PASSOS = { nova: ["em_analise", "descartada"], em_analise: ["nova", "aprovada", "descartada"], aprovada: ["em_analise", "executada", "descartada"], executada: ["aprovada"], descartada: ["em_analise"] };
const alto = (s) => ["aprovada", "executada", "descartada"].includes(s);
const dono = (i) => (i.projeto_id ? respondoPeloProjeto(i) : souAutor(i));
// O que a ideia gerou. Os números vêm do banco e contam também o que a pessoa não enxerga (tarefa avulsa de outra pessoa,
// projeto de que não participa) e o que está na lixeira; os nomes, só do que ela enxerga.
function geradoPor(i) {
  const tarefas = estado.tarefas.filter((t) => t.ideia_id === i.id), projetos = estado.projetos.filter((p) => p.ideia_id === i.id);
  const o = estado.origens.find((x) => x.ideia_id === i.id);
  return { tarefas, projetos, nTarefas: Math.max(o?.tarefas ?? 0, tarefas.length), nProjetos: Math.max(o?.projetos ?? 0, projetos.length) };
}
const geraOrigem = (i) => { const g = geradoPor(i); return g.nTarefas + g.nProjetos > 0; };
// Converter é gravar: quem só lê o projeto (administrador de fora) não converte; a avulsa, só o autor
const podeConverter = (i) => i.status === "aprovada" && !vejoComoAdmin(i.projeto_id) && (!!i.projeto_id || souAutor(i));
// Para quais status a pessoa pode levar esta ideia agora
function statusPermitidos(i) {
  if (vejoComoAdmin(i.projeto_id)) return [];
  return (PASSOS[i.status] ?? []).filter((t) => !(t === "descartada" && geraOrigem(i))
    && ((alto(i.status) || alto(t)) ? dono(i) : (souAutor(i) || respondoPeloProjeto(i))));
}
const podeEditarTexto = (i) => !vejoComoAdmin(i.projeto_id) && (alto(i.status) ? dono(i) : souAutor(i));
function diaDe(iso) { const d = new Date(iso); return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`; }

export function origemDaIdeia(i) { return tituloDoProjeto(i.projeto_id) ?? "Ideia avulsa"; }

// ---------- Tela ----------
export function renderIdeias() {
  // Filtros
  preencherSelect($("#filtro-ideia-projeto"), [{ v: "todos", t: "Todas" }, { v: "avulsas", t: "Somente avulsas" }, ...projetosEmOrdem()], estado.filtroIdeiaProjeto);
  estado.filtroIdeiaProjeto = $("#filtro-ideia-projeto").value;
  preencherSelect($("#filtro-ideia-status"), [{ v: "todos", t: "Todos" }, ...opcoesStatusAbertas], estado.filtroIdeiaStatus);
  estado.filtroIdeiaStatus = $("#filtro-ideia-status").value;
  $("#filtro-ideia-status-campo").hidden = estado.abaIdeia !== "abertas";
  // Resumo do cabeçalho
  const avulsas = estado.ideias.filter((i) => !i.projeto_id).length;
  $("#resumo-ideias").replaceChildren(el("b", { text: plural(estado.ideias.length, "ideia", "ideias") }),
    ...(avulsas ? [" · ", plural(avulsas, "avulsa", "avulsas")] : []));
  // Lista, da mais recente para a mais antiga
  const fp = estado.filtroIdeiaProjeto, fs = estado.filtroIdeiaStatus, aba = estado.abaIdeia;
  const doProjeto = estado.ideias.filter((i) => fp === "todos" || (fp === "avulsas" ? !i.projeto_id : i.projeto_id === fp));
  montarAbas($("#abas-ideias"), doProjeto, aba, (a) => { estado.abaIdeia = a; renderIdeias(); });
  const ideias = doProjeto.filter((i) => naAba(i, aba) && (aba !== "abertas" || fs === "todos" || i.status === fs))
    .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));
  const raiz = $("#lista-ideias");
  raiz.replaceChildren();
  if (!ideias.length) {
    raiz.append(el("p", { class: "apoio", text: estado.ideias.length ? (doProjeto.length && !doProjeto.some((i) => naAba(i, aba)) ? SEM_IDEIA[aba] : "Nenhuma ideia com esses filtros.") : "Nenhuma ideia registrada ainda. Use o botão \"Nova ideia\"." }));
    return;
  }
  raiz.append(el("section", { class: "grupo-datas" },
    el("h2", {}, NOMES_ABA[aba], el("span", { class: "contagem", text: String(ideias.length) })),
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
  const na = apoiosDa(i).length, nc = comentariosDa(i).length, g = geradoPor(i);
  return el("div", { class: "chips" }, el("span", { class: "chip status-" + i.status, text: STATUS_IDEIA[i.status] ?? i.status }), data,
    g.nTarefas ? el("span", { class: "chip gerou", text: "Virou tarefa", title: plural(g.nTarefas, "tarefa criada", "tarefas criadas") + " a partir desta ideia" }) : null,
    g.nProjetos ? el("span", { class: "chip gerou", text: "Virou projeto", title: plural(g.nProjetos, "projeto criado", "projetos criados") + " a partir desta ideia" }) : null,
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
// Abas Abertas, Executadas e Descartadas (a equipe continua vendo o que já foi descartado); em cada uma, da mais recente para a mais antiga.
export function ideiasDoProjeto(projetoId) {
  return estado.ideias.filter((i) => i.projeto_id === projetoId).sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));
}
let projetoDasIdeias = null;
export function renderIdeiasDoProjeto(projetoId) {
  if (projetoId !== projetoDasIdeias) estado.abaIdeiaProjeto = "abertas";
  projetoDasIdeias = projetoId;
  const todas = ideiasDoProjeto(projetoId), aba = estado.abaIdeiaProjeto;
  const ideias = todas.filter((i) => naAba(i, aba));
  for (const pre of ["p", "lp"]) {
    $(`#${pre}-ideias-contagem`).textContent = String(todas.length);
    montarAbas($(`#${pre}-abas-ideias`), todas, aba, (a) => { estado.abaIdeiaProjeto = a; renderIdeiasDoProjeto(projetoId); });
    $(`#${pre}-ideias-lista`).replaceChildren(...(ideias.length
      ? ideias.map((i) => linhaDaIdeia(i, true))
      : [el("p", { class: "apoio", text: todas.length ? SEM_IDEIA[aba] : "Este projeto ainda não tem ideias." })]));
  }
}
// Ao fechar o projeto, as abas voltam para "Abertas"
$("#dlg-projeto").addEventListener("close", () => { estado.abaIdeiaProjeto = "abertas"; projetoDasIdeias = null; });
for (const pre of ["p", "lp"]) $(`#${pre}-ideia-nova`).addEventListener("click", () => novaIdeia(projetoDasIdeias));

// ---------- Janela da ideia ----------
// A ideia pode abrir por cima da janela do projeto. Ao fechar, a edição do projeto é retomada (como na tarefa).
let projetoPorBaixo = null;
function retomarProjeto() {
  if (projetoPorBaixo && $("#dlg-projeto").open) estado.editando = projetoPorBaixo;
  projetoPorBaixo = null;
}
$("#dlg-ideia").addEventListener("close", retomarProjeto);

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
  $("#i-status-nota").hidden = $("#i-registro").hidden = $("#i-converter").hidden = $("#i-gerou").hidden = true;
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
  const autor = souAutor(i), permitidos = statusPermitidos(i), editaTexto = podeEditarTexto(i);
  estado.editando = { tipo: "ideia", id: i.id };
  $("#i-janela").textContent = "Ideia";
  $("#i-origem").hidden = $("#i-autor").hidden = $("#i-historico").hidden = $("#i-campo-status").hidden = false;
  $("#i-destino-nota").hidden = true;
  $("#i-salvar").textContent = "Salvar";
  $("#i-origem").textContent = i.projeto_id ? origemDaIdeia(i) : (autor ? "Ideia avulsa: só você vê" : "Ideia avulsa");
  $("#i-origem").className = "origem" + (i.projeto_id ? "" : " avulsa");
  // Quem pode alterar o texto neste status edita título e descrição; os demais leem
  $("#i-titulo").value = i.titulo;
  $("#i-descricao").value = i.descricao ?? "";
  camposDeTexto(editaTexto, i.titulo, i.descricao);
  $("#i-autor").replaceChildren(i.criado_por ? avatar(i.criado_por) : "", el("span", { text: nomePerfil(i.criado_por) || "usuário removido" }));
  preencherSelect($("#i-status"), [i.status, ...permitidos].map((v) => ({ v, t: STATUS_IDEIA[v] ?? v })), i.status);
  $("#i-status").disabled = !permitidos.length;
  notaDoStatus(i, permitidos);
  preencherSelect($("#i-projeto"), [{ v: "", t: "Ideia avulsa (só você vê)" }, ...projetosParaGravar()], i.projeto_id ?? "");
  $("#i-campo-projeto").hidden = !autor;
  $("#i-comentario-texto").value = "";
  let historico = `Registrada por ${nomePerfil(i.criado_por) || "usuário removido"} em ${dataHora(i.criado_em)}.`;
  if (i.atualizado_em && i.atualizado_em !== i.criado_em) historico += ` Última alteração por ${nomePerfil(i.atualizado_por) || "usuário removido"} em ${dataHora(i.atualizado_em)}.`;
  if (vejoComoAdmin(i.projeto_id)) historico += " " + NOTA_ADMIN;
  $("#i-historico").textContent = historico;
  const podeAlgo = permitidos.length > 0 || editaTexto || (autor && !alto(i.status));
  $("#i-salvar").hidden = !podeAlgo;
  $("#i-cancelar").textContent = podeAlgo ? "Cancelar" : "Fechar";
  $("#i-excluir").hidden = !autor;
  renderParticipacao();
  $("#dlg-ideia").showModal();
}

// Explica por que o campo Status oferece poucas opções (ou nenhuma)
function notaDoStatus(i, permitidos) {
  const avisos = [];
  if (!vejoComoAdmin(i.projeto_id)) {
    if (!dono(i) && !alto(i.status)) avisos.push("Aprovar, executar e descartar: só o responsável pelo projeto.");
    else if (!permitidos.length && !dono(i)) avisos.push("Nesta fase só o responsável pelo projeto (na ideia avulsa, o autor) muda o status.");
    if (geraOrigem(i) && dono(i) && PASSOS[i.status]?.includes("descartada")) avisos.push("Esta ideia deu origem a uma tarefa ou a um projeto e não pode ser descartada.");
  }
  $("#i-status-nota").hidden = !avisos.length;
  $("#i-status-nota").textContent = avisos.join(" ");
}

// Histórico de alterações nos status Aprovada, Executada e Descartada (gravado pelo banco)
const resumoDeTexto = (t) => { const s = (t ?? "").trim(); return s ? (s.length > 160 ? s.slice(0, 160) + "…" : s) : "(vazio)"; };
function renderRegistro(i) {
  const linhas = estado.historico.filter((h) => h.ideia_id === i.id).sort((a, b) => (a.em < b.em ? -1 : 1));
  $("#i-registro").hidden = !linhas.length;
  $("#i-registro-lista").replaceChildren(...linhas.map((h) => el("li", {},
    el("span", { class: "legenda", text: `${dataHora(h.em)} · ${nomePerfil(h.usuario_id) || "usuário removido"}` }),
    ...(h.tipo === "status"
      ? [el("span", { text: `Status: ${STATUS_IDEIA[h.status_de] ?? h.status_de} → ${STATUS_IDEIA[h.status_para] ?? h.status_para}` })]
      : [h.titulo_antes !== h.titulo_depois ? el("span", { text: `Título: "${resumoDeTexto(h.titulo_antes)}" → "${resumoDeTexto(h.titulo_depois)}"` }) : null,
         (h.descricao_antes ?? "") !== (h.descricao_depois ?? "") ? el("span", { text: `Descrição: "${resumoDeTexto(h.descricao_antes)}" → "${resumoDeTexto(h.descricao_depois)}"` }) : null]))));
}
// ---------- Converter em tarefa ou em projeto (etapa I7) ----------
// O que a ideia já gerou: os itens que a pessoa enxerga, pelo nome (clicar abre); os demais, só a quantidade
function renderGerou(i) {
  const g = geradoPor(i);
  $("#i-converter").hidden = !podeConverter(i);
  $("#i-gerou").hidden = g.nTarefas + g.nProjetos === 0;
  const linha = (rotulo, titulo, abrir, fechaProjeto) => el("li", {}, el("span", { class: "legenda", text: rotulo }),
    el("button", { class: "elo", type: "button", text: titulo, onclick: () => sairDaIdeia(abrir, fechaProjeto) }));
  const fora = (n, um, varios) => (n > 0 ? el("li", {}, el("span", { text: plural(n, um, varios) + " que você não vê ou que está na lixeira" })) : null);
  $("#i-gerou-lista").replaceChildren(...[
    ...g.tarefas.map((t) => linha("Tarefa", t.titulo, () => de.abrirTarefa(t.id))),
    fora(g.nTarefas - g.tarefas.length, "tarefa", "tarefas"),
    ...g.projetos.map((p) => linha("Projeto", p.titulo, () => de.abrirProjeto(p.id), true)),
    fora(g.nProjetos - g.projetos.length, "projeto", "projetos"),
  ].filter(Boolean));
}
// Sai da janela da ideia para abrir outra coisa (a tarefa ou o projeto). Com alteração por salvar, a pessoa resolve antes.
// Quando o destino é um projeto e há um projeto aberto por baixo, ele também precisa fechar.
function sairDaIdeia(abrir, fechaProjeto) {
  if ($("#dlg-ideia").dataset.alterado) { aviso("Salve ou cancele as alterações da ideia antes."); return false; }
  if (fechaProjeto && $("#dlg-projeto").open) {
    if ($("#dlg-projeto").dataset.alterado) { aviso("Salve ou cancele as alterações do projeto aberto antes."); return false; }
    $("#dlg-ideia").close(); $("#dlg-projeto").close();
  } else $("#dlg-ideia").close();
  retomarProjeto(); // já, e não só quando o aviso de fechamento chegar: a janela seguinte precisa saber o que ficou por baixo
  abrir();
  return true;
}
function converter(tipo) {
  const i = estado.ideias.find((x) => x.id === estado.editando?.id);
  if (!i || estado.editando?.tipo !== "ideia" || !podeConverter(i)) return;
  // A janela da tarefa ou do projeto abre com o título e a descrição da ideia; ao salvar ou cancelar, volta-se para a ideia
  const semente = { ideia_id: i.id, titulo: i.titulo, descricao: i.descricao ?? "", projeto_id: i.projeto_id ?? null, aoFechar: () => abrirIdeia(i.id) };
  if (tipo === "tarefa") sairDaIdeia(() => de.abrirTarefa(null, null, i.projeto_id ?? null, semente));
  else sairDaIdeia(() => de.abrirProjeto(null, null, semente), true);
}
$("#i-virar-tarefa").addEventListener("click", () => converter("tarefa"));
$("#i-virar-projeto").addEventListener("click", () => converter("projeto"));

// Por que o campo Projeto está travado (null se não está)
const motivoDaTravaDoProjeto = (i) => alto(i.status) ? "Só dá para vincular ou desvincular a ideia quando ela está em Nova ou Em análise."
  : (i.projeto_id && teveParticipacao(i) ? "Esta ideia já recebeu comentário ou apoio e não pode mais sair do projeto." : null);

// ---------- Apoiar e comentar (etapa I4) ----------
// Gravam na hora, sem o "Salvar". Refeito sempre que os dados mudam com a janela aberta (renderizar, em app.js).
export function renderParticipacao() {
  const i = estado.ideias.find((x) => x.id === estado.editando?.id);
  if (!i || estado.editando?.tipo !== "ideia") return;
  const eu = estado.usuario.id, deProjeto = !!i.projeto_id;
  $("#i-participacao").hidden = !deProjeto;
  $("#i-sem-participacao").hidden = deProjeto;
  // O campo Projeto trava com participação (regra do banco desde a I1) e fora de Nova e Em análise (desde a I6)
  const motivo = souAutor(i) ? motivoDaTravaDoProjeto(i) : null;
  $("#i-projeto").disabled = !!motivo;
  $("#i-projeto-nota").textContent = motivo ?? "";
  $("#i-projeto-nota").hidden = !motivo;
  if (motivo) $("#i-projeto").value = i.projeto_id ?? "";
  renderRegistro(i);
  renderGerou(i);
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
  if (podeEditarTexto(i)) {
    const titulo = $("#i-titulo").value.trim();
    if (!titulo) return;
    if (titulo !== i.titulo) dados.titulo = titulo;
    const descricao = $("#i-descricao").value.trim() || null;
    if (descricao !== (i.descricao ?? null)) dados.descricao = descricao;
  }
  if (autor && !alto(i.status)) {
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
