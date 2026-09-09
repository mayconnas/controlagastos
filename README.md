# 💰 Minhas Finanças — Controla Gastos

Controle de receitas e despesas separado por **Corretor**, **Barbearia** e **Casa**, com
plano de contas e relatórios. Feito em **TypeScript** para rodar na **Vercel**, com banco
**PostgreSQL** (Neon).

![Visão geral](docs/visao-geral.png)

## O que o app faz

| Funcionalidade | Onde fica |
| --- | --- |
| **Lançar receita e despesa** | Botões *Registrar Entrada* / *Registrar Despesa* na Visão Geral, ou *Novo lançamento* nas abas Entradas e Despesas. Editar e excluir também. |
| **Plano de contas** (cadastrar, alterar e excluir) | Aba **Plano de Contas**. Toda receita/despesa é obrigatoriamente vinculada a uma conta. |
| **3 centros separados: Corretor, Casa e Barbearia** | As três "pastas" no topo. Cada uma tem seu próprio plano de contas, seus lançamentos e seus totais. Dá para criar outras pastas. |
| **Relatórios** | Aba **Relatórios**: comparativo entre as pastas, evolução mês a mês, receitas e despesas por conta, e exportação em CSV (abre no Excel). |

---

## Como colocar na Vercel

A Vercel não guarda arquivos — o disco dela é apagado a todo momento. Por isso o banco
não pode ficar dentro do projeto; ele é um banco de dados separado, que você adiciona
**sem sair do painel da Vercel**.

### Passo 1 — subir o projeto

1. Em <https://vercel.com/new>, importe este repositório do GitHub.
2. Não é preciso mudar nada nas configurações de build — o `vercel.json` já está pronto.
3. Clique em **Deploy**.

Nesse momento o site sobe, mas ainda sem banco: a tela mostra uma faixa laranja com o
passo a passo abaixo.

### Passo 2 — criar e conectar o banco

1. No projeto, abra a aba **Storage** → **Browse Marketplace**.
2. Escolha **Neon** (Postgres, plano gratuito) e crie o banco.
3. Na página do banco, clique em **Connect to Project** e escolha este projeto.
4. Volte em **Deployments** e clique em **Redeploy** no deploy mais recente.

A Vercel cadastra a variável `DATABASE_URL` sozinha — não há nada para copiar e colar. O
Redeploy é necessário porque variáveis novas só valem a partir do próximo deploy.

Na primeira vez que o site abrir, as tabelas e o plano de contas inicial são criados
sozinhos.

> **Se você procurar tutoriais antigos**, vai achar "Vercel KV" e "Vercel Postgres".
> Esses produtos foram descontinuados: hoje todo banco de dados na Vercel vem pelo
> Marketplace.

### Se aparecer a faixa laranja de alerta

![Falta conectar o banco](docs/falta-conectar-banco.png)

Significa que o app subiu **sem** o banco conectado. Ele não perde dados nesse estado —
simplesmente ainda não tem onde guardá-los, e mostra o passo a passo na própria tela.
Faça o passo 2 acima e clique em **Redeploy**.

---

## Rodando na sua máquina (opcional)

```bash
npm install
export DATABASE_URL="postgres://usuario@localhost:5432/financas"   # ou a URL do seu Neon
npm run dev            # http://localhost:8000
npm run exemplo        # opcional: lançamentos de exemplo para ver as telas cheias
```

O servidor local usa exatamente o mesmo roteador que roda na Vercel, então o que funciona
aqui funciona lá. Apontar a `DATABASE_URL` para o próprio Neon é o caminho mais simples —
aí nem precisa instalar PostgreSQL.

## Estrutura do projeto

```
api/[...rota].ts   função da Vercel: responde por tudo em /api/
api/_rotas.ts      roteador: transforma Request em Response
api/_servico.ts    regras de negócio: validações, consultas e relatórios
api/_db.ts         conexão, criação das tabelas e dados iniciais
api/_erros.ts      o tipo de erro que vira resposta HTTP
public/            interface: index.html, style.css, app.js
scripts/dev.ts     servidor local de desenvolvimento
scripts/exemplo.ts popula o banco com lançamentos de exemplo
tests/             testes automatizados (npm test)
vercel.json        configuração do deploy
```

