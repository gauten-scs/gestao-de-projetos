// Service worker do Takt: guarda no aparelho uma cópia dos arquivos do site e os entrega dali, para a tela abrir
// mais rápido. Não guarda nada do banco nem o login: só os arquivos da lista abaixo.
// A cópia é sempre inteira e de uma versão só (a de js/versao.js): ou vale a antiga, ou vale a nova, nunca uma mistura.
// Quem descobre a versão nova e pede a troca é js/atualizacao.js; este arquivo também confere por conta própria a
// cada abertura, para o aparelho se acertar sozinho mesmo que a página guardada esteja com defeito.
// Para desligar tudo: publicar no lugar deste arquivo um que apague os caches "takt-" e chame registration.unregister().
// Arquivo novo em js/, css/ ou img/ precisa entrar na lista (o teste de tela acusa o que faltar).
const PREFIXO = "takt-";
const MARCA = "__pronto";           // gravada por último: cache sem ela ficou pela metade e não é usado
const ENTRE_CONSULTAS = 60 * 1000;  // por conta própria, não consulta a versão mais que uma vez por minuto
const ARQUIVOS = [
  "./", "manifest.webmanifest", "css/estilo.css",
  "js/app.js", "js/atualizacao.js", "js/config.js", "js/configuracoes.js", "js/diagnostico.js", "js/estado.js",
  "js/ideias.js", "js/ligacoes.js", "js/lixeira.js", "js/marca.js", "js/projetos.js", "js/quadro.js", "js/supabase.js",
  "js/tarefas.js", "js/tema.js", "js/util.js", "js/versao.js",
  "img/gauten-smartgov-letras-brancas-transparente.png", "img/takt-logo.png", "img/takt-favicon-32.png",
  "img/takt-favicon-64.png", "img/takt-icone-180.png", "img/takt-icone-192.png", "img/takt-icone-512.png",
];
const RAIZ = new URL("./", self.location).href;
const endereco = (a) => new URL(a, RAIZ).href;
const versaoDe = (texto) => texto.match(/VERSAO\s*=\s*"([^"]+)"/)?.[1] ?? null;

let atual = null;        // promessa com { nome, versao } do cache em uso, ou null se não há cache pronto
let construindo = null;  // construção em andamento, para dois pedidos não baixarem tudo duas vezes
let ultimaConsulta = 0;

// Procura o cache pronto mais novo. Feito uma vez a cada vez que o service worker acorda.
async function procurarAtual() {
  let achado = null;
  for (const nome of await caches.keys()) {
    if (!nome.startsWith(PREFIXO)) continue;
    const marca = await (await caches.open(nome)).match(endereco(MARCA));
    if (marca) achado = { nome, versao: await marca.text() };
  }
  return achado;
}
const cacheAtual = () => (atual ??= procurarAtual());

// Baixa todos os arquivos direto do servidor e só então troca a cópia. Se um deles falhar, nada muda.
function construir() {
  return (construindo ??= (async () => {
    const respostas = await Promise.all(ARQUIVOS.map(async (a) => {
      const r = await fetch(endereco(a), { cache: "no-store" });
      if (!r.ok || r.redirected) throw new Error("falhou " + a);
      return [endereco(a), r];
    }));
    const versao = versaoDe(await respostas.find(([u]) => u === endereco("js/versao.js"))[1].clone().text());
    if (!versao) throw new Error("versão não encontrada");
    const nome = PREFIXO + versao;
    await caches.delete(nome);
    const cache = await caches.open(nome);
    await Promise.all(respostas.map(([u, r]) => cache.put(u, r)));
    await cache.put(endereco(MARCA), new Response(versao));
    atual = Promise.resolve({ nome, versao });
    for (const outro of await caches.keys()) if (outro.startsWith(PREFIXO) && outro !== nome) await caches.delete(outro);
    return versao;
  })().finally(() => { construindo = null; }));
}

// Confere, por conta própria, se a versão publicada é a guardada. Se não for, a cópia nova vale na abertura seguinte.
async function conferir() {
  if (Date.now() - ultimaConsulta < ENTRE_CONSULTAS) return;
  ultimaConsulta = Date.now();
  try {
    const r = await fetch(endereco("js/versao.js") + "?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return;
    const publicada = versaoDe(await r.text()), guardada = (await cacheAtual())?.versao;
    if (publicada && publicada !== guardada) await construir();
  } catch (_) { /* sem internet: tenta na próxima abertura */ }
}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(cacheAtual().then((c) => c || construir()).catch(() => { /* sem cópia por ora: o site vem do servidor */ }));
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const rq = e.request;
  if (rq.method !== "GET" || !rq.url.startsWith(RAIZ)) return;
  const url = new URL(rq.url);
  const abertura = rq.mode === "navigate";
  // Consulta de versão e recarga pedida de propósito vão sempre ao servidor.
  if (!abertura && (url.search || rq.cache === "no-store" || rq.cache === "reload")) return;
  let chave = url.origin + url.pathname;
  if (abertura) {
    if (chave !== RAIZ && chave !== RAIZ + "index.html") return;
    chave = RAIZ;
    e.waitUntil(conferir());
  }
  e.respondWith((async () => {
    try {
      const c = await cacheAtual();
      const guardado = c && await (await caches.open(c.nome)).match(chave);
      if (guardado) return guardado;
    } catch (_) { /* problema com a cópia: segue para o servidor */ }
    return fetch(rq);
  })());
});

// Pedido da página (js/atualizacao.js): trocar a cópia pela versão publicada.
self.addEventListener("message", (e) => {
  const porta = e.ports[0];
  if (!porta) return;
  if (e.data?.tipo === "atualizar") {
    e.waitUntil(construir().then((versao) => porta.postMessage({ ok: true, versao }), () => porta.postMessage({ ok: false })));
  }
});
