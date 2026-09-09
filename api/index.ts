/**
 * Ponto de entrada da Vercel. Todo o roteamento acontece em _rotas.ts —
 * arquivos com "_" na frente não viram rotas, servem só como código de apoio.
 */

import { atender } from "./_rotas.js";

export default async function handler(request: Request): Promise<Response> {
  return atender(request);
}
