// Conexão com o Supabase. O endereço e a chave pública vêm de js/config.js.
export const sb = window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_CHAVE);
