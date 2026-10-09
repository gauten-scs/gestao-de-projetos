// Supabase de mentira, usado só pelo teste de tela (telas.mjs).
// Entra no lugar da biblioteca do Supabase: devolve dados de exemplo e guarda em window.__gravacoes
// tudo o que o site tentaria gravar, para o teste conferir. Não se conecta a nada.
(() => {
  const U = "u1", agora = new Date().toISOString();
  const base = { criado_por: U, criado_em: agora, atualizado_por: U, atualizado_em: agora, arquivado_em: null, arquivado_por: null };
  const D = {
    perfis: [{ id: U, nome: "Ana Teste", email: "ana@exemplo.com", papel: "admin", ativo: true }, { id: "u2", nome: "Bruno Silva", email: "b@exemplo.com", papel: "membro", ativo: true }, { id: "u3", nome: "Abel Costa", email: "abel@exemplo.com", papel: "membro", ativo: true, senha_pendente: true }],
    colunas: [
      { id: "cp1", quadro: "projetos", nome: "A fazer", ordem: 1, concluida: false }, { id: "cp2", quadro: "projetos", nome: "Concluído", ordem: 2, concluida: true },
      { id: "ct1", quadro: "tarefas", nome: "A fazer", ordem: 1, concluida: false }, { id: "ct2", quadro: "tarefas", nome: "Concluído", ordem: 2, concluida: true }, { id: "ct3", quadro: "tarefas", nome: "Em andamento", ordem: 3, concluida: false }],
    projetos: [{ ...base, id: "p1", titulo: "Projeto Exemplo", descricao: "x", coluna_id: "cp1", ordem: 1, responsavel_id: U, prazo: "2020-01-01", prioridade: "alta" }],
    tarefas: [
      { ...base, id: "t9", titulo: "Tarefa excluída", descricao: "", coluna_id: "ct1", ordem: 9, responsavel_id: U, prazo: "2030-01-01", prioridade: "media", projeto_id: null, concluida_em: null, arquivado_em: agora, arquivado_por: U },
      { ...base, id: "t8", titulo: "Tarefa de projeto excluída", descricao: "", coluna_id: "ct1", ordem: 8, responsavel_id: U, prazo: "2030-01-01", prioridade: "media", projeto_id: "p1", concluida_em: null, arquivado_em: agora, arquivado_por: U },
      { ...base, id: "t1", titulo: "Tarefa atrasada", descricao: "", coluna_id: "ct1", ordem: 1, responsavel_id: U, prazo: "2020-01-01", prioridade: "media", projeto_id: "p1", concluida_em: null },
      { ...base, id: "t2", titulo: "Tarefa avulsa", descricao: "", coluna_id: "ct1", ordem: 2, responsavel_id: U, prazo: "2099-01-01", prioridade: "baixa", projeto_id: null, concluida_em: null },
      { ...base, id: "t3", titulo: "Tarefa antiga concluída", descricao: "", coluna_id: "ct2", ordem: 1, responsavel_id: U, prazo: "2020-02-01", prioridade: "alta", projeto_id: null, concluida_em: new Date(Date.now() - 30 * 86400000).toISOString() }],
    ideias: [
      { ...base, id: "i1", titulo: "Ideia avulsa de exemplo", projeto_id: null, status: "nova", criado_em: new Date(Date.now() - 86400000).toISOString() },
      { ...base, id: "i2", titulo: "Ideia do Bruno no projeto", descricao: "Detalhes da ideia do Bruno.", projeto_id: "p1", status: "em_analise", criado_por: "u2", atualizado_por: "u2" },
      { ...base, id: "i3", titulo: "Ideia descartada no projeto", projeto_id: "p1", status: "descartada", criado_em: new Date(Date.now() - 2 * 86400000).toISOString() },
      { ...base, id: "i8", titulo: "Ideia avulsa excluída", projeto_id: null, status: "nova", arquivado_em: new Date(Date.now() - 86400000).toISOString(), arquivado_por: U },
      { ...base, id: "i9", titulo: "Ideia de projeto excluída", projeto_id: "p1", status: "nova", criado_por: "u2", arquivado_em: new Date(Date.now() - 86400000).toISOString(), arquivado_por: "u2" }],
    ideia_comentarios: [
      { id: "c1", ideia_id: "i3", texto: "Comentário do Bruno", criado_por: "u2", criado_em: new Date(Date.now() - 3600000).toISOString() },
      { id: "c2", ideia_id: "i3", texto: "Comentário da Ana", criado_por: U, criado_em: agora }],
    ideia_apoios: [{ ideia_id: "i3", usuario_id: "u2", criado_em: agora }, { ideia_id: "i3", usuario_id: U, criado_em: agora }],
    __extra: 0,
    projeto_membros: [{ projeto_id: "p1", usuario_id: "u2" }],
  };
  // ?pendente=1 no endereço: a conta de exemplo fica com a senha pendente, até a senha ser gravada
  const comPendencia = new URLSearchParams(location.search).has("pendente") || sessionStorage.getItem("teste-pendente") === "1";
  if (comPendencia) { sessionStorage.setItem("teste-pendente", "1"); D.perfis[0].senha_pendente = true; }
  // ?visao=1 no endereço: um projeto do Bruno, com uma tarefa e uma ideia dele, do qual a Ana (administradora) não faz parte
  if (new URLSearchParams(location.search).has("visao")) {
    D.projetos.push({ ...base, id: "p7", titulo: "Projeto do Bruno", descricao: "", coluna_id: "cp1", ordem: 2, responsavel_id: "u2", criado_por: "u2", prazo: null, prioridade: "media" });
    D.tarefas.push({ ...base, id: "t7", titulo: "Tarefa do Bruno", descricao: "", coluna_id: "ct1", ordem: 3, responsavel_id: "u2", criado_por: "u2", prazo: "2099-01-01", prioridade: "media", projeto_id: "p7", concluida_em: null });
    D.ideias.push({ ...base, id: "i7", titulo: "Ideia do Bruno no projeto dele", projeto_id: "p7", status: "nova", criado_por: "u2", atualizado_por: "u2" });
  }
  // ?fluxo=1 no endereço: ideias em vários status (etapa I6), um projeto do Bruno em que a Ana participa sem ser responsável
  // e uma ideia que deu origem a uma tarefa
  if (new URLSearchParams(location.search).has("fluxo")) {
    D.projetos.push({ ...base, id: "p8", titulo: "Projeto do Bruno com a Ana", descricao: "", coluna_id: "cp1", ordem: 3, responsavel_id: "u2", criado_por: "u2", prazo: null, prioridade: "media" });
    D.projeto_membros.push({ projeto_id: "p8", usuario_id: U });
    D.ideias.push(
      { ...base, id: "i10", titulo: "Ideia aprovada do Bruno", descricao: "Descrição aprovada.", projeto_id: "p1", status: "aprovada", criado_por: "u2", atualizado_por: "u2" },
      { ...base, id: "i11", titulo: "Ideia executada de exemplo", projeto_id: "p1", status: "executada" },
      { ...base, id: "i13", titulo: "Ideia da Ana no projeto do Bruno", projeto_id: "p8", status: "nova" },
      { ...base, id: "i14", titulo: "Ideia aprovada da Ana no projeto do Bruno", projeto_id: "p8", status: "aprovada" },
      { ...base, id: "i15", titulo: "Ideia que virou tarefa", projeto_id: "p1", status: "aprovada" });
    D.tarefas.push({ ...base, id: "t10", titulo: "Tarefa vinda da ideia", descricao: "", coluna_id: "ct1", ordem: 10, responsavel_id: U, prazo: "2099-01-01", prioridade: "media", projeto_id: "p1", concluida_em: null, ideia_id: "i15" });
    D.ideia_historico = [
      { id: "h1", ideia_id: "i10", usuario_id: "u1", em: new Date(Date.now() - 7200000).toISOString(), tipo: "status", status_de: "em_analise", status_para: "aprovada" },
      { id: "h2", ideia_id: "i10", usuario_id: "u1", em: new Date(Date.now() - 3600000).toISOString(), tipo: "texto", titulo_antes: "Ideia do Bruno", titulo_depois: "Ideia aprovada do Bruno", descricao_antes: null, descricao_depois: "Descrição aprovada." }];
  }
  window.__gravacoes = [];
  function consulta(tabela) {
    let linhas = D[tabela] || [], unico = false, op = "select", filtro = null;
    const q = {
      select: () => q, order: () => q,
      in: (c, v) => { if (filtro) filtro[c] = v; return q; },
      eq: (c, v) => { if (op === "select") linhas = linhas.filter((l) => l[c] === v); else if (filtro) filtro[c] = v; return q; },
      maybeSingle: () => { unico = true; return q; },
      update: (d) => { op = "update"; window.__gravacoes.push([tabela, "update", d]); return q; },
      insert: (d) => { op = "insert"; window.__gravacoes.push([tabela, "insert", d]); return q; },
      delete: () => { op = "delete"; filtro = {}; window.__gravacoes.push([tabela, "delete", filtro]); return q; }, // o filtro guarda o que seria apagado
      then: (ok, erro) => Promise.resolve(op === "select" ? { data: unico ? (linhas[0] || null) : linhas, error: null } : { data: null, error: null }).then(ok, erro),
    };
    return q;
  }
  const usuario = { id: U, email: "ana@exemplo.com" };
  window.supabase = { createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: usuario } } }), getUser: async () => ({ data: { user: usuario }, error: null }),
            signOut: async () => ({}), verifyOtp: async () => ({ error: null }), signInWithPassword: async () => ({ error: null }), updateUser: async () => { sessionStorage.removeItem("teste-pendente"); D.perfis[0].senha_pendente = false; return { error: null }; } },
    from: consulta, rpc: async (n, p) => { window.__gravacoes.push(["rpc", n, p]); return { error: null }; },
    functions: { invoke: async (n, o) => { window.__gravacoes.push(["funcao", n, o.body]); return { data: { token: "tok123", tipo: o.body.acao === "convidar" ? "invite" : "recovery" }, error: null }; } },
    channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
  }) };
})();
