// Diagnóstico de tela, para investigar diferenças entre navegadores de celular.
// Só é carregado quando o endereço termina com #diag ou pelo link "Diagnóstico" de "Minha conta".
// Não lê nem grava dado nenhum do site: mostra medidas da tela e a versão dos arquivos guardados no aparelho.
// O botão "Limpar arquivos guardados" apaga essa cópia (a do sw.js) e recarrega o site do servidor.
import { VERSAO } from "./versao.js";
const moldura = document.createElement("div");
moldura.id = "diagnostico";
moldura.style.cssText = "margin:12px 16px;padding:12px;border:2px solid #b42a2e;border-radius:10px;background:#fff;color:#1c1e23;font:12px/1.5 ui-monospace,Menlo,monospace";
const caixa = document.createElement("pre");
caixa.style.cssText = "margin:0;font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text";
const limpar = document.createElement("button");
limpar.type = "button"; limpar.id = "limpar-guardados"; limpar.textContent = "Limpar arquivos guardados";
limpar.style.cssText = "margin-top:10px;min-height:44px;padding:0 16px;border:1px solid #b42a2e;border-radius:10px;background:#fff;color:#9e2327;font:600 15px/1 system-ui,sans-serif;cursor:pointer";
moldura.append(caixa, limpar);
document.querySelector(".palco").prepend(moldura);

// Cópia dos arquivos do site guardada pelo service worker: qual versão está no aparelho.
let guardados = "conferindo";
async function conferirGuardados() {
  try {
    if (!("caches" in window) || !navigator.serviceWorker) { guardados = "não disponível neste navegador"; return; }
    const versoes = [];
    for (const nome of await caches.keys()) {
      if (!nome.startsWith("takt-")) continue;
      const marca = await (await caches.open(nome)).match("__pronto");
      versoes.push(marca ? await marca.text() : nome.slice(5) + " (incompleta)");
    }
    guardados = (versoes.join(", ") || "nenhum") + (navigator.serviceWorker.controller ? "" : "  (ainda não em uso)");
  } catch (_) { guardados = "não foi possível conferir"; }
}
limpar.addEventListener("click", async () => {
  limpar.disabled = true; limpar.textContent = "Limpando";
  try {
    if ("caches" in window) for (const nome of await caches.keys()) if (nome.startsWith("takt-")) await caches.delete(nome);
    await (await navigator.serviceWorker?.getRegistration())?.unregister();
  } catch (_) { /* recarrega mesmo assim */ }
  location.reload();
});

// Mede em pixels uma altura escrita em CSS (100vh, 100dvh, área segura etc.)
function medir(valor) {
  const m = document.createElement("div");
  m.style.cssText = "position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;height:" + valor;
  document.body.append(m); const h = m.getBoundingClientRect().height; m.remove();
  return Math.round(h * 10) / 10;
}
const r = (n) => Math.round(n * 10) / 10;
function faixa(seletor) {
  const e = document.querySelector(seletor);
  if (!e) return "não existe";
  const b = e.getBoundingClientRect(), s = getComputedStyle(e);
  return `topo ${r(b.top)}  base ${r(b.bottom)}  alt ${r(b.height)}  larg ${r(b.width)}  (${s.display}, ${s.position})`;
}
function atualizar() {
  const d = document.documentElement, v = window.visualViewport;
  caixa.textContent = [
    "DIAGNÓSTICO DE TELA (tire uma captura e envie)",
    navigator.userAgent,
    "versão do site      " + VERSAO,
    "arquivos guardados  " + guardados,
    "",
    `janela (inner)      ${innerWidth} x ${innerHeight}`,
    `documento (client)  ${d.clientWidth} x ${d.clientHeight}`,
    `documento (scroll)  ${d.scrollWidth} x ${d.scrollHeight}`,
    `rolagem             x ${r(scrollX)}  y ${r(scrollY)}`,
    v ? `visual              ${r(v.width)} x ${r(v.height)}  topo ${r(v.offsetTop)}  esq ${r(v.offsetLeft)}  pagTopo ${r(v.pageTop)}  zoom ${r(v.scale * 100) / 100}` : "visual              não disponível",
    `aparelho (screen)   ${screen.width} x ${screen.height}  dpr ${devicePixelRatio}`,
    `100vh ${medir("100vh")}  100dvh ${medir("100dvh")}  100svh ${medir("100svh")}  100lvh ${medir("100lvh")}`,
    `área segura         topo ${medir("env(safe-area-inset-top)")}  base ${medir("env(safe-area-inset-bottom)")}`,
    `instalado (PWA)     ${matchMedia("(display-mode: standalone)").matches || navigator.standalone === true ? "sim" : "não"}`,
    "",
    "moldura (.app)   " + faixa(".app"),
    "logo             " + faixa(".lateral .logo"),
    "conta (avatar)   " + faixa(".conta"),
    "linha 6 cores    " + faixa(".app > .espinha"),
    "miolo (.palco)   " + faixa(".palco"),
    "barra de baixo   " + faixa(".menu"),
    "esta caixa       " + faixa("#diagnostico"),
  ].join("\n");
}
for (const ev of ["scroll", "resize", "orientationchange"]) addEventListener(ev, atualizar, { passive: true });
window.visualViewport?.addEventListener("resize", atualizar); window.visualViewport?.addEventListener("scroll", atualizar);
document.querySelector(".palco").addEventListener("scroll", atualizar, { passive: true });
setInterval(() => { conferirGuardados(); atualizar(); }, 1000); conferirGuardados().then(atualizar); atualizar();
