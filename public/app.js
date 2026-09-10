/* Minhas Finanças — interface (JavaScript puro, sem framework) */

import * as dados from "./dados.js";
import {
  anosDisponiveis, dataBR, evolucaoMensal, filtrar, hojeISO, mesDe, mesesDisponiveis,
  moeda, paraCentavos, paraCsv, porConta, rotuloMes, totalizar,
} from "./calculos.js";

const estado = {
  sessao: null,
  mes: null,
  meses: [],
  anos: [],
  pastas: [],
  contas: [],
  lancamentos: [],
  pastaId: null,
  aba: "visao",
  filtros: { busca: "", conta: "", de: "", ate: "" },
  relatorio: { escopo: "pasta", ano: new Date().getFullYear() },
};

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const $ = (sel) => document.querySelector(sel);

function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

const ICONES_PASTA = { corretor: "🧑‍💼", barbearia: "💈", casa: "🏡", folder: "📁" };
const iconePasta = (pasta) => ICONES_PASTA[pasta.icone] || pasta.icone || "📁";

const PALAVRAS_ICONE = [
  [/combust|gasolin|posto/i, "⛽"], [/marketing|anunc|public/i, "📢"],
  [/aliment|mercado|comida|restaur/i, "🍽️"], [/internet|telefon|celular/i, "📶"],
  [/aluguel|moradia|condom/i, "🏠"], [/energia|luz|agua|água/i, "⚡"],
  [/transport|uber|carro|onibus/i, "🚗"], [/salario|salário|pagamento/i, "💵"],
  [/comiss/i, "🤝"], [/servico|serviço|corte|barba/i, "✂️"],
  [/produto|pomada|estoque/i, "📦"], [/bonus|bônus|extra/i, "🎁"],
  [/imposto|taxa|tarifa/i, "🧾"], [/saude|saúde|farmac/i, "💊"],
  [/educa|escola|curso/i, "🎓"], [/lazer|viagem/i, "🎉"],
];

function iconeConta(nome, tipo) {
  for (const [re, ic] of PALAVRAS_ICONE) if (re.test(nome || "")) return ic;
  return tipo === "receita" ? "💰" : "💳";
}

function aviso(texto, tipo = "ok") {
  const div = document.createElement("div");
  div.className = `aviso ${tipo}`;
  div.textContent = texto;
  $("#avisos").appendChild(div);
  setTimeout(() => div.remove(), 4600);
}

const pastaAtual = () => estado.pastas.find((p) => p.id === estado.pastaId) || estado.pastas[0];

/** Lançamentos de uma pasta no mês selecionado. */
const doMes = (pastaId) => filtrar(estado.lancamentos, { pastaId, mes: estado.mes });

function contasDaPasta(pastaId, tipo, somenteAtivas = false) {
  return estado.contas.filter((c) =>
    c.pasta_id === pastaId && (!tipo || c.tipo === tipo) && (!somenteAtivas || c.ativo));
}

/* ------------------------------------------------------------------ */
/* Entrada no app                                                      */
/* ------------------------------------------------------------------ */

async function iniciar() {
  if (!dados.configurado()) return telaConfiguracao();

  const sessao = await dados.sessaoAtual();
  estado.sessao = sessao;
  if (sessao) await entrou();
  else telaLogin();

  dados.aoMudarAutenticacao(async (nova) => {
    const antes = estado.sessao?.user?.id ?? null;
    const agora = nova?.user?.id ?? null;
    if (antes === agora) return; // só renovação de token, não troca de usuário
    estado.sessao = nova;
    if (agora) await entrou();
    else telaLogin();
  });
}

async function entrou() {
  document.body.classList.remove("sem-sessao");
  try {
    await dados.prepararContaNova();
    await recarregar();
  } catch (erro) {
    aviso(erro.message, "erro");
  }
}

async function recarregar() {
  const { pastas, contas, lancamentos } = await dados.carregarTudo();
  estado.pastas = pastas;
  estado.contas = contas;
  estado.lancamentos = lancamentos;
  estado.meses = mesesDisponiveis(lancamentos);
  estado.anos = anosDisponiveis(lancamentos);

  if (!estado.mes || !estado.meses.some((m) => m.valor === estado.mes)) {
    estado.mes = estado.meses[0].valor;
  }
  if (!estado.anos.includes(estado.relatorio.ano)) estado.relatorio.ano = estado.anos[0];
  if (!estado.pastas.some((p) => p.id === estado.pastaId)) {
    estado.pastaId = estado.pastas[0]?.id ?? null;
  }
  desenhar();
}

/* ------------------------------------------------------------------ */
/* Telas de configuração e login                                       */
/* ------------------------------------------------------------------ */

function limparMoldura() {
  $("#abas-pastas").innerHTML = "";
  $("#menu").innerHTML = "";
  $("#resumo-geral").innerHTML = "";
  $("#aviso-armazenamento").innerHTML = "";
}

