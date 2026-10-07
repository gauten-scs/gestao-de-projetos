// Utilidades gerais: criação de elementos, datas, avisos e mensagens.
// Não dependem dos dados carregados.

export const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
export const PRIORIDADES = { baixa: "baixa", media: "média", alta: "alta" };
// Tela de celular: a mesma medida do bloco "Telas pequenas" do estilo.css
export const celular = () => matchMedia("(max-width: 820px)").matches;
export const TELAS = ["tela-carregando", "tela-login", "tela-senha", "tela-sem-acesso", "app"];

export function el(tag, props = {}, ...filhos) {
  const no = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props)) {
    if (valor == null || valor === false) continue;
    if (chave === "class") no.className = valor;
    else if (chave === "text") no.textContent = valor;
    else if (chave.startsWith("on")) no.addEventListener(chave.slice(2), valor);
    else if (chave in no) no[chave] = valor;
    else no.setAttribute(chave, valor);
  }
  for (const f of filhos.flat()) if (f != null && f !== false) no.append(f);
  return no;
}
export const porOrdem = (a, b) => a.ordem - b.ordem;
export const dois = (n) => String(n).padStart(2, "0");
export function hoje() { const d = new Date(); return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`; }
export function dataBR(s) { const [a, m, d] = s.split("-"); return `${d}/${m}/${a}`; }

export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function dataCurta(s) {
  const [a, m, d] = s.split("-");
  return `${Number(d)} ${MESES[Number(m) - 1]}` + (Number(a) !== new Date().getFullYear() ? " " + a : "");
}
export const ICONES = {
  data: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  feito: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  mais: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
};
export function icone(nome) { const s = el("span", { class: "icone" }); s.innerHTML = ICONES[nome]; return s; }
export function dataHora(iso) {
  const d = new Date(iso);
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} às ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}
export function plural(n, um, varios) { return `${n} ${n === 1 ? um : varios}`; }

export function mostrar(tela) { for (const t of TELAS) $("#" + t).hidden = t !== tela; }

let relogioAviso;
export function aviso(texto) {
  const caixa = $("#aviso");
  caixa.textContent = texto; caixa.hidden = false;
  clearTimeout(relogioAviso);
  relogioAviso = setTimeout(() => { caixa.hidden = true; }, 5000);
}
export function mensagem(id, texto) { const m = $(id); m.textContent = texto || ""; m.hidden = !texto; }

export function traduz(erro) {
  const m = erro?.message || String(erro);
  if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/different from the old/i.test(m)) return "A nova senha precisa ser diferente da atual.";
  if (/at least \d+ characters/i.test(m)) return "A senha é curta demais. Use pelo menos 8 caracteres.";
  if (/row-level security/i.test(m)) return "Você não tem permissão para esta alteração, ou deixaria de ter acesso ao item ao fazê-la.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  return m;
}

export function preencherSelect(select, opcoes, valor) {
  select.replaceChildren(...opcoes.map((o) => el("option", { value: o.v, text: o.t })));
  select.value = valor ?? "";
  if (select.selectedIndex < 0) select.selectedIndex = 0;
}

export function confirmar(texto, rotulo = "Excluir") {
  return new Promise((resolver) => {
    const dlg = $("#dlg-confirma");
    $("#confirma-texto").textContent = texto;
    $("#confirma-sim").textContent = rotulo;
    const fim = (resposta) => { dlg.close(); resolver(resposta); };
    $("#confirma-sim").onclick = () => fim(true);
    $("#confirma-nao").onclick = () => fim(false);
    dlg.onclose = () => resolver(false); // Esc ou clique fora valem como "não"; depois de uma resposta, não muda nada
    dlg.showModal();
  });
}
