import { query, sql } from './db.js';
import { DIAS_PARA_INATIVAR, JANELA_INATIVOS_MESES, DIAS_LIMITE_ENTREGA, TIPOS_PEDIDO, MESES_NAVEGAVEIS } from './config.js';
import { ufDoEstado, regiaoDaUF } from './geo.js';

const IDENT = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)?$/;
function view(envKey, fallback) {
  const v = process.env[envKey] || fallback;
  if (!IDENT.test(v)) throw new Error(`${envKey} inválido: ${v}`);
  return v.includes('.') ? v : `dbo.${v}`;
}

const iso = (d) => (d instanceof Date && !isNaN(d) ? d.toISOString().slice(0, 10) : null);
const utcDate = (s) => new Date(`${s}T00:00:00Z`);
const clean = (s) => (s == null ? '' : String(s).trim());

function primeiroDiaDoMes(hojeISO, deslocamentoMeses) {
  const d = utcDate(hojeISO);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + deslocamentoMeses);
  return d;
}

export async function buildDashboard() {
  const V_PEDIDOS = view('VIEW_PEDIDOS', 'VW_PEDIDOS');
  const V_CLIENTES = view('VIEW_CLIENTES', 'VW_CLIENTES');
  const tipos = TIPOS_PEDIDO.map(Number).filter(Number.isInteger).join(',');

  const [{ hoje }] = await query(`SELECT CONVERT(varchar(10), GETDATE(), 23) AS hoje`);

  // mês atual + MESES_NAVEGAVEIS anteriores, mais 1 mês para o comparativo do mais antigo
  const ini = primeiroDiaDoMes(hoje, -(MESES_NAVEGAVEIS + 1));
  const iniInativos = utcDate(hoje);
  iniInativos.setUTCMonth(iniInativos.getUTCMonth() - JANELA_INATIVOS_MESES);

  const [pedRows, cliRows, histRows] = await Promise.all([
    query(
      `SELECT TIPO AS tipo, NUMERO_PEDIDO AS numero,
              MAX(DATA_EMISSAO) AS data_emissao, MAX(DATA_NF) AS data_nf, MAX(DATA_SAIDA) AS data_saida,
              COALESCE(MAX(VALOR_TOTAL), SUM(VALOR_TOTAL_ITEM)) AS valor,
              MAX(NOME_CLIENTE) AS cliente, MAX(NOME_VENDEDOR) AS vendedor,
              MAX(NOME_TRANSPORTADORA) AS transportadora, MAX(NOME_MOTORISTA) AS motorista,
              MAX(NOME_USUARIO_RESPONSAVEL) AS responsavel,
              MAX(SITUACAO) AS situacao, MAX(SITUACAO_ACOMPANHAMENTO) AS acomp,
              MAX(CAST(IDT_FATURAMENTO AS int)) AS idt_fat
         FROM ${V_PEDIDOS}
        WHERE TIPO IN (${tipos}) AND (DATA_EMISSAO >= @ini OR DATA_NF >= @ini)
        GROUP BY TIPO, NUMERO_PEDIDO`,
      { ini: [sql.DateTime, ini] },
    ),
    query(
      `SELECT RAZAO_SOCIAL AS nome, MAX(ESTADO) AS estado, MAX(AREA_ATUACAO) AS area, MAX(TIPO_VENDA) AS tipo_venda,
              MAX(VENDEDOR_INTERNO) AS vend_interno, MAX(VENDEDOR_EXTERNO) AS vend_externo,
              MAX(DATA_INCLUSAO) AS dt_cadastro, MAX([DATA ATIVACAO]) AS dt_ativacao
         FROM ${V_CLIENTES}
        WHERE RAZAO_SOCIAL IS NOT NULL
        GROUP BY RAZAO_SOCIAL`,
    ),
    query(
      `SELECT cliente, MIN(de) AS primeira, MAX(de) AS ultima, COUNT(*) AS pedidos,
              SUM(CASE WHEN fat = 1 AND dnf IS NOT NULL THEN vt ELSE 0 END) AS faturamento
         FROM (SELECT NUMERO_PEDIDO, MAX(NOME_CLIENTE) AS cliente, MAX(DATA_EMISSAO) AS de, MAX(DATA_NF) AS dnf,
                      MAX(CAST(IDT_FATURAMENTO AS int)) AS fat,
                      COALESCE(MAX(VALOR_TOTAL), SUM(VALOR_TOTAL_ITEM)) AS vt
                 FROM ${V_PEDIDOS}
                WHERE TIPO IN (${tipos}) AND SITUACAO <> 'CANCELADO'
                GROUP BY TIPO, NUMERO_PEDIDO) x
        WHERE cliente IS NOT NULL
        GROUP BY cliente
       HAVING MAX(de) >= @iniInativos`,
      { iniInativos: [sql.DateTime, iniInativos] },
    ),
  ]);

  const hojeD = utcDate(hoje);
  const internos = new Set(cliRows.map((r) => clean(r.vend_interno)).filter(Boolean));
  const registro = new Map(cliRows.map((r) => [r.nome, r]));

  const clientes = histRows.map((h) => {
    const r = registro.get(h.cliente) || {};
    const uf = ufDoEstado(r.estado);
    return {
      id: h.cliente,
      razaoSocial: h.cliente,
      estado: uf,
      regiao: regiaoDaUF(uf),
      segmento: clean(r.area) || 'Não informado',
      tipoVenda: clean(r.tipo_venda) || 'Não informado',
      vendedor: clean(r.vend_interno) || clean(r.vend_externo) || 'Sem vendedor',
      dataCadastro: iso(r.dt_cadastro),
      dataAtivacao: iso(r.dt_ativacao),
      primeiraCompra: iso(h.primeira),
      ultimaCompra: iso(h.ultima),
      faturamentoHistorico: Number(h.faturamento) || 0,
      numPedidos: Number(h.pedidos) || 0,
    };
  });

  const nomesVendedores = new Set();
  const pedidos = [];
  for (const r of pedRows) {
    const dataEmissao = iso(r.data_emissao) || iso(r.data_nf);
    if (!dataEmissao) continue;
    const dataNF = iso(r.data_nf);
    const base = clean(r.situacao).toUpperCase();
    const faturado = base !== 'CANCELADO' && Number(r.idt_fat) === 1 && !!dataNF;
    const situacao = base === 'CANCELADO' ? 'CANCELADO' : faturado ? 'FATURADO' : base === 'EMITIDO' ? 'EMITIDO' : 'LIBERADO';
    const saida = iso(r.data_saida);
    const vendedor = clean(r.vendedor) || 'Sem vendedor';
    nomesVendedores.add(vendedor);
    pedidos.push({
      numero: String(Number(r.numero)),
      dataEmissao,
      dataNF,
      dataSaida: saida && utcDate(saida) <= hojeD ? saida : null,
      valor: Number(r.valor) || 0,
      cliente: clean(r.cliente),
      vendedor,
      transportadora: clean(r.transportadora),
      motorista: clean(r.motorista),
      responsavel: clean(r.responsavel),
      situacao,
      acomp: clean(r.acomp).toUpperCase() || '-',
    });
  }

  const vendedores = [...nomesVendedores].sort().map((nome) => ({
    id: nome,
    nome,
    tipo: internos.has(nome) ? 'Interno' : 'Externo',
  }));

  return {
    geradoEm: new Date().toISOString(),
    hoje,
    metaMensal: process.env.META_MENSAL_EMPRESA ? Number(process.env.META_MENSAL_EMPRESA) : null,
    regras: {
      diasParaInativar: DIAS_PARA_INATIVAR,
      janelaInativosMeses: JANELA_INATIVOS_MESES,
      diasLimiteEntrega: DIAS_LIMITE_ENTREGA,
      tiposPedido: TIPOS_PEDIDO,
    },
    // as 3 views não trazem produto por item nem motivo de pendência
    limites: { produtos: false, motivoPendencia: false },
    vendedores,
    clientes,
    pedidos,
  };
}
