// Tela de entrada: o texto abaixo de "Gestão de Projetos" segue a largura do título.
// Se o título quebrar em duas linhas, o texto assume a largura da linha mais larga.

function ajustar(titulo) {
  const texto = titulo.nextElementSibling;
  if (!texto || !titulo.offsetParent) return;
  texto.style.maxWidth = "";
  const faixa = document.createRange();
  faixa.selectNodeContents(titulo);
  const larguras = [...faixa.getClientRects()].map((r) => r.width);
  if (larguras.length) texto.style.maxWidth = Math.ceil(Math.max(...larguras)) + "px";
}

const observador = new ResizeObserver((itens) => itens.forEach((i) => ajustar(i.target)));
document.querySelectorAll(".entrada-marca h1").forEach((h1) => observador.observe(h1));
// A fonte do título chega depois da página: mede de novo quando ela estiver pronta
document.fonts.ready.then(() => document.querySelectorAll(".entrada-marca h1").forEach(ajustar));