function telaConfiguracao() {
  document.body.classList.add("sem-sessao");
  limparMoldura();
  $("#conteudo").innerHTML = `
    <div class="box">
      <header><h4>Falta ligar o app ao seu Supabase</h4></header>
      <ol class="passos">
        <li>No painel do Supabase, abra <b>Project Settings → Data API</b>.</li>
        <li>Copie o <b>Project URL</b> e a chave <b>anon public</b>.</li>
        <li>No projeto, edite o arquivo <code>public/config.js</code> e cole os dois valores.</li>
        <li>No SQL Editor do Supabase, execute o arquivo <code>supabase/schema.sql</code>.</li>
        <li>Publique de novo na Vercel.</li>
      </ol>
      <p class="nota">A chave <b>anon</b> é feita para ficar visível no navegador — quem
      protege os dados é o login e o RLS do banco. Nunca use aqui a chave
      <code>service_role</code>.</p>
    </div>`;
}

function telaLogin() {
  document.body.classList.add("sem-sessao");
  limparMoldura();
  $("#conteudo").innerHTML = `
    <div class="box caixa-login">
      <header><h4>Entrar</h4></header>
      <form id="form-login">
        <div class="campo">
          <label for="login-email">E-mail</label>
          <input id="login-email" name="email" type="email" required autocomplete="email">
        </div>
        <div class="campo">
          <label for="login-senha">Senha</label>
          <input id="login-senha" name="senha" type="password" required minlength="6"
                 autocomplete="current-password">
        </div>
        <div class="acoes-login">
          <button type="submit" class="btn entrada" data-acao="entrar">Entrar</button>
          <button type="submit" class="btn claro" data-acao="cadastrar">Criar conta</button>
        </div>
        <p class="nota">Seus lançamentos ficam visíveis só para quem entrar com este e-mail.</p>
      </form>
    </div>`;
  $("#login-email").focus();
}

/* ------------------------------------------------------------------ */
/* Desenho da tela                                                     */
/* ------------------------------------------------------------------ */

function desenhar() {
  desenharCabecalho();
  desenharSeletorMes();
  desenharAbasPastas();
  desenharMenu();
  desenharConteudo();
  desenharResumoGeral();
}

function desenharCabecalho() {
  const email = estado.sessao?.user?.email ?? "";
  $("#usuario").innerHTML = email
    ? `<span class="email" title="${esc(email)}">${esc(email)}</span>
       <button class="btn claro mini" id="btn-sair">Sair</button>`
    : "";
}

function desenharSeletorMes() {
  $("#filtro-mes").innerHTML = estado.meses
    .map((m) => `<option value="${m.valor}" ${m.valor === estado.mes ? "selected" : ""}>${esc(m.rotulo)}</option>`)
    .join("");
}

function desenharAbasPastas() {
  $("#abas-pastas").innerHTML = estado.pastas.map((p) => `
    <button class="pasta-card ${p.id === estado.pastaId ? "ativa" : ""}"
            style="--cor:${esc(p.cor)}" data-pasta="${p.id}">
      <span class="icone">${iconePasta(p)}</span>
      <span>
        <h3>${esc(p.nome)}</h3>
        <small>${esc(p.subtitulo || "")}</small>
      </span>
      <span class="seta">›</span>
    </button>`).join("");
}

function desenharMenu() {
  const pasta = pastaAtual();
  if (!pasta) { $("#menu").innerHTML = ""; return; }
  const itens = [
    ["visao", "🏠", "Visão Geral"],
    ["entradas", "💰", "Entradas"],
    ["despesas", "💳", "Despesas"],
    ["relatorios", "📊", "Relatórios"],
    ["contas", "⚙️", "Plano de Contas"],
  ];
  $("#menu").innerHTML = `
    <div class="titulo-pasta" style="--cor:${esc(pasta.cor)}">
      <span>${iconePasta(pasta)}</span> ${esc(pasta.nome)}
    </div>
    ${itens.map(([id, ic, rot]) => `
      <button class="${estado.aba === id ? "ativo" : ""}" style="--cor:${esc(pasta.cor)}" data-aba="${id}">
        <span>${ic}</span> ${rot}
      </button>`).join("")}
    <button data-editar-pasta="${pasta.id}" style="--cor:${esc(pasta.cor)}">
      <span>✏️</span> Editar pasta
    </button>`;
}

function desenharConteudo() {
  const alvo = $("#conteudo");
  if (!pastaAtual()) {
    alvo.innerHTML = `<div class="box"><p class="vazio">Cadastre uma pasta para começar.</p></div>`;
    return;
  }
  const telas = {
    visao: telaVisao,
    entradas: () => telaLancamentos("receita"),
    despesas: () => telaLancamentos("despesa"),
    contas: telaPlanoDeContas,
    relatorios: telaRelatorios,
  };
  alvo.innerHTML = telas[estado.aba]();
  if (estado.aba === "entradas") desenharLista("receita");
  if (estado.aba === "despesas") desenharLista("despesa");
  if (estado.aba === "relatorios") desenharRelatorios();
}

/* ---------------------------- Visão geral --------------------------- */

