// Ideias: registro rápido, lista com filtros e a janela da ideia.
// Ideia avulsa (sem projeto) é privada: só quem criou vê. Ideia de projeto é vista por quem acessa o projeto.
// Só o autor altera o texto, vincula, desvincula e exclui. O status é do autor ou do responsável pelo projeto.
import { sb } from "./supabase.js";
import { de } from "./ligacoes.js";
import { $, el, celular, plural, dataCurta, dataHora, dois, ICONES, aviso, traduz, preencherSelect, confirmar } from "./util.js";
import { estado, nomePerfil, avatar } from "./estado.js";

export const STATUS_IDEIA = { nova: "Nova", em_analise: "Em análise", aprovada: "Aprovada", descartada: "Descartada" };
const opcoesStatus = Object.entries(STATUS_IDEIA).map(([v, t]) => ({ v, t }));
const projetosEmOrdem = () => estado.projetos.slice().sort((a, b) => a.titulo.localeCompare(b.titulo)).map((p) => ({ v: p.id, t: p.titulo }));
const tituloDoProjeto = (id) => estado.projetos.find((p) => p.id === id)?.titulo;
const souAutor = (i) => i.criado_por === estado.usuario.id;
const respondoPeloProjeto = (i) => !!i.projeto_id && estado.projetos.find((p) => p.id === i.projeto_id)?.responsavel_id === estado.usuario.id;
// Dia em que a ideia foi registrada, no horário do aparelho, no formato das datas do site (ano-mês-dia)
function diaDe(iso) { const d = new Date(iso); return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`; }

export function origemDaIdeia(i) { return tituloDoProjeto(i.projeto_id) ?? "Ideia avulsa"; }

// ---------- Tela ----------
export function renderIdeias() {
  // Registro: avulsa ou em um projeto que a pessoa acessa (os únicos que ela enxerga)
  const destino = $("#ideia-destino");
  preencherSelect(destino, [{ v: "", t: "Ideia avulsa (só você vê)" }, ...projetosEmOrdem()], destino.value);
  notaDoDestino();
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
    raiz.append(el("p", { class: "apoio", text: estado.ideias.length ? "Nenhuma ideia com esses filtros." : "Nenhuma ideia registrada ainda. Escreva a primeira no campo acima." }));
    return;
  }
  raiz.append(el("section", { class: "grupo-datas" },
    el("h2", {}, "Ideias", el("span", { class: "contagem", text: String(ideias.length) })),
    ...ideias.map((i) => linhaDaIdeia(i))));
}

// Etiquetas da ideia: status e data do registro
export function chipsDaIdeia(i) {
  const data = el("span", { class: "chip", title: "Registrada em " + dataHora(i.criado_em) });
  data.innerHTML = ICONES.data;
  data.append(dataCurta(diaDe(i.criado_em)));
  return el("div", { class: "chips" }, el("span", { class: "chip status-" + i.status, text: STATUS_IDEIA[i.status] ?? i.status }), data);
}

// Uma ideia em lista, no modelo do cartão: texto na primeira linha, com o autor à direita; projeto embaixo; depois as etiquetas.
// Dentro do projeto a linha não repete o nome do projeto.
export function linhaDaIdeia(i, semOrigem) {
  return el("div", { class: "linha-tarefa ideia" },
    el("button", { class: "abrir", type: "button", onclick: () => abrirIdeia(i.id) },
      el("span", { class: "nome", text: i.texto, title: i.texto }),
      semOrigem ? null : el("span", { class: "origem" + (i.projeto_id ? "" : " avulsa"), text: origemDaIdeia(i) })),
    chipsDaIdeia(i),
    i.criado_por ? avatar(i.criado_por) : null);
}

$("#filtro-ideia-projeto").addEventListener("change", (e) => { estado.filtroIdeiaProjeto = e.target.value; renderIdeias(); });
$("#filtro-ideia-status").addEventListener("change", (e) => { estado.filtroIdeiaStatus = e.target.value; renderIdeias(); });

// ---------- Registrar ----------
function notaDoDestino() {
  $("#ideia-nota").textContent = $("#ideia-destino").value
    ? "Todos que têm acesso ao projeto vão ver esta ideia."
    : "Ideia avulsa: só você vê. Dá para vincular a um projeto depois.";
}
$("#ideia-destino").addEventListener("change", notaDoDestino);

// No computador, Enter registra e Shift+Enter quebra a linha. No celular, Enter quebra a linha e o botão registra.
$("#ideia-texto").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !celular()) { e.preventDefault(); $("#form-ideia").requestSubmit(); }
});

$("#form-ideia").addEventListener("submit", async (e) => {
  e.preventDefault();
  const texto = $("#ideia-texto").value.trim();
  if (!texto) return;
  const { error } = await sb.from("ideias").insert({ texto, projeto_id: $("#ideia-destino").value || null });
  if (error) { aviso("Não foi possível registrar a ideia: " + traduz(error)); return; }
  $("#ideia-texto").value = "";
  aviso("Ideia registrada.");
  await de.carregar();
});

// ---------- Janela da ideia ----------
export function abrirIdeia(id) {
  const i = estado.ideias.find((x) => x.id === id);
  if (!i) return;
  const autor = souAutor(i), mudaStatus = autor || respondoPeloProjeto(i);
  estado.editando = { tipo: "ideia", id: i.id };
  $("#i-origem").textContent = i.projeto_id ? origemDaIdeia(i) : (autor ? "Ideia avulsa: só você vê" : "Ideia avulsa");
  $("#i-origem").className = "origem" + (i.projeto_id ? "" : " avulsa");
  // O autor edita o texto; os demais leem
  $("#i-texto").value = i.texto;
  $("#i-campo-texto").hidden = !autor;
  $("#i-leitura").textContent = i.texto;
  $("#i-leitura").hidden = autor;
  $("#i-autor").replaceChildren(i.criado_por ? avatar(i.criado_por) : "", el("span", { text: nomePerfil(i.criado_por) || "usuário removido" }));
  preencherSelect($("#i-status"), opcoesStatus, i.status);
  $("#i-status").disabled = !mudaStatus;
  preencherSelect($("#i-projeto"), [{ v: "", t: "Ideia avulsa (só você vê)" }, ...projetosEmOrdem()], i.projeto_id ?? "");
  $("#i-campo-projeto").hidden = !autor;
  let historico = `Registrada por ${nomePerfil(i.criado_por) || "usuário removido"} em ${dataHora(i.criado_em)}.`;
  if (i.atualizado_em && i.atualizado_em !== i.criado_em) historico += ` Última alteração por ${nomePerfil(i.atualizado_por) || "usuário removido"} em ${dataHora(i.atualizado_em)}.`;
  $("#i-historico").textContent = historico;
  $("#i-salvar").hidden = !mudaStatus;
  $("#i-cancelar").textContent = mudaStatus ? "Cancelar" : "Fechar";
  $("#i-excluir").hidden = !autor;
  $("#dlg-ideia").showModal();
}

$("#form-ideia-janela").addEventListener("submit", async (e) => {
  e.preventDefault();
  const i = estado.ideias.find((x) => x.id === estado.editando?.id);
  if (!i) return;
  const autor = souAutor(i), dados = {};
  if ($("#i-status").value !== i.status) dados.status = $("#i-status").value;
  if (autor) {
    const texto = $("#i-texto").value.trim();
    if (!texto) return;
    if (texto !== i.texto) dados.texto = texto;
    const projeto = $("#i-projeto").value || null;
    if (projeto !== (i.projeto_id ?? null)) {
      // Mudar a ideia de lugar muda quem a enxerga: a pessoa confirma antes
      const pergunta = !projeto ? "Desvincular esta ideia do projeto? Ela volta a ser privada: só você vai ver."
        : `Vincular esta ideia ao projeto "${tituloDoProjeto(projeto)}"? Ela ficará visível para todos que têm acesso a esse projeto.`;
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
