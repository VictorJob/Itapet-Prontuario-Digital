/* Cliente Supabase (porta de src/integrations/supabase/client.ts). */
window.Itapet = window.Itapet || {};
(function (I) {
  const { SUPABASE_URL, SUPABASE_KEY } = window.ITAPET_CONFIG || {};
  if (!SUPABASE_URL || SUPABASE_URL.includes("SEU-PROJETO") || !SUPABASE_KEY || SUPABASE_KEY === "sb_publishable_...") {
    I.configMissing = true;
    console.error("[Itapet] Configure SUPABASE_URL e SUPABASE_KEY em js/config.js");
    return;
  }
  const isNewKey = (v) => v.startsWith("sb_publishable_") || v.startsWith("sb_secret_");
  // As chaves novas do Supabase são opacas (não são JWT): remove o header Authorization quando ele só repete a chave.
  const customFetch = (input, init) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init && init.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (isNewKey(SUPABASE_KEY) && headers.get("Authorization") === "Bearer " + SUPABASE_KEY) headers.delete("Authorization");
    headers.set("apikey", SUPABASE_KEY);
    return fetch(input, Object.assign({}, init, { headers }));
  };
  I.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { fetch: customFetch },
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
})(window.Itapet);