function telaVisao() {
  const pasta = pastaAtual();
  const doPeriodo = doMes(pasta.id);
  const t = totalizar(doPeriodo);
  const cat = porConta(doPeriodo, "despesa");
  const ultimos = doPeriodo.slice(0, 6);

  return `
    <div class="grade-kpi">
      ${cartaoKpi("entrada", "↗", "Entradas", t.receitas, "pos")}
      ${cartaoKpi("saida", "↘", "Despesas", t.despesas, "neg")}
      ${cartaoKpi("saldo", "👛", "Saldo do Mês", t.saldo, t.saldo >= 0 ? "pos" : "neg")}
    </div>
    <div class="colunas">
      <div class="box">
        <header><h4>Despesas por Categoria</h4></header>
        ${rosca(cat)}
      </div>
      <div class="box">
        <header><h4>Lançar Entrada / Despesa</h4></header>
        <div class="acoes-rapidas">
          <button class="btn grande entrada" data-novo="receita">
            <span>＋ Registrar Entrada</span>
            <small>Receitas do plano de contas</small>
          </button>
          <button class="btn grande saida" data-novo="despesa">
            <span>－ Registrar Despesa</span>
            <small>Despesas do plano de contas</small>
          </button>
        </div>
      </div>
      <div class="box">
        <header>
          <h4>Últimos Lançamentos</h4>
          <button class="link" data-aba="despesas">Ver todos</button>
        </header>
        ${listaLancamentos(ultimos)}
      </div>
    </div>`;
}

function cartaoKpi(classe, icone, rotulo, valor, cor) {
  return `
    <div class="kpi">
      <div class="bolha ${classe}">${icone}</div>
      <div>
        <small>${esc(rotulo)}</small>
        <strong class="${cor}">${moeda(valor)}</strong>
      </div>
    </div>`;
}

function listaLancamentos(itens) {
  if (!itens.length) return `<p class="vazio">Nenhum lançamento neste mês.</p>`;
  return `<div class="lista">${itens.map((l) => `
    <div class="linha">
      <div class="ic" style="background:${esc(l.conta_cor)}22">${iconeConta(l.conta_nome, l.tipo)}</div>
      <div class="desc">
        <b>${esc(l.descricao || l.conta_nome)}</b>
        <small>${dataBR(l.data)} · ${esc(l.conta_nome)}</small>
      </div>
      <div class="vl ${l.tipo === "receita" ? "pos" : "neg"}">
        ${l.tipo === "receita" ? "+" : "-"} ${moeda(l.valor_centavos)}
      </div>
    </div>`).join("")}</div>`;
}

function rosca(cat) {
  if (!cat.total) return `<p class="vazio">Sem lançamentos deste tipo no mês.</p>`;
  const raio = 54;
  const circ = 2 * Math.PI * raio;
  let acumulado = 0;
  const fatias = cat.itens.map((it) => {
    const fracao = it.total / cat.total;
    const svg = `<circle cx="70" cy="70" r="${raio}" fill="none" stroke="${esc(it.cor)}"
        stroke-width="22" stroke-dasharray="${(fracao * circ).toFixed(2)} ${circ.toFixed(2)}"
        stroke-dashoffset="${(-acumulado * circ).toFixed(2)}"
        transform="rotate(-90 70 70)"><title>${esc(it.nome)}: ${moeda(it.total)}</title></circle>`;
    acumulado += fracao;
    return svg;
  }).join("");
  return `
    <div class="rosca">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="${raio}" fill="none" stroke="#1e2a3d" stroke-width="22"></circle>
        ${fatias}
        <g class="centro">
          <text class="rot" x="70" y="64">Total de ${cat.tipo === "receita" ? "Entradas" : "Despesas"}</text>
          <text class="val" x="70" y="82">${moeda(cat.total)}</text>
        </g>
      </svg>
      <div class="legenda">
        ${cat.itens.slice(0, 8).map((it) => `
          <div class="item">
            <span class="ponto" style="background:${esc(it.cor)}"></span>
            <span class="nome">${esc(it.nome)}</span>
            <span class="valor">${moeda(it.total)}</span>
            <span class="pct">${it.percentual.toFixed(1)}%</span>
          </div>`).join("")}
      </div>
    </div>`;
}

/* --------------------------- Lançamentos ---------------------------- */

