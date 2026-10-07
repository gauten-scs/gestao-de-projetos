// Tema do site: claro, escuro ou o do aparelho. A escolha fica guardada neste aparelho (chave "gp-tema").
// Este arquivo é carregado no <head>, antes do estilo, para a tela já nascer no tema certo, sem piscar.
// O estilo.css só olha o atributo data-tema do <html>, que aqui vale sempre "claro" ou "escuro".
(() => {
  const CHAVE = "gp-tema";
  const aparelho = matchMedia("(prefers-color-scheme: dark)");
  // "seguir" (o padrão), "claro" ou "escuro"
  function ler() {
    let v = null;
    try { v = localStorage.getItem(CHAVE); } catch (_) { /* sem armazenamento: segue o aparelho */ }
    return v === "claro" || v === "escuro" ? v : "seguir";
  }
  function aplicar() {
    const escolha = ler();
    document.documentElement.dataset.tema = escolha === "seguir" ? (aparelho.matches ? "escuro" : "claro") : escolha;
  }
  function definir(escolha) {
    try {
      if (escolha === "claro" || escolha === "escuro") localStorage.setItem(CHAVE, escolha);
      else localStorage.removeItem(CHAVE);
    } catch (_) { /* sem armazenamento: vale só até fechar a página */ }
    aplicar();
  }
  aparelho.addEventListener("change", aplicar); // o aparelho trocou de tema com o site aberto
  addEventListener("storage", (e) => { if (e.key === CHAVE) aplicar(); }); // a escolha mudou em outra aba
  aplicar();
  window.tema = { ler, definir };
})();
