// Atualização do site em páginas já abertas.
// A página compara a versão com que foi carregada (versao.js) com a que está publicada. Havendo versão nova,
// ela se atualiza sozinha; se a pessoa estiver com uma janela aberta ou digitando, mostra um aviso com o botão
// "Atualizar", para não perder o que está sendo feito. Não depende dos outros arquivos do site, de propósito:
// precisa funcionar mesmo que o resto tenha sido carregado pela metade de uma versão antiga.
import { VERSAO } from "./versao.js";

const CHAVE = "gp-atualizou-para";   // última versão para a qual esta aba já tentou se atualizar sozinha
const ENTRE_CONSULTAS = 60 * 1000;   // não consulta mais que uma vez por minuto
const DE_TEMPOS_EM_TEMPOS = 15 * 60 * 1000;
let ultimaConsulta = 0, atualizando = false, pendente = null; // pendente: versão nova já vista, à espera de a pessoa ficar livre

const guardado = () => { try { return sessionStorage.getItem(CHAVE); } catch (_) { return null; } };
const guardar = (v) => { try { sessionStorage.setItem(CHAVE, v); } catch (_) { /* segue sem guardar */ } };

// Lê a versão publicada direto do servidor, sem usar o que o navegador guardou.
async function versaoPublicada() {
  try {
    const resposta = await fetch(new URL("./versao.js?t=" + Date.now(), import.meta.url), { cache: "no-store" });
    if (!resposta.ok) return null;
    return (await resposta.text()).match(/VERSAO\s*=\s*"([^"]+)"/)?.[1] ?? null;
  } catch (_) { return null; } // sem internet: tenta de novo na próxima consulta
}

// A pessoa está no meio de alguma coisa? Janela aberta ou cursor em um campo.
function ocupada() {
  return !!document.querySelector("dialog[open]") || !!document.activeElement?.matches?.("input, select, textarea");
}

// Busca de novo no servidor os arquivos que a página usa e só então recarrega: assim a recarga não mistura
// arquivos novos com antigos que o navegador ainda guardava.
async function atualizar(nova) {
  if (atualizando) return;
  atualizando = true;
  guardar(nova);
  const arquivos = new Set(performance.getEntriesByType("resource").map((e) => e.name.split("?")[0])
    .filter((u) => u.startsWith(location.origin) && /\.(js|css)$/.test(u)));
  await Promise.allSettled([...arquivos].map((u) => fetch(u, { cache: "reload" })));
  location.reload();
}

function avisar(nova) {
  if (document.getElementById("aviso-versao")) return;
  const caixa = document.createElement("div");
  caixa.id = "aviso-versao"; caixa.setAttribute("role", "status");
  const texto = document.createElement("span"); texto.textContent = "Há uma versão nova do site.";
  const botao = document.createElement("button"); botao.type = "button"; botao.textContent = "Atualizar";
  botao.addEventListener("click", () => { botao.disabled = true; botao.textContent = "Atualizando"; atualizar(nova); });
  caixa.append(texto, botao);
  document.body.append(caixa);
}

// forcar: usado pelo teste de tela, para consultar sem esperar o intervalo.
export async function conferirVersao(forcar = false) {
  if (atualizando || (!forcar && Date.now() - ultimaConsulta < ENTRE_CONSULTAS)) return;
  ultimaConsulta = Date.now();
  const nova = await versaoPublicada();
  if (!nova || nova === VERSAO) return;
  // Sozinha, só uma tentativa por versão: se a recarga não trouxer a versão nova, fica o aviso, sem recarregar em laço.
  if (guardado() === nova) { avisar(nova); return; }
  if (ocupada()) { pendente = nova; avisar(nova); return; }
  atualizar(nova);
}

// Com janela aberta, o aviso fica por baixo dela. Quando a última janela fecha, a página se atualiza sozinha.
// (O evento "close" não sobe pela página; por isso é ouvido na descida.)
document.addEventListener("close", () => setTimeout(() => {
  if (pendente && !ocupada() && guardado() !== pendente) atualizar(pendente);
}, 800), true);

conferirVersao();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") conferirVersao(); });
addEventListener("pageshow", (e) => { if (e.persisted) conferirVersao(); });
setInterval(() => { if (document.visibilityState === "visible") conferirVersao(); }, DE_TEMPOS_EM_TEMPOS);
