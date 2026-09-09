/* Minhas Financas - interface (JavaScript puro, sem dependencias) */

const estado = {
  mes: null,
  meses: [],
  anos: [],
  pastas: [],
  pastaId: null,
  aba: "visao",
  painel: null,
  contas: [],
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

function moeda(centavos) {
  return "R$ " + (Number(centavos || 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function dataBR(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ICONES_PASTA = { corretor: "🧑‍💼", barbearia: "💈", casa: "🏡", folder: "📁" };

function iconePasta(pasta) {
  return ICONES_PASTA[pasta.icone] || pasta.icone || "📁";
}

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
  setTimeout(() => div.remove(), 4200);
}

async function chamar(url, opcoes = {}) {
  const resposta = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opcoes,
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || "Falha na comunicacao com o servidor.");
  return dados;
}

function pastaAtual() {
  return estado.pastas.find((p) => p.id === estado.pastaId) || estado.pastas[0];
}

function painelDaPasta() {
  return (estado.painel?.pastas || []).find((p) => p.id === estado.pastaId);
}

/* ------------------------------------------------------------------ */
/* Carga de dados                                                      */
/* ------------------------------------------------------------------ */

async function carregarTudo() {
  const periodos = await chamar("/api/meses");
  estado.meses = periodos.meses;
  estado.anos = periodos.anos;
  if (!estado.mes || !estado.meses.some((m) => m.valor === estado.mes)) {
    estado.mes = estado.meses[0].valor;
  }
  if (!estado.anos.includes(estado.relatorio.ano)) estado.relatorio.ano = estado.anos[0];

  estado.painel = await chamar(`/api/painel?mes=${estado.mes}`);
  estado.pastas = estado.painel.pastas;
  if (!estado.pastas.some((p) => p.id === estado.pastaId)) {
    estado.pastaId = estado.pastas[0]?.id ?? null;
  }
  const { contas } = await chamar("/api/contas");
  estado.contas = contas;
  desenhar();
}

async function recarregar() {
  await carregarTudo();
}

/* ------------------------------------------------------------------ */
/* Desenho da tela                                                     */
/* ------------------------------------------------------------------ */

function desenhar() {
  desenharSeletorMes();
  desenharAbasPastas();
  desenharMenu();
  desenharConteudo();
  desenharResumoGeral();
}

function desenharSeletorMes() {
  const sel = $("#filtro-mes");
  sel.innerHTML = estado.meses
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
    visao: telaVisao, entradas: () => telaLancamentos("receita"),
    despesas: () => telaLancamentos("despesa"),
    contas: telaPlanoDeContas, relatorios: telaRelatorios,
  };
  alvo.innerHTML = telas[estado.aba]();
  if (estado.aba === "entradas" || estado.aba === "despesas") carregarLista(estado.aba === "entradas" ? "receita" : "despesa");
  if (estado.aba === "relatorios") carregarRelatorios();
}

/* ---------------------------- Visão geral --------------------------- */

function telaVisao() {
  const p = painelDaPasta();
  if (!p) return "";
  const cat = p.categorias;
  return `
    <div class="grade-kpi">
      ${cartaoKpi("entrada", "↗", "Entradas", p.receitas, "pos")}
      ${cartaoKpi("saida", "↘", "Despesas", p.despesas, "neg")}
      ${cartaoKpi("saldo", "👛", "Saldo do Mês", p.saldo, p.saldo >= 0 ? "pos" : "neg")}
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
        ${listaLancamentos(p.ultimos)}
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
  if (!itens || !itens.length) return `<p class="vazio">Nenhum lançamento neste mês.</p>`;
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
  if (!cat || !cat.total) return `<p class="vazio">Sem despesas lançadas neste mês.</p>`;
  const raio = 54, circ = 2 * Math.PI * raio;
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
              ${esc(c.codigo ? c.codigo + " — " : "")}${esc(c.nome)}</option>`).join("")}
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
    <div class="box" id="area-lista"><p class="vazio">Carregando…</p></div>`;
}

function parametrosLista(tipo, comMes = true) {
  const p = new URLSearchParams({ pasta: estado.pastaId, tipo });
  const f = estado.filtros;
  if (comMes && !f.de && !f.ate) p.set("mes", estado.mes);
  if (f.busca) p.set("busca", f.busca);
  if (f.conta) p.set("conta", f.conta);
  if (f.de) p.set("de", f.de);
  if (f.ate) p.set("ate", f.ate);
  return p;
}

async function carregarLista(tipo) {
  const area = $("#area-lista");
  if (!area) return;
  try {
    const dados = await chamar("/api/lancamentos?" + parametrosLista(tipo).toString());
    const total = tipo === "receita" ? dados.receitas : dados.despesas;
    area.innerHTML = `
      <header>
        <h4>${dados.total} lançamento(s)</h4>
        <strong class="${tipo === "receita" ? "pos" : "neg"}">${moeda(total)}</strong>
      </header>
      ${dados.itens.length ? `
      <div class="tabela-rolagem"><table>
        <thead><tr>
          <th>Data</th><th>Descrição</th><th>Conta (plano de contas)</th>
          <th class="num">Valor</th><th class="num">Ações</th>
        </tr></thead>
        <tbody>${dados.itens.map((l) => `
          <tr>
            <td>${dataBR(l.data)}</td>
            <td>${esc(l.descricao)}${l.observacao ? `<br><small style="color:var(--texto-3)">${esc(l.observacao)}</small>` : ""}</td>
            <td><span class="ponto" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${esc(l.conta_cor)};margin-right:7px"></span>
                ${esc(l.conta_codigo ? l.conta_codigo + " — " : "")}${esc(l.conta_nome)}</td>
            <td class="num ${l.tipo === "receita" ? "pos" : "neg"}">${moeda(l.valor_centavos)}</td>
            <td class="num">
              <button class="btn mini claro" data-editar-lanc="${l.id}">Editar</button>
              <button class="btn mini perigo" data-excluir-lanc="${l.id}">Excluir</button>
            </td>
          </tr>`).join("")}</tbody>
      </table></div>` : `<p class="vazio">Nenhum lançamento encontrado com esses filtros.</p>`}`;
    area.dataset.itens = JSON.stringify(dados.itens);
  } catch (e) {
    area.innerHTML = `<p class="vazio">${esc(e.message)}</p>`;
  }
}

function contasDaPasta(pastaId, tipo, somenteAtivas = false) {
  return estado.contas.filter((c) =>
    (c.pasta_id === pastaId || c.pasta_id === null) &&
    (!tipo || c.tipo === tipo) &&
    (!somenteAtivas || c.ativo));
}

/* ------------------------- Plano de contas -------------------------- */

function telaPlanoDeContas() {
  const pasta = pastaAtual();
  const contas = contasDaPasta(pasta.id);
  const grupo = (tipo) => contas.filter((c) => c.tipo === tipo);
  const tabela = (tipo, titulo) => {
    const linhas = grupo(tipo);
    return `
      <div class="box">
        <header>
          <h4>${titulo}</h4>
          <button class="btn mini ${tipo === "receita" ? "entrada" : "saida"}" data-nova-conta="${tipo}">＋ Nova conta</button>
        </header>
        ${linhas.length ? `
        <div class="tabela-rolagem"><table>
          <thead><tr><th>Código</th><th>Nome</th><th>Situação</th><th class="num">Lançamentos</th><th class="num">Ações</th></tr></thead>
          <tbody>${linhas.map((c) => `
            <tr>
              <td>${esc(c.codigo || "—")}</td>
              <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${esc(c.cor)};margin-right:7px"></span>
                  ${esc(c.nome)}${c.pasta_id === null ? ' <small style="color:var(--texto-3)">(todas as pastas)</small>' : ""}</td>
              <td><span class="tag ${c.ativo ? "ativa" : "inativa"}">${c.ativo ? "Ativa" : "Inativa"}</span></td>
              <td class="num">${c.usos}</td>
              <td class="num">
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
    <div id="r-comparativo" class="box"><p class="vazio">Carregando…</p></div>
    <div id="r-mensal" class="box"><p class="vazio">Carregando…</p></div>
    <div class="colunas-2">
      <div id="r-despesas" class="box"><p class="vazio">Carregando…</p></div>
      <div id="r-receitas" class="box"><p class="vazio">Carregando…</p></div>
    </div>`;
}

async function carregarRelatorios() {
  const pasta = estado.relatorio.escopo === "pasta" ? `&pasta=${estado.pastaId}` : "";
  const [comp, mensal, desp, rec] = await Promise.all([
    chamar(`/api/relatorios/comparativo?mes=${estado.mes}`),
    chamar(`/api/relatorios/mensal?ano=${estado.relatorio.ano}${pasta}`),
    chamar(`/api/relatorios/categorias?mes=${estado.mes}&tipo=despesa${pasta}`),
    chamar(`/api/relatorios/categorias?mes=${estado.mes}&tipo=receita${pasta}`),
  ]);

  const linhaComp = (p) => `
    <tr>
      <td>${iconePasta(p)} ${esc(p.nome)}</td>
      <td class="num pos">${moeda(p.receitas)}</td>
      <td class="num neg">${moeda(p.despesas)}</td>
      <td class="num ${p.saldo >= 0 ? "pos" : "neg"}"><b>${moeda(p.saldo)}</b></td>
      <td class="num">${p.participacao.toFixed(1)}%</td>
    </tr>`;
  $("#r-comparativo").innerHTML = `
    <header><h4>Comparativo entre pastas — ${esc(rotuloMes(estado.mes))}</h4></header>
    <div class="tabela-rolagem"><table>
      <thead><tr><th>Pasta</th><th class="num">Entradas</th><th class="num">Despesas</th>
        <th class="num">Saldo</th><th class="num">% das despesas</th></tr></thead>
      <tbody>${comp.pastas.map(linhaComp).join("")}
        <tr style="background:var(--card-2)">
          <td><b>Total geral</b></td>
          <td class="num pos"><b>${moeda(comp.totais.receitas)}</b></td>
          <td class="num neg"><b>${moeda(comp.totais.despesas)}</b></td>
          <td class="num ${comp.totais.saldo >= 0 ? "pos" : "neg"}"><b>${moeda(comp.totais.saldo)}</b></td>
          <td class="num">100%</td>
        </tr></tbody>
    </table></div>`;

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
      <td>${esc(i.codigo ? i.codigo + " — " : "")}${esc(i.nome)}</td>
      <td class="num">${moeda(i.total)}</td>
      <td class="num">${i.percentual.toFixed(1)}%</td></tr>`).join("")}</tbody></table></div>`;
}

function rotuloMes(valor) {
  return estado.meses.find((m) => m.valor === valor)?.rotulo || valor;
}

/* --------------------------- Resumo geral --------------------------- */

function desenharResumoGeral() {
  const g = estado.painel?.geral || { receitas: 0, despesas: 0, saldo: 0 };
  $("#resumo-geral").innerHTML = `
    <div class="titulo">
      <span style="font-size:24px">📊</span>
      <div><b>Resumo do Mês (Todas as Pastas)</b><small>${esc(estado.painel?.rotulo || "")}</small></div>
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
    } catch (e) {
      aviso(e.message, "erro");
      botao.disabled = false;
    }
  });
  form.querySelector("input, select, textarea")?.focus();
}

