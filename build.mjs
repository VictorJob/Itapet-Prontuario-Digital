import { writeFile } from "node:fs/promises";

const url = String(process.env.SUPABASE_URL || "").trim();
const key = String(process.env.SUPABASE_KEY || "").trim();

if (!url || !key) {
  throw new Error("SUPABASE_URL e SUPABASE_KEY precisam estar configuradas no ambiente de build.");
}
if (!/^https:\/\/[^\s]+\.supabase\.co(?:\/.+)?$/i.test(url)) {
  throw new Error("SUPABASE_URL não parece ser uma URL válida do Supabase.");
}
if (/service_role|sb_secret_/i.test(key)) {
  throw new Error("SUPABASE_KEY não pode ser uma chave service_role/secret no frontend.");
}

const config = {
  SUPABASE_URL: url,
  SUPABASE_KEY: key,
};

await writeFile(
  "js/config.js",
  "/* Gerado no build; contém somente a configuração pública do Supabase. */\n" +
    "window.ITAPET_CONFIG = " + JSON.stringify(config) + ";\n",
  "utf8",
);
console.log("Itapet: js/config.js gerado com a chave pública do Supabase.");
