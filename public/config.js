/**
 * Endereço do seu projeto no Supabase.
 *
 * Onde achar os dois valores: painel do Supabase → seu projeto →
 * Project Settings → Data API. Copie "Project URL" e a chave "anon public".
 *
 * A chave "anon" é feita para ficar visível no navegador — quem protege os
 * dados é o login e o RLS configurado no schema.sql, não o segredo da chave.
 * Nunca coloque aqui a chave "service_role": ela ignora o RLS.
 */

export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

export const configurado = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