function telaLancamentos(tipo) {
  const pasta = pastaAtual();
  const contas = contasDaPasta(pasta.id, tipo);
  const rotulo = tipo === "receita" ? "Entradas" : "Despesas";
  return `
    <div class="box">
      <header>
        <h4>${rotulo} — ${esc(pasta.nome)}</h4>
        <div style="display:flex;gap:8px">
          <button class="btn mini claro" data-exportar="${tipo}">⬇ Exportar CSV</button>
          <button class="btn mini ${tipo === "receita" ? "entrada" : "saida"}" data-novo="${tipo}">
            ＋ Novo lançamento
          </button>
        </div>
      </header>
      <div class="filtros">
        <div class="campo">
          <label>Buscar</label>
          <input id="f-busca" placeholder="Descrição, conta ou observação" value="${esc(estado.filtros.busca)}">
        </div>
        <div class="campo">
          <label>Conta</label>
          <select id="f-conta">
            <option value="">Todas</option>
            ${contas.map((c) => `<option value="${c.id}" ${String(estado.filtros.conta) === String(c.id) ? "selected" : ""}>
              ${esc(c.codigo ? `${c.codigo} — ` : "")}${esc(c.nome)}</option>`).join("")}
          </select>
        </div>
        <div class="campo curto">
          <label>De</label><input type="date" id="f-de" value="${esc(estado.filtros.de)}">
        </div>
        <div class="campo curto">
          <label>Até</label><input type="date" id="f-ate" value="${esc(estado.filtros.ate)}">
        </div>
        <button class="btn claro" id="f-limpar">Limpar</button>
      </div>
    </div>
    <div class="box" id="area-lista"></div>`;
}

function lancamentosFiltrados(tipo) {
  const f = estado.filtros;
  return filtrar(estado.lancamentos, {
    pastaId: estado.pastaId,
    tipo,
    mes: estado.mes,
    contaId: f.conta || null,
    busca: f.busca,
    de: f.de,
    ate: f.ate,
  });
}

function desenharLista(tipo) {
  const area = $("#area-lista");
  if (!area) return;
  const itens = lancamentosFiltrados(tipo);
  const t = totalizar(itens);
  const total = tipo === "receita" ? t.receitas : t.despesas;

  area.innerHTML = `
    <header>
      <h4>${itens.length} lançamento(s)</h4>
      <strong class="${tipo === "receita" ? "pos" : "neg"}">${moeda(total)}</strong>
    </header>
    ${itens.length ? `
    <div class="tabela-rolagem"><table class="tabela-cartoes">
      <thead><tr>
        <th>Data</th><th>Descrição</th><th>Conta (plano de contas)</th>
        <th class="num">Valor</th><th class="num">Ações</th>
      </tr></thead>
      <tbody>${itens.map((l) => `
        <tr>
          <td data-rotulo="Data">${dataBR(l.data)}</td>
          <td data-rotulo="Descrição">${esc(l.descricao)}${l.observacao ? `<br><small style="color:var(--texto-3)">${esc(l.observacao)}</small>` : ""}</td>
          <td data-rotulo="Conta"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${esc(l.conta_cor)};margin-right:7px"></span>
              ${esc(l.conta_codigo ? `${l.conta_codigo} — ` : "")}${esc(l.conta_nome)}</td>
          <td class="num ${l.tipo === "receita" ? "pos" : "neg"}" data-rotulo="Valor">${moeda(l.valor_centavos)}</td>
          <td class="num acoes">
            <button class="btn mini claro" data-editar-lanc="${l.id}">Editar</button>
            <button class="btn mini perigo" data-excluir-lanc="${l.id}">Excluir</button>
          </td>
        </tr>`).join("")}</tbody>
    </table></div>` : `<p class="vazio">Nenhum lançamento encontrado com esses filtros.</p>`}`;
}

/* ------------------------- Plano de contas -------------------------- */

function telaPlanoDeContas() {
  const pasta = pastaAtual();
  const tabela = (tipo, titulo) => {
    const linhas = contasDaPasta(pasta.id, tipo);
    return `
      <div class="box">
        <header>
          <h4>${titulo}</h4>
          <button class="btn mini ${tipo === "receita" ? "entrada" : "saida"}" data-nova-conta="${tipo}">＋ Nova conta</button>
        </header>
        ${linhas.length ? `
        <div class="tabela-rolagem"><table class="tabela-cartoes">
          <thead><tr><th>Código</th><th>Nome</th><th>Situação</th><th class="num">Lançamentos</th><th class="num">Ações</th></tr></thead>
          <tbody>${linhas.map((c) => `
            <tr>
              <td data-rotulo="Código">${esc(c.codigo || "—")}</td>
              <td data-rotulo="Conta"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${esc(c.cor)};margin-right:7px"></span>
                  ${esc(c.nome)}</td>
              <td data-rotulo="Situação"><span class="tag ${c.ativo ? "ativa" : "inativa"}">${c.ativo ? "Ativa" : "Inativa"}</span></td>
              <td class="num" data-rotulo="Lançamentos">${c.usos}</td>
              <td class="num acoes">
                <button class="btn mini claro" data-editar-conta="${c.id}">Editar</button>
                <button class="btn mini perigo" data-excluir-conta="${c.id}">Excluir</button>
              </td>
            </tr>`).join("")}</tbody>
        </table></div>` : `<p class="vazio">Nenhuma conta cadastrada.</p>`}
      </div>`;
  };
  return `
    <div class="box">
      <header><h4>Plano de Contas — ${esc(pasta.nome)}</h4></header>
      <p style="color:var(--texto-2);margin:0">
        Todo lançamento é vinculado a uma conta deste plano. Contas com lançamentos não podem ser
        excluídas — desative-as para tirá-las das listas sem perder o histórico.
      </p>
    </div>
    ${tabela("receita", "Contas de Receita")}
    ${tabela("despesa", "Contas de Despesa")}`;
}

