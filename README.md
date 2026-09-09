# 💰 Minhas Finanças — Controla Gastos

Aplicativo simples de controle financeiro pessoal e dos negócios, com banco de dados
**SQLite** e interface web em tema escuro. Roda direto na sua máquina, **sem instalar
nada além do Python** (não usa Flask, Django nem npm).

![Visão geral](docs/visao-geral.png)

## O que o app faz

| Funcionalidade | Onde fica |
| --- | --- |
| **Lançar receita e despesa** | Botões *Registrar Entrada* / *Registrar Despesa* na Visão Geral, ou *Novo lançamento* nas abas Entradas e Despesas. Editar e excluir também. |
| **Plano de contas** (cadastrar, alterar e excluir) | Aba **Plano de Contas**. Toda receita/despesa é obrigatoriamente vinculada a uma conta. |
| **3 centros separados: Corretor, Casa e Barbearia** | As três "pastas" no topo. Cada uma tem seu próprio plano de contas, seus lançamentos e seus totais. Dá para criar outras pastas. |
| **Relatórios** | Aba **Relatórios**: comparativo entre as pastas, evolução mês a mês, receitas e despesas por conta, e exportação em CSV (abre no Excel). |

## Como usar

### Windows
1. Instale o [Python](https://www.python.org/downloads/) (marque *Add Python to PATH*).
2. Dê dois cliques em **`iniciar.bat`**.

### Linux / macOS
```bash
./iniciar.sh
```

### Manualmente (qualquer sistema)
```bash
python3 app.py            # abre em http://localhost:8000
python3 app.py --port 9000
```

Na primeira execução o banco `data/financas.db` é criado automaticamente já com as
três pastas e um plano de contas inicial.

Para carregar lançamentos de exemplo e ver as telas preenchidas:

```bash
python3 exemplo.py            # usa o mês atual
python3 exemplo.py 2025-08    # usa o mês informado
```

## Estrutura do projeto

```
app.py            servidor HTTP e rotas da API (biblioteca padrão do Python)
api.py            regras de negócio: validações, consultas e relatórios
db.py             conexão, criação das tabelas e dados iniciais
exemplo.py        popula o banco com lançamentos de exemplo (opcional)
test_app.py       testes automatizados (python3 test_app.py)
static/           interface web: index.html, style.css, app.js
data/financas.db  banco SQLite (criado na primeira execução)
```

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
Todo o seu histórico está no arquivo `data/financas.db`. Copie esse arquivo e o backup
está feito. Para restaurar, basta colocá-lo de volta na pasta `data/`.

## API HTTP

O front-end conversa com estes endpoints (úteis se quiser integrar outra coisa):

| Método | Rota | Descrição |
| --- | --- | --- |
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

## Telas

**Relatórios** — comparativo entre as pastas, evolução mensal e totais por conta:

![Relatórios](docs/relatorios.png)

**Plano de contas** — cadastrar, alterar e excluir as contas de cada pasta:

![Plano de contas](docs/plano-de-contas.png)

## Testes

```bash
python3 test_app.py
```

## Observações

O servidor escuta apenas em `127.0.0.1` (só a sua máquina). Se quiser acessar pelo
celular na mesma rede, use `python3 app.py --host 0.0.0.0` — mas lembre que o app não
tem senha, então faça isso só em rede confiável.
