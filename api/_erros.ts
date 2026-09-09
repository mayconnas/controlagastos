/** Erro de validação ou de regra de negócio, devolvido ao cliente com status HTTP. */
export class ErroApi extends Error {
  constructor(public readonly mensagem: string, public readonly status = 400) {
    super(mensagem);
    this.name = "ErroApi";
  }
}
