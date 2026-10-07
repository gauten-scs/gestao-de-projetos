// Gestão de Projetos | Gauten Smart.GOV
// Site estático (GitHub Pages) + Supabase (login, banco de dados e tempo real).
// Este arquivo é a partida do site: entrada (login), carregamento dos dados, navegação e Minha conta.

import "./marca.js";
import { sb } from "./supabase.js";
import { ligar } from "./ligacoes.js";
import { VERSAO } from "./versao.js";
import { $, el, plural, hoje, mostrar, aviso, mensagem, traduz } from "./util.js";
import { estado, souAdmin, avatar, atrasado, noMeuQuadro } from "./estado.js";
import { renderQuadro } from "./quadro.js";
import { renderFiltros, botaoConcluir, chipsDaTarefa, renderTarefas, abrirTarefa } from "./tarefas.js";
import { abrirProjeto, renderTarefasDoProjeto } from "./projetos.js";
import { renderMinhaLixeira } from "./lixeira.js";
import { renderConfig, abrirColuna } from "./configuracoes.js";

ligar({ abrirProjeto, abrirTarefa, botaoConcluir, chipsDaTarefa, renderizar, carregar });

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
  recolherAoTocarFora(e);
  const nova = e.target.closest("[data-nova-coluna]");
  if (nova) abrirColuna(nova.dataset.novaColuna, null);
});

// Toda janela ou painel que abre por cima fecha ao clicar ou tocar fora dele, na parte escurecida da tela.
// Vale no computador e no celular. O clique na parte escurecida chega com a própria janela como alvo;
// por isso a posição do clique é comparada com a caixa da janela.
// Janela em que a pessoa já digitou ou escolheu algo não fecha, para um clique sem querer não apagar o que foi feito.
// O clique precisa começar e terminar fora: arrastar o mouse de dentro para fora (ao selecionar um texto) não fecha.
const foraDaJanela = (e) => {
  const d = e.target;
  if (!(d instanceof HTMLDialogElement) || !d.open) return false;
  const r = d.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
};
let comecouFora = false;
document.addEventListener("pointerdown", (e) => { comecouFora = foraDaJanela(e); }, true);
function recolherAoTocarFora(e) {
  if (comecouFora && foraDaJanela(e) && !e.target.dataset.alterado) e.target.close();
  comecouFora = false;
}
document.addEventListener("input", (e) => { const d = e.target.closest?.("dialog"); if (d && e.target.closest("form")) d.dataset.alterado = "1"; }, true);
document.addEventListener("close", (e) => { if (e.target instanceof HTMLDialogElement) delete e.target.dataset.alterado; }, true);

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
  $("#menu-config").hidden = $("#mais-config").hidden = !souAdmin();
  $("#botao-novo").hidden = !["projetos", "tarefas"].includes(estado.visao);
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
  const partes = (total, ...resto) => [el("b", { text: total }), ...resto.filter(Boolean).flatMap((p) => [" · ", p])];
  $("#resumo-projetos").replaceChildren(...partes(plural(estado.projetos.length, "projeto", "projetos"),
    pAtrasados && el("strong", { text: plural(pAtrasados, "atrasado", "atrasados") })));
  const abertas = estado.tarefas.filter((t) => noMeuQuadro(t) && !t.concluida_em);
  const tAtrasadas = abertas.filter(atrasado).length;
  const dia = hoje(), paraHoje = abertas.filter((t) => t.prazo === dia).length;
  $("#resumo-tarefas").replaceChildren(...partes(plural(abertas.length, "tarefa aberta", "tarefas abertas"),
    tAtrasadas && el("strong", { text: plural(tAtrasadas, "atrasada", "atrasadas") }), paraHoje && `${paraHoje} para hoje`));
}

// ---------- Celular: painel "Mais" da barra de baixo ----------
$("#menu-mais").addEventListener("click", () => $("#dlg-mais").showModal());
// Fecha ao tocar fora do painel ou em qualquer item; a navegação e o Sair seguem pelos ouvintes gerais
$("#dlg-mais").addEventListener("click", (e) => { if (e.target === e.currentTarget || e.target.closest("button")) e.currentTarget.close(); });
$("#mais-conta").addEventListener("click", () => $("#btn-conta").click());

// ---------- Celular: botão "+" e painel "Novo" ----------
$("#botao-novo").addEventListener("click", () => $("#dlg-novo").showModal());
$("#dlg-novo").addEventListener("click", (e) => { if (e.target === e.currentTarget || e.target.closest("button")) e.currentTarget.close(); });
$("#novo-item-tarefa").addEventListener("click", () => abrirTarefa(null));
$("#novo-item-projeto").addEventListener("click", () => abrirProjeto(null));

// ---------- Contorno de foco só para quem usa o teclado ----------
// Um toque ou clique marca a página; a tecla Tab desmarca. O estilo.css esconde o contorno enquanto a marca existir.
addEventListener("pointerdown", () => document.documentElement.classList.add("pelo-toque"), true);
addEventListener("keydown", (e) => { if (e.key === "Tab") document.documentElement.classList.remove("pelo-toque"); }, true);

// ---------- Diagnóstico de tela: só com #diag no fim do endereço ----------
if (location.hash === "#diag") import("./diagnostico.js");

// ---------- Minha conta ----------
$("#btn-conta").addEventListener("click", () => {
  $("#m-nome").value = estado.perfil.nome;
  $("#m-senha").value = "";
  $("#versao-do-site").textContent = "Versão do site: " + VERSAO;
  mensagem("#conta-msg", "");
  marcarTema();
  $("#dlg-conta").showModal();
});

// Tema: muda na hora, sem depender do "Salvar", e fica guardado neste aparelho (ver js/tema.js)
function marcarTema() {
  for (const b of document.querySelectorAll("[data-tema-opcao]")) b.setAttribute("aria-pressed", String(b.dataset.temaOpcao === window.tema.ler()));
}
for (const b of document.querySelectorAll("[data-tema-opcao]")) b.addEventListener("click", () => { window.tema.definir(b.dataset.temaOpcao); marcarTema(); });

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
