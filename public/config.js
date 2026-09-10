/**
 * Endereço do seu projeto no Supabase.
 *
 * Onde achar a chave: painel do Supabase → ícone de engrenagem (Project Settings)
 * → API Keys. Copie uma destas, o que aparecer no seu projeto:
 *
 *   - "Publishable key"  (começa com sb_publishable_...)  ← preferida
 *   - "anon public"      (aba Legacy API keys, texto longo começando com eyJ...)
 *
 * As duas funcionam. Ambas são feitas para ficar visíveis no navegador — quem
 * protege os dados é o login e o RLS configurado em supabase/schema.sql.
 *
 * NUNCA coloque aqui a chave "service_role" nem uma "Secret key" (sb_secret_...):
 * essas ignoram o RLS e dariam acesso total a quem abrisse o código da página.
 */

export const SUPABASE_URL = "https://gemfvpwgzhjruwedtcda.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_K_lPczLXIzfLiEDlCv9dng_vAnE1_GU";

export const configurado = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
