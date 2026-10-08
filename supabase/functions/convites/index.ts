// Função de convites do site Gestão de Projetos (Gauten Smart.GOV).
// Só o administrador consegue usar. Ela gera o link de convite (ou de nova senha)
// e libera o acesso da pessoa convidada. Nenhum e-mail é enviado: o admin copia o link.
// Enquanto a pessoa não criar a senha, o perfil fica com "senha_pendente" e o banco não entrega nada à conta.
// "Gerar novo link" invalida a senha antiga e encerra as sessões abertas: só o link mais recente vale.
// Esta é uma cópia de segurança do código publicado no Supabase (Edge Functions > convites).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Só o site aceita a resposta desta função. Se o endereço do site mudar (domínio próprio, por exemplo),
// trocar aqui e publicar a função de novo, senão os convites param de funcionar.
const ORIGEM_DO_SITE = "https://gauten-scs.github.io";

const cors = {
  "Access-Control-Allow-Origin": ORIGEM_DO_SITE,
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resposta({ erro: "Método não permitido." }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // 1. Quem está chamando? Precisa estar logado, ativo e ser admin.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quem, error: erroQuem } = await admin.auth.getUser(token);
  if (erroQuem || !quem?.user) return resposta({ erro: "Sessão inválida. Entre novamente." }, 401);

  const { data: perfil } = await admin
    .from("perfis").select("papel, ativo, senha_pendente").eq("id", quem.user.id).maybeSingle();
  if (!perfil?.ativo || perfil.senha_pendente || perfil.papel !== "admin") {
    return resposta({ erro: "Somente o administrador pode convidar usuários." }, 403);
  }

  const corpo = await req.json().catch(() => null);
  if (!corpo || typeof corpo !== "object") return resposta({ erro: "Pedido inválido." }, 400);

  // 2. Convidar uma pessoa nova.
  if (corpo.acao === "convidar") {
    const email = String(corpo.email ?? "").trim().toLowerCase();
    const nome = String(corpo.nome ?? "").trim().slice(0, 120);
    const papel = corpo.papel === "admin" ? "admin" : "membro";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return resposta({ erro: "E-mail inválido." }, 400);
    if (!nome) return resposta({ erro: "Informe o nome." }, 400);

    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { data: { nome } },
    });
    if (error || !data?.user) {
      const jaExiste = /already|registered|exists/i.test(error?.message ?? "");
      return resposta({
        erro: jaExiste
          ? "Este e-mail já está cadastrado. Use \"Gerar novo link\" na lista de usuários."
          : "Não foi possível gerar o convite: " + (error?.message ?? "erro desconhecido"),
      }, 400);
    }

    const { error: erroPerfil } = await admin
      .from("perfis").update({ nome, papel, ativo: true, senha_pendente: true }).eq("id", data.user.id);
    if (erroPerfil) return resposta({ erro: "Convite gerado, mas o acesso não foi liberado: " + erroPerfil.message }, 500);

    return resposta({ token: data.properties.hashed_token, tipo: "invite" });
  }

  // 3. Gerar um novo link para alguém já cadastrado (convite vencido ou senha esquecida).
  if (corpo.acao === "novo_link") {
    const id = String(corpo.usuario_id ?? "");
    // O novo link encerra as sessões da conta; feito para si mesmo, derrubaria quem está pedindo.
    if (id === quem.user.id) {
      return resposta({ erro: "Para trocar a sua própria senha, use \"Minha conta\"." }, 400);
    }
    const { data: alvo, error: erroAlvo } = await admin.auth.admin.getUserById(id);
    if (erroAlvo || !alvo?.user?.email) return resposta({ erro: "Usuário não encontrado." }, 404);

    const tipo = alvo.user.email_confirmed_at ? "recovery" : "invite";

    // A senha antiga deixa de valer na hora: é trocada por uma sequência aleatória que ninguém conhece.
    if (tipo === "recovery") {
      const aleatoria = "Aa1!" + crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
      const { error: erroSenha } = await admin.auth.admin.updateUserById(id, { password: aleatoria });
      if (erroSenha) return resposta({ erro: "Não foi possível invalidar a senha antiga: " + erroSenha.message }, 400);
    }
    // Liga a senha pendente e encerra as sessões abertas da conta (depois da troca acima, que desliga o campo).
    const { error: erroTrava } = await admin.rpc("preparar_novo_link", { usuario: id });
    if (erroTrava) return resposta({ erro: "Não foi possível preparar o novo link: " + erroTrava.message }, 500);

    const { data, error } = await admin.auth.admin.generateLink({ type: tipo, email: alvo.user.email });
    if (error || !data) return resposta({ erro: "Não foi possível gerar o link: " + (error?.message ?? "") }, 400);

    return resposta({ token: data.properties.hashed_token, tipo });
  }

  return resposta({ erro: "Ação desconhecida." }, 400);
});
