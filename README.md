# 💰 Minhas Finanças — Controla Gastos

Controle de receitas e despesas separado por **Corretor**, **Barbearia** e **Casa**, com
plano de contas e relatórios. Feito em **TypeScript**, para rodar na **Vercel**, com banco
**SQLite** (via [Turso](https://turso.tech), que é SQLite hospedado).

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

O app roda na Vercel, mas com um detalhe importante: **a Vercel não guarda arquivos**.
O disco lá é apagado a todo momento, então o banco não pode ser um arquivo — ele precisa
ficar num serviço de banco de dados. Por isso o passo 1 abaixo não é opcional: sem ele o
site sobe e funciona, mas apaga os seus lançamentos sozinho (e a tela avisa isso em
laranja, bem grande).

### Passo 1 — criar o banco no Turso (gratuito, 2 minutos)

O Turso é o próprio SQLite hospedado na nuvem. O plano gratuito é mais do que suficiente
para uso pessoal.

1. Crie a conta em <https://turso.tech>.
2. Instale a ferramenta de linha de comando e faça login:
   ```bash
   curl -sSfL https://get.tur.so/install.sh | bash
   turso auth login
   ```
3. Crie o banco e pegue os dois dados que a Vercel vai precisar:
   ```bash
   turso db create controla-gastos
   turso db show controla-gastos --url        # copie: libsql://...
   turso db tokens create controla-gastos     # copie: o token
   ```

> Prefere sem terminal? Dá para criar o banco e gerar o token pelo painel do Turso, na
> própria página do banco.

### Passo 2 — subir o projeto

1. Em <https://vercel.com/new>, importe este repositório do GitHub.
2. Não é preciso mudar nada nas configurações de build — o `vercel.json` já está pronto.
3. Antes de clicar em **Deploy**, abra **Environment Variables** e cadastre as duas:

   | Nome | Valor |
   | --- | --- |
   | `TURSO_DATABASE_URL` | o `libsql://...` do passo 1 |
   | `TURSO_AUTH_TOKEN` | o token do passo 1 |

4. **Deploy**. Na primeira vez que o site abrir, as tabelas e o plano de contas inicial
   são criados sozinhos.

> Se você já tinha feito o deploy antes de cadastrar as variáveis, adicione-as em
> *Settings → Environment Variables* e clique em **Redeploy**. Variáveis novas só valem
> a partir do próximo deploy.

### Se aparecer a faixa laranja de alerta

![Aviso de banco temporário](docs/aviso-banco-temporario.png)

Significa que o app subiu **sem** as variáveis do Turso e está gravando num banco
temporário. Faça o passo 1, cadastre as variáveis e clique em Redeploy.

---

## Rodando na sua máquina (opcional)

Sem nenhuma variável de ambiente, o banco vira um arquivo local em `data/financas.db`:

```bash
npm install
npm run dev            # http://localhost:8000
npm run exemplo        # opcional: lançamentos de exemplo para ver as telas cheias
```

O servidor local usa exatamente o mesmo roteador que roda na Vercel, então o que funciona
aqui funciona lá.

## Estrutura do projeto

```
api/index.ts       função da Vercel (ponto de entrada)
api/_rotas.ts      roteador: transforma Request em Response
api/_servico.ts    regras de negócio: validações, consultas e relatórios
api/_db.ts         conexão, criação das tabelas e dados iniciais
public/            interface: index.html, style.css, app.js
scripts/dev.ts     servidor local de desenvolvimento
scripts/exemplo.ts popula o banco com lançamentos de exemplo
tests/             testes automatizados (npm test)
vercel.json        rotas e configuração do deploy
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
```bash
turso db shell controla-gastos .dump > backup.sql
```

## Telas

**Relatórios** — comparativo entre as pastas, evolução mensal e totais por conta:

![Relatórios](docs/relatorios.png)

**Plano de contas** — cadastrar, alterar e excluir as contas de cada pasta:

![Plano de contas](docs/plano-de-contas.png)

## API HTTP

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/status` | onde os dados estão sendo guardados |
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

## Testes

```bash
npm test          # 25 testes das regras de negócio e relatórios
npm run typecheck # verificação de tipos
```

## Aviso

O app não tem senha. Publicado na Vercel, o endereço fica acessível para quem tiver o
link. Se isso for um problema, vale proteger o projeto com o *Password Protection* da
Vercel (recurso pago) ou manter o uso apenas na sua máquina.