/* ---------------------------- Relatórios ---------------------------- */

function telaRelatorios() {
  const pasta = pastaAtual();
  return `
    <div class="box">
      <header><h4>Relatórios</h4>
        <button class="btn mini claro" data-exportar="todos">⬇ Exportar extrato (CSV)</button>
      </header>
      <div class="filtros">
        <div class="campo">
          <label>Pasta analisada</label>
          <select id="r-escopo">
            <option value="pasta" ${estado.relatorio.escopo === "pasta" ? "selected" : ""}>${esc(pasta.nome)}</option>
            <option value="todas" ${estado.relatorio.escopo === "todas" ? "selected" : ""}>Todas as pastas</option>
          </select>
        </div>
        <div class="campo curto">
          <label>Ano</label>
          <select id="r-ano">
            ${estado.anos.map((a) => `<option ${a === estado.relatorio.ano ? "selected" : ""}>${a}</option>`).join("")}
          </select>
        </div>
        <div class="campo">
          <label>Mês de referência</label>
          <select id="r-mes">
            ${estado.meses.map((m) => `<option value="${m.valor}" ${m.valor === estado.mes ? "selected" : ""}>${esc(m.rotulo)}</option>`).join("")}
          </select>
        </div>
      </div>
    </div>
    <div id="r-comparativo" class="box"></div>
    <div id="r-mensal" class="box"></div>
    <div class="colunas-2">
      <div id="r-despesas" class="box"></div>
      <div id="r-receitas" class="box"></div>
    </div>`;
}

function desenharRelatorios() {
  const escopoPasta = estado.relatorio.escopo === "pasta" ? estado.pastaId : null;
  const doMesTodo = filtrar(estado.lancamentos, { mes: estado.mes });
  const doEscopo = filtrar(estado.lancamentos, { pastaId: escopoPasta, mes: estado.mes });

  const porPasta = estado.pastas.map((p) => {
    const t = totalizar(doMesTodo.filter((l) => l.pasta_id === p.id));
    return { ...p, ...t };
  });
  const totalDespesas = porPasta.reduce((s, p) => s + p.despesas, 0);
  for (const p of porPasta) {
    p.participacao = totalDespesas ? Math.round((p.despesas * 1000) / totalDespesas) / 10 : 0;
  }
  const geral = totalizar(doMesTodo);

  $("#r-comparativo").innerHTML = `
    <header><h4>Comparativo entre pastas — ${esc(rotuloMes(estado.mes))}</h4></header>
    <div class="tabela-rolagem"><table>
      <thead><tr><th>Pasta</th><th class="num">Entradas</th><th class="num">Despesas</th>
        <th class="num">Saldo</th><th class="num">% das despesas</th></tr></thead>
      <tbody>${porPasta.map((p) => `
        <tr>
          <td>${iconePasta(p)} ${esc(p.nome)}</td>
          <td class="num pos">${moeda(p.receitas)}</td>
          <td class="num neg">${moeda(p.despesas)}</td>
          <td class="num ${p.saldo >= 0 ? "pos" : "neg"}"><b>${moeda(p.saldo)}</b></td>
          <td class="num">${p.participacao.toFixed(1)}%</td>
        </tr>`).join("")}
        <tr style="background:var(--card-2)">
          <td><b>Total geral</b></td>
          <td class="num pos"><b>${moeda(geral.receitas)}</b></td>
          <td class="num neg"><b>${moeda(geral.despesas)}</b></td>
          <td class="num ${geral.saldo >= 0 ? "pos" : "neg"}"><b>${moeda(geral.saldo)}</b></td>
          <td class="num">100%</td>
        </tr></tbody>
    </table></div>`;

  const doAno = filtrar(estado.lancamentos, { pastaId: escopoPasta });
  const mensal = evolucaoMensal(doAno, estado.relatorio.ano);
  const teto = Math.max(1, ...mensal.meses.map((m) => Math.max(m.receitas, m.despesas)));

  $("#r-mensal").innerHTML = `
    <header>
      <h4>Evolução mensal — ${mensal.ano}</h4>
      <div class="legenda-inline">
        <span><i style="background:#22c55e"></i>Entradas</span>
        <span><i style="background:#ef4444"></i>Despesas</span>
      </div>
    </header>
    <div class="barras">
      ${mensal.meses.map((m) => `
        <div class="mes" title="${esc(m.rotulo)}: entradas ${moeda(m.receitas)} · despesas ${moeda(m.despesas)} · saldo ${moeda(m.saldo)}">
          <div class="par">
            <div class="b r" style="height:${(m.receitas / teto * 100).toFixed(1)}%"></div>
            <div class="b d" style="height:${(m.despesas / teto * 100).toFixed(1)}%"></div>
          </div>
          <span class="rot">${esc(m.rotulo)}</span>
        </div>`).join("")}
    </div>
    <div class="tabela-rolagem" style="margin-top:14px"><table>
      <thead><tr><th>Mês</th><th class="num">Entradas</th><th class="num">Despesas</th><th class="num">Saldo</th></tr></thead>
      <tbody>${mensal.meses.filter((m) => m.receitas || m.despesas).map((m) => `
        <tr><td>${esc(m.rotulo)}</td>
          <td class="num pos">${moeda(m.receitas)}</td>
          <td class="num neg">${moeda(m.despesas)}</td>
          <td class="num ${m.saldo >= 0 ? "pos" : "neg"}">${moeda(m.saldo)}</td></tr>`).join("")
        || `<tr><td colspan="4" class="vazio">Sem lançamentos em ${mensal.ano}.</td></tr>`}
      </tbody></table></div>`;

  const desp = porConta(doEscopo, "despesa");
  const rec = porConta(doEscopo, "receita");
  $("#r-despesas").innerHTML =
    `<header><h4>Despesas por conta</h4></header>${rosca(desp)}${tabelaCategorias(desp)}`;
  $("#r-receitas").innerHTML =
    `<header><h4>Entradas por conta</h4></header>${rosca(rec)}${tabelaCategorias(rec)}`;
}