Arquivos dentro de `api/` que começam com `_` não viram rotas na Vercel — são só código
de apoio.

## Banco de dados

Três tabelas, com integridade garantida por chaves estrangeiras:

- **pastas** — os centros de custo (Corretor, Barbearia, Casa e as que você criar).
- **contas** — o plano de contas. Cada conta tem código, nome, tipo (`receita`/`despesa`),
  cor, situação (ativa/inativa) e pertence a uma pasta (ou a todas).
- **lancamentos** — data, descrição, valor, observação, e os vínculos com a conta e a pasta.

Os valores são guardados em **centavos (inteiros)**, então não existe erro de
arredondamento de ponto flutuante nas somas.

### Regras de proteção
- Conta com lançamentos não pode ser excluída — desative-a para escondê-la dos
  formulários sem perder o histórico.
- Pasta com lançamentos não pode ser excluída.
- O tipo de uma conta não muda depois que ela já tem lançamentos.
- O tipo e a pasta do lançamento vêm da conta escolhida, o que impede classificar uma
  despesa como receita, ou lançar na pasta errada.

### Backup
O Neon faz cópias automáticas, mas para ter o arquivo na sua mão:

```bash
pg_dump "$DATABASE_URL" > backup.sql
```

## Telas

**Relatórios** — comparativo entre as pastas, evolução mensal e totais por conta:

![Relatórios](docs/relatorios.png)

**Plano de contas** — cadastrar, alterar e excluir as contas de cada pasta:

![Plano de contas](docs/plano-de-contas.png)

## API HTTP

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/status` | se o banco está conectado |
| GET | `/api/painel?mes=AAAA-MM` | totais, categorias e últimos lançamentos de cada pasta |
| GET | `/api/meses` | meses e anos com movimento |
| GET/POST | `/api/pastas` | lista / cria pasta |
| PUT/DELETE | `/api/pastas/{id}` | altera / exclui pasta |
| GET/POST | `/api/contas` | lista / cria conta do plano de contas |
| PUT/DELETE | `/api/contas/{id}` | altera / exclui conta |
| GET/POST | `/api/lancamentos` | lista (com filtros) / cria lançamento |
| PUT/DELETE | `/api/lancamentos/{id}` | altera / exclui lançamento |
| GET | `/api/relatorios/categorias` | total por conta, com percentual |
| GET | `/api/relatorios/mensal?ano=` | evolução dos 12 meses |
| GET | `/api/relatorios/comparativo?mes=` | comparativo entre as pastas |
| GET | `/api/export.csv` | extrato em CSV |

Filtros aceitos nas listagens: `pasta`, `mes`, `tipo`, `conta`, `busca`, `de`, `ate`.

## Detalhe técnico: o driver não pode ter binário nativo

A função da Vercel é empacotada e executada num ambiente serverless, onde bibliotecas com
binário nativo (`.node`) costumam não sobreviver ao empacotamento — a função quebra ao
carregar e responde uma página de erro em vez de JSON.

Por isso o projeto usa o **`pg`**, que é JavaScript puro. Ele conversa tanto com o Neon
quanto com um PostgreSQL comum, o que também permite rodar a suíte de testes contra um
banco de verdade.

## Testes

```bash
createdb financas_teste
npm test          # 35 testes das regras de negócio, relatórios e configuração
npm run typecheck # verificação de tipos
```

Os testes precisam de um PostgreSQL. Por padrão usam
`postgres://postgres@127.0.0.1:5433/financas_teste`; para apontar para outro servidor,
defina `DATABASE_URL_TESTE`.

## Aviso

O app não tem senha. Publicado na Vercel, o endereço fica acessível para quem tiver o
link. Se isso for um problema, vale proteger o projeto com o *Password Protection* da
Vercel (recurso pago) ou manter o uso apenas na sua máquina.