function fecharModal() { $("#modal").innerHTML = ""; }

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
        <input type="date" name="data" required value="${esc(lanc?.data || hoje())}">
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
          ${esc(c.codigo ? c.codigo + " — " : "")}${esc(c.nome)}</option>`).join("")}
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
    </div>
    <input type="hidden" name="pasta_id" value="${pasta.id}">`,
    async (dados) => {
      if (lanc) await chamar(`/api/lancamentos/${lanc.id}`, { method: "PUT", body: dados });
      else await chamar("/api/lancamentos", { method: "POST", body: dados });
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
          <option value="" ${conta && conta.pasta_id === null ? "selected" : ""}>Todas as pastas</option>
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
    async (dados) => {
      const corpo = { ...dados, ativo: dados.ativo === "1", pasta_id: dados.pasta_id || null };
      if (conta) await chamar(`/api/contas/${conta.id}`, { method: "PUT", body: corpo });
      else await chamar("/api/contas", { method: "POST", body: corpo });
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
    async (dados) => {
      if (pasta) await chamar(`/api/pastas/${pasta.id}`, { method: "PUT", body: dados });
      else await chamar("/api/pastas", { method: "POST", body: dados });
      aviso(pasta ? "Pasta atualizada." : "Pasta criada.");
      await recarregar();
    });
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

function lancamentoDaLista(id) {
  const area = $("#area-lista");
  const itens = JSON.parse(area?.dataset.itens || "[]");
  return itens.find((l) => l.id === id);
}

document.addEventListener("click", async (ev) => {
  const alvo = ev.target.closest("[data-pasta],[data-aba],[data-novo],[data-nova-conta]," +
    "[data-editar-conta],[data-excluir-conta],[data-editar-lanc],[data-excluir-lanc]," +
    "[data-editar-pasta],[data-excluir-pasta],[data-fechar],[data-fundo],[data-exportar],#f-limpar,#btn-nova-pasta");
  if (!alvo) return;
  const d = alvo.dataset;

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
    if (!confirm("Excluir esta pasta? Suas contas do plano de contas também serão removidas.")) return;
    try {
      await chamar(`/api/pastas/${d.excluirPasta}`, { method: "DELETE" });
      fecharModal(); aviso("Pasta excluída."); await recarregar();
    } catch (e) { aviso(e.message, "erro"); }
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
      await chamar(`/api/contas/${conta.id}`, { method: "DELETE" });
      aviso("Conta excluída."); await recarregar();
    } catch (e) { aviso(e.message, "erro"); }
    return;
  }
  if (d.editarLanc) {
    const lanc = lancamentoDaLista(Number(d.editarLanc));
    if (lanc) return modalLancamento(lanc.tipo, lanc);
  }
  if (d.excluirLanc) {
    if (!confirm("Excluir este lançamento?")) return;
    try {
      await chamar(`/api/lancamentos/${d.excluirLanc}`, { method: "DELETE" });
      aviso("Lançamento excluído."); await recarregar();
    } catch (e) { aviso(e.message, "erro"); }
    return;
  }
  if (d.exportar) {
    const p = d.exportar === "todos"
      ? new URLSearchParams(estado.relatorio.escopo === "pasta"
          ? { pasta: estado.pastaId, mes: estado.mes } : { mes: estado.mes })
      : parametrosLista(d.exportar);
    window.location = "/api/export.csv?" + p.toString();
  }
});

document.addEventListener("change", async (ev) => {
  const id = ev.target.id;
  if (id === "filtro-mes") {
    estado.mes = ev.target.value;
    return recarregar();
  }
  if (id === "r-mes") { estado.mes = ev.target.value; return recarregar(); }
  if (id === "r-ano") { estado.relatorio.ano = Number(ev.target.value); return carregarRelatorios(); }
  if (id === "r-escopo") { estado.relatorio.escopo = ev.target.value; return carregarRelatorios(); }
  if (["f-busca", "f-conta", "f-de", "f-ate"].includes(id)) {
    estado.filtros = {
      busca: $("#f-busca").value.trim(), conta: $("#f-conta").value,
      de: $("#f-de").value, ate: $("#f-ate").value,
    };
    return carregarLista(estado.aba === "entradas" ? "receita" : "despesa");
  }
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") fecharModal();
});

let temporizadorBusca;
document.addEventListener("input", (ev) => {
  if (ev.target.id !== "f-busca") return;
  clearTimeout(temporizadorBusca);
  temporizadorBusca = setTimeout(() => ev.target.dispatchEvent(new Event("change", { bubbles: true })), 350);
});

carregarTudo().catch((e) => aviso(e.message, "erro"));