function tabelaCategorias(cat) {
  if (!cat.total) return "";
  return `<div class="tabela-rolagem" style="margin-top:14px"><table>
    <thead><tr><th>Conta</th><th class="num">Total</th><th class="num">%</th></tr></thead>
    <tbody>${cat.itens.map((i) => `<tr>
      <td>${esc(i.codigo ? `${i.codigo} — ` : "")}${esc(i.nome)}</td>
      <td class="num">${moeda(i.total)}</td>
      <td class="num">${i.percentual.toFixed(1)}%</td></tr>`).join("")}</tbody></table></div>`;
}

/* --------------------------- Resumo geral --------------------------- */

function desenharResumoGeral() {
  const g = totalizar(filtrar(estado.lancamentos, { mes: estado.mes }));
  $("#resumo-geral").innerHTML = `
    <div class="titulo">
      <span style="font-size:24px">📊</span>
      <div><b>Resumo do Mês (Todas as Pastas)</b><small>${esc(rotuloMes(estado.mes))}</small></div>
    </div>
    <div class="bloco"><small>Total de Entradas</small><strong class="pos">${moeda(g.receitas)}</strong></div>
    <div class="bloco"><small>Total de Despesas</small><strong class="neg">${moeda(g.despesas)}</strong></div>
    <div class="bloco"><small>Saldo Geral</small><strong class="${g.saldo >= 0 ? "pos" : "neg"}">${moeda(g.saldo)}</strong></div>`;
}

/* ------------------------------------------------------------------ */
/* Modais                                                              */
/* ------------------------------------------------------------------ */

function abrirModal(titulo, corpoHtml, aoSalvar, rotuloBotao = "Salvar") {
  $("#modal").innerHTML = `
    <div class="modal-fundo" data-fundo>
      <div class="modal" role="dialog" aria-modal="true">
        <header><h3>${esc(titulo)}</h3><button class="fechar" data-fechar>×</button></header>
        <form id="form-modal"><div class="corpo">${corpoHtml}</div>
          <footer>
            <button type="button" class="btn claro" data-fechar>Cancelar</button>
            <button type="submit" class="btn entrada">${esc(rotuloBotao)}</button>
          </footer>
        </form>
      </div>
    </div>`;
  const form = $("#form-modal");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    try {
      await aoSalvar(Object.fromEntries(new FormData(form)));
      fecharModal();
    } catch (erro) {
      aviso(erro.message, "erro");
      botao.disabled = false;
    }
  });
  form.querySelector("input, select, textarea")?.focus();
}

const fecharModal = () => { $("#modal").innerHTML = ""; };

function modalLancamento(tipo, lanc = null) {
  const pasta = pastaAtual();
  const contas = contasDaPasta(pasta.id, tipo, true);
  if (!contas.length) {
    aviso(`Cadastre ao menos uma conta de ${tipo} no plano de contas antes de lançar.`, "erro");
    estado.aba = "contas";
    desenhar();
    return;
  }
  const titulo = (lanc ? "Editar " : "Registrar ") + (tipo === "receita" ? "entrada" : "despesa");
  abrirModal(titulo, `
    <div class="linha-campos">
      <div class="campo curto">
        <label>Data</label>
        <input type="date" name="data" required value="${esc(lanc?.data || hojeISO())}">
      </div>
      <div class="campo">
        <label>Valor (R$)</label>
        <input name="valor" required inputmode="decimal" placeholder="0,00"
               value="${lanc ? (lanc.valor_centavos / 100).toFixed(2).replace(".", ",") : ""}">
      </div>
    </div>
    <div class="campo">
      <label>Conta do plano de contas</label>
      <select name="conta_id" required>
        ${contas.map((c) => `<option value="${c.id}" ${lanc?.conta_id === c.id ? "selected" : ""}>
          ${esc(c.codigo ? `${c.codigo} — ` : "")}${esc(c.nome)}</option>`).join("")}
      </select>
    </div>
    <div class="campo">
      <label>Descrição</label>
      <input name="descricao" maxlength="160" placeholder="Ex.: Comissão de venda do apto 302"
             value="${esc(lanc?.descricao || "")}">
    </div>
    <div class="campo">
      <label>Observação (opcional)</label>
      <textarea name="observacao" maxlength="500">${esc(lanc?.observacao || "")}</textarea>
    </div>`,
    async (form) => {
      const conta = estado.contas.find((c) => c.id === Number(form.conta_id));
      await dados.salvarLancamento({
        conta_id: form.conta_id,
        data: form.data,
        descricao: form.descricao?.trim() || conta?.nome || "",
        observacao: form.observacao,
        valor_centavos: paraCentavos(form.valor),
      }, lanc?.id);
      aviso(lanc ? "Lançamento atualizado." : "Lançamento registrado.");
      await recarregar();
    });
}

