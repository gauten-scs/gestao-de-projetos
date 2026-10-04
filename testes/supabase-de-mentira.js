// Supabase de mentira, usado só pelo teste de tela (telas.mjs).
// Entra no lugar da biblioteca do Supabase: devolve dados de exemplo e guarda em window.__gravacoes
// tudo o que o site tentaria gravar, para o teste conferir. Não se conecta a nada.
(() => {
  const U = "u1", agora = new Date().toISOString();
  const base = { criado_por: U, criado_em: agora, atualizado_por: U, atualizado_em: agora, arquivado_em: null, arquivado_por: null };
  const D = {
    perfis: [{ id: U, nome: "Ana Teste", email: "ana@exemplo.com", papel: "admin", ativo: true }, { id: "u2", nome: "Bruno Silva", email: "b@exemplo.com", papel: "membro", ativo: true }, { id: "u3", nome: "Abel Costa", email: "abel@exemplo.com", papel: "membro", ativo: true }],
    colunas: [
      { id: "cp1", quadro: "projetos", nome: "A fazer", ordem: 1, concluida: false }, { id: "cp2", quadro: "projetos", nome: "Concluído", ordem: 2, concluida: true },
      { id: "ct1", quadro: "tarefas", nome: "A fazer", ordem: 1, concluida: false }, { id: "ct2", quadro: "tarefas", nome: "Concluído", ordem: 2, concluida: true }],
    projetos: [{ ...base, id: "p1", titulo: "Projeto Exemplo", descricao: "x", coluna_id: "cp1", ordem: 1, responsavel_id: U, prazo: "2020-01-01", prioridade: "alta" }],
    tarefas: [
      { ...base, id: "t9", titulo: "Tarefa excluída", descricao: "", coluna_id: "ct1", ordem: 9, responsavel_id: U, prazo: "2030-01-01", prioridade: "media", projeto_id: null, concluida_em: null, arquivado_em: agora, arquivado_por: U },
      { ...base, id: "t8", titulo: "Tarefa de projeto excluída", descricao: "", coluna_id: "ct1", ordem: 8, responsavel_id: U, prazo: "2030-01-01", prioridade: "media", projeto_id: "p1", concluida_em: null, arquivado_em: agora, arquivado_por: U },
      { ...base, id: "t1", titulo: "Tarefa atrasada", descricao: "", coluna_id: "ct1", ordem: 1, responsavel_id: U, prazo: "2020-01-01", prioridade: "media", projeto_id: "p1", concluida_em: null },
      { ...base, id: "t2", titulo: "Tarefa avulsa", descricao: "", coluna_id: "ct1", ordem: 2, responsavel_id: U, prazo: "2099-01-01", prioridade: "baixa", projeto_id: null, concluida_em: null }],
    __extra: 0,
    projeto_membros: [{ projeto_id: "p1", usuario_id: "u2" }],
  };
  window.__gravacoes = [];
  function consulta(tabela) {
    let linhas = D[tabela] || [], unico = false, op = "select";
    const q = {
      select: () => q, order: () => q, in: () => q,
      eq: (c, v) => { if (op === "select") linhas = linhas.filter((l) => l[c] === v); return q; },
      maybeSingle: () => { unico = true; return q; },
      update: (d) => { op = "update"; window.__gravacoes.push([tabela, "update", d]); return q; },
      insert: (d) => { op = "insert"; window.__gravacoes.push([tabela, "insert", d]); return q; },
      delete: () => { op = "delete"; window.__gravacoes.push([tabela, "delete"]); return q; },
      then: (ok, erro) => Promise.resolve(op === "select" ? { data: unico ? (linhas[0] || null) : linhas, error: null } : { data: null, error: null }).then(ok, erro),
    };
    return q;
  }
  const usuario = { id: U, email: "ana@exemplo.com" };
  window.supabase = { createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: usuario } } }), getUser: async () => ({ data: { user: usuario }, error: null }),
            signOut: async () => ({}), verifyOtp: async () => ({ error: null }), signInWithPassword: async () => ({ error: null }), updateUser: async () => ({ error: null }) },
    from: consulta, rpc: async (n, p) => { window.__gravacoes.push(["rpc", n, p]); return { error: null }; },
    functions: { invoke: async (n, o) => { window.__gravacoes.push(["funcao", n, o.body]); return { data: { token: "tok123", tipo: o.body.acao === "convidar" ? "invite" : "recovery" }, error: null }; } },
    channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
  }) };
})();
