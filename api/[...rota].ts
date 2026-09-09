/**
 * Ponto de entrada da Vercel.
 *
 * O nome [...rota] faz esta função responder por tudo que começa com /api/,
 * usando o roteamento de arquivos da própria Vercel — sem depender de rewrites.
 * Todo o roteamento em si acontece em _rotas.ts; arquivos com "_" na frente não
 * viram rotas, servem só como código de apoio.
 */

import { atender } from "./_rotas.js";

export default async function handler(request: Request): Promise<Response> {
  return atender(request);
}