function modalConta(tipo, conta = null) {
  const pasta = pastaAtual();
  abrirModal(conta ? "Editar conta" : "Nova conta do plano de contas", `
    <div class="linha-campos">
      <div class="campo curto">
        <label>Código</label>
        <input name="codigo" maxlength="20" placeholder="2.05" value="${esc(conta?.codigo || "")}">
      </div>
      <div class="campo">
        <label>Nome da conta</label>
        <input name="nome" required maxlength="120" placeholder="Ex.: Manutenção" value="${esc(conta?.nome || "")}">
      </div>
    </div>
    <div class="linha-campos">
      <div class="campo">
        <label>Tipo</label>
        <select name="tipo">
          <option value="receita" ${(conta?.tipo || tipo) === "receita" ? "selected" : ""}>Receita (entrada)</option>
          <option value="despesa" ${(conta?.tipo || tipo) === "despesa" ? "selected" : ""}>Despesa (saída)</option>
        </select>
      </div>
      <div class="campo">
        <label>Pasta</label>
        <select name="pasta_id">
          ${estado.pastas.map((p) => `<option value="${p.id}" ${(conta ? conta.pasta_id : pasta.id) === p.id ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}
        </select>
      </div>
      <div class="campo curto">
        <label>Cor</label>
        <input type="color" name="cor" value="${esc(conta?.cor || "#3b82f6")}">
      </div>
    </div>
    <div class="campo">
      <label>Situação</label>
      <select name="ativo">
        <option value="1" ${!conta || conta.ativo ? "selected" : ""}>Ativa</option>
        <option value="0" ${conta && !conta.ativo ? "selected" : ""}>Inativa (não aparece nos lançamentos)</option>
      </select>
    </div>`,
    async (form) => {
      await dados.salvarConta({ ...form, ativo: form.ativo === "1" }, conta?.id);
      aviso(conta ? "Conta atualizada." : "Conta criada.");
      await recarregar();
    });
}

function modalPasta(pasta = null) {
  abrirModal(pasta ? "Editar pasta" : "Nova pasta", `
    <div class="campo">
      <label>Nome</label>
      <input name="nome" required maxlength="120" value="${esc(pasta?.nome || "")}" placeholder="Ex.: Aluguéis">
    </div>
    <div class="campo">
      <label>Subtítulo</label>
      <input name="subtitulo" maxlength="160" value="${esc(pasta?.subtitulo || "")}" placeholder="Entradas • Despesas • Lucro">
    </div>
    <div class="linha-campos">
      <div class="campo">
        <label>Ícone</label>
        <select name="icone">
          ${Object.entries(ICONES_PASTA).map(([k, v]) => `<option value="${k}" ${pasta?.icone === k ? "selected" : ""}>${v} ${k}</option>`).join("")}
        </select>
      </div>
      <div class="campo curto">
        <label>Cor</label>
        <input type="color" name="cor" value="${esc(pasta?.cor || "#3b82f6")}">
      </div>
      <div class="campo curto">
        <label>Ordem</label>
        <input type="number" name="ordem" min="1" max="99" value="${pasta?.ordem ?? 99}">
      </div>
    </div>
    ${pasta ? `<button type="button" class="btn perigo" data-excluir-pasta="${pasta.id}">Excluir esta pasta</button>` : ""}`,
    async (form) => {
      await dados.salvarPasta(form, pasta?.id);
      aviso(pasta ? "Pasta atualizada." : "Pasta criada.");
      await recarregar();
    });
}

/* ------------------------------------------------------------------ */
/* Exportação                                                          */
/* ------------------------------------------------------------------ */

function baixarCsv(itens, nome) {
  if (!itens.length) return aviso("Não há lançamentos para exportar.", "erro");
  const url = URL.createObjectURL(new Blob([paraCsv(itens)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

document.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "form-login") return;
  ev.preventDefault();
  const form = ev.target;
  const acao = ev.submitter?.dataset.acao ?? "entrar";
  const email = form.email.value.trim();
  const senha = form.senha.value;
  for (const b of form.querySelectorAll("button")) b.disabled = true;
  try {
    if (acao === "cadastrar") {
      const comSessao = await dados.cadastrar(email, senha);
      if (!comSessao) {
        aviso("Conta criada. Confirme o e-mail que o Supabase enviou e depois entre.");
        for (const b of form.querySelectorAll("button")) b.disabled = false;
        return;
      }
    } else {
      await dados.entrar(email, senha);
    }
  } catch (erro) {
    aviso(erro.message, "erro");
    for (const b of form.querySelectorAll("button")) b.disabled = false;
  }
});

document.addEventListener("click", async (ev) => {
  const alvo = ev.target.closest(
    "[data-pasta],[data-aba],[data-novo],[data-nova-conta],[data-editar-conta]," +
    "[data-excluir-conta],[data-editar-lanc],[data-excluir-lanc],[data-editar-pasta]," +
    "[data-excluir-pasta],[data-fechar],[data-fundo],[data-exportar],#f-limpar," +
    "#btn-nova-pasta,#btn-sair");
  if (!alvo) return;
  const d = alvo.dataset;

  if (alvo.id === "btn-sair") return dados.sair();
  if (alvo.id === "btn-nova-pasta") return modalPasta();
  if (alvo.id === "f-limpar") {
    estado.filtros = { busca: "", conta: "", de: "", ate: "" };
    return desenharConteudo();
  }
  if (d.fundo !== undefined && ev.target !== alvo) return;
  if (d.fechar !== undefined || d.fundo !== undefined) return fecharModal();

  if (d.pasta) {
    estado.pastaId = Number(d.pasta);
    estado.filtros = { busca: "", conta: "", de: "", ate: "" };
    return desenhar();
  }
  if (d.aba) { estado.aba = d.aba; return desenhar(); }
  if (d.novo) return modalLancamento(d.novo);
  if (d.novaConta) return modalConta(d.novaConta);
  if (d.editarPasta) return modalPasta(estado.pastas.find((p) => p.id === Number(d.editarPasta)));

  if (d.excluirPasta) {
    if (!confirm("Excluir esta pasta? As contas do plano de contas dela também serão removidas.")) return;
    try {
      await dados.excluirPasta(Number(d.excluirPasta));
      fecharModal();
      aviso("Pasta excluída.");
      await recarregar();
    } catch (erro) { aviso(erro.message, "erro"); }
    return;
  }
  if (d.editarConta) {
    const conta = estado.contas.find((c) => c.id === Number(d.editarConta));
    return modalConta(conta.tipo, conta);
  }
  if (d.excluirConta) {
    const conta = estado.contas.find((c) => c.id === Number(d.excluirConta));
    if (!confirm(`Excluir a conta "${conta.nome}" do plano de contas?`)) return;
    try {
      await dados.excluirConta(conta.id);
      aviso("Conta excluída.");
      await recarregar();
    } catch (erro) { aviso(erro.message, "erro"); }
    return;
  }
  if (d.editarLanc) {
    const lanc = estado.lancamentos.find((l) => l.id === Number(d.editarLanc));
    if (lanc) return modalLancamento(lanc.tipo, lanc);
  }
  if (d.excluirLanc) {
    if (!confirm("Excluir este lançamento?")) return;
    try {
      await dados.excluirLancamento(Number(d.excluirLanc));
      aviso("Lançamento excluído.");
      await recarregar();
    } catch (erro) { aviso(erro.message, "erro"); }
    return;
  }
  if (d.exportar) {
    if (d.exportar === "todos") {
      const escopo = estado.relatorio.escopo === "pasta" ? estado.pastaId : null;
      baixarCsv(filtrar(estado.lancamentos, { pastaId: escopo, mes: estado.mes }), "extrato.csv");
    } else {
      baixarCsv(lancamentosFiltrados(d.exportar), `extrato-${d.exportar}s.csv`);
    }
  }
});

document.addEventListener("change", (ev) => {
  const id = ev.target.id;
  if (id === "filtro-mes" || id === "r-mes") {
    estado.mes = ev.target.value;
    return desenhar();
  }
  if (id === "r-ano") {
    estado.relatorio.ano = Number(ev.target.value);
    return desenharRelatorios();
  }
  if (id === "r-escopo") {
    estado.relatorio.escopo = ev.target.value;
    return desenharRelatorios();
  }
  if (["f-busca", "f-conta", "f-de", "f-ate"].includes(id)) {
    estado.filtros = {
      busca: $("#f-busca").value.trim(),
      conta: $("#f-conta").value,
      de: $("#f-de").value,
      ate: $("#f-ate").value,
    };
    return desenharLista(estado.aba === "entradas" ? "receita" : "despesa");
  }
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") fecharModal();
});

let temporizadorBusca;
document.addEventListener("input", (ev) => {
  if (ev.target.id !== "f-busca") return;
  clearTimeout(temporizadorBusca);
  temporizadorBusca = setTimeout(
    () => ev.target.dispatchEvent(new Event("change", { bubbles: true })), 300);
});

iniciar().catch((erro) => aviso(erro.message, "erro"));
