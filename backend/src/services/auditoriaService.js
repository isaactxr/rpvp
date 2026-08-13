'use strict';

/**
 * Serviço de auditoria.
 *
 * Monta consultas SQL paginadas para a trilha de presença, aplicando filtros de período,
 * setor, instrutor, tipo de sessão e status calculado a partir de check-in/check-out.
 */
const db = require('../config/database');

function normalizarInteiro(valor, padrao) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) return padrao;
  return numero;
}

function normalizarData(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const err = new Error('Data inválida. Use YYYY-MM-DD.');
    err.statusCode = 400;
    throw err;
  }
  return texto;
}

function normalizarStatus(status) {
  if (!status) return null;
  const valor = String(status).trim().toLowerCase();
  const permitidos = ['nao_iniciado', 'em_andamento', 'concluido', 'ausente'];
  if (!permitidos.includes(valor)) {
    const err = new Error(`Status inválido. Use: ${permitidos.join(', ')}.`);
    err.statusCode = 400;
    throw err;
  }
  return valor;
}

function montarStatusExpr() {
  return `CASE
    WHEN p.check_in_em IS NOT NULL AND s.checkout_habilitado = false THEN 'concluido'
    WHEN p.check_out_em IS NOT NULL THEN 'concluido'
    WHEN p.check_in_em IS NOT NULL THEN 'em_andamento'
    ELSE 'nao_iniciado'
  END`;
}

function montarQueryAuditoria(filtros = {}) {
  const where = [];
  const valores = [];

  if (filtros.nome) {
    valores.push(`%${String(filtros.nome).trim()}%`);
    where.push(`u.nome_completo ILIKE $${valores.length}`);
  }

  const dataInicio = normalizarData(filtros.dataInicio || filtros.data);
  const dataFim = normalizarData(filtros.dataFim);

  if (dataInicio) {
    valores.push(dataInicio);
    where.push(`s.data >= $${valores.length}`);
  }

  if (dataFim) {
    valores.push(dataFim);
    where.push(`s.data <= $${valores.length}`);
  }

  if (filtros.instrutorId) {
    valores.push(normalizarInteiro(filtros.instrutorId, 0));
    where.push(`s.instrutor_id = $${valores.length}`);
  }

  if (filtros.sessaoId) {
    valores.push(normalizarInteiro(filtros.sessaoId, 0));
    where.push(`s.id = $${valores.length}`);
  }

  if (filtros.tipoSessao) {
    valores.push(String(filtros.tipoSessao).trim());
    where.push(`s.tipo_sessao = $${valores.length}`);
  }

  if (filtros.setor) {
    valores.push(String(filtros.setor).trim());
    where.push(`setor_colab.nome = $${valores.length}`);
  }

  if (filtros.gestorId) {
    valores.push(normalizarInteiro(filtros.gestorId, 0));
    where.push(`u.gestor_id = $${valores.length}`);
  }

  const status = normalizarStatus(filtros.status);
  const statusExpr = montarStatusExpr();
  if (status) {
    valores.push(status);
    where.push(`${statusExpr} = $${valores.length}`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const baseFrom = `
    FROM presencas p
    JOIN usuarios u ON u.id = p.usuario_id
    JOIN sessoes s ON s.id = p.sessao_id
    LEFT JOIN usuarios instrutor ON instrutor.id = s.instrutor_id
    LEFT JOIN setores setor_colab ON setor_colab.id = u.setor_id
  `;

  return { valores, whereSql, statusExpr, baseFrom };
}

async function buscarLinhasAuditoria(filtros = {}, opts = {}) {
  const semPaginacao = opts.semPaginacao === true;
  const limiteExportacao = normalizarInteiro(opts.limiteExportacao, 10000);
  const page = normalizarInteiro(filtros.page, 1);
  const pageSize = Math.min(normalizarInteiro(filtros.pageSize, 20), 100);
  const offset = (page - 1) * pageSize;

  const { valores, whereSql, statusExpr, baseFrom } = montarQueryAuditoria(filtros);

  const totalQuery = await db.query(
    `SELECT COUNT(1) AS total
     ${baseFrom}
     ${whereSql}`,
    valores
  );

  const total = Number(totalQuery.rows[0]?.total || 0);

  let dadosSql = `SELECT p.id AS presenca_id,
            u.id AS usuario_id,
            u.nome_completo,
            u.usuario,
            setor_colab.nome AS colaborador_setor,
            s.id AS sessao_id,
            s.nome AS sessao_nome,
            CONCAT(
              COALESCE(NULLIF(TRIM(s.tipo_sessao), ''), 'Sessao'),
              ' - ',
              COALESCE(NULLIF(TRIM(s.local), ''), 'Sem local')
            ) AS sessao_exibicao,
            s.tipo_sessao,
            s.local AS sessao_local,
            s.data AS sessao_data,
            s.inicio_efetivo_em,
            s.fim_efetivo_em,
            instrutor.id AS instrutor_id,
            instrutor.nome_completo AS instrutor_nome,
            p.check_in_em,
            p.check_out_em,
            p.similaridade,
            EXISTS (
              SELECT 1
              FROM presencas_imagens pi
              WHERE pi.presenca_id = p.id
            ) AS tem_imagem_auditoria,
            ${statusExpr} AS status,
            CASE
              WHEN p.check_in_em IS NOT NULL AND p.check_out_em IS NOT NULL THEN p.check_out_em - p.check_in_em
              ELSE NULL
            END AS duracao_participacao
     ${baseFrom}
     ${whereSql}
    ORDER BY s.inicio_efetivo_em DESC NULLS LAST, s.data DESC, u.nome_completo ASC`;

  let dataQuery;
  if (semPaginacao) {
    const valoresExport = [...valores, limiteExportacao];
    dadosSql += ` LIMIT $${valoresExport.length}`;
    dataQuery = await db.query(dadosSql, valoresExport);
  } else {
    const dadosValores = [...valores, pageSize, offset];
    dadosSql += ` LIMIT $${dadosValores.length - 1} OFFSET $${dadosValores.length}`;
    dataQuery = await db.query(dadosSql, dadosValores);
  }

  return {
    data: dataQuery.rows,
    total,
    page,
    pageSize,
  };
}

/**
 * Retorna a auditoria paginada pronta para consumo pelo frontend, incluindo metadados de navegação.
 * @param {object} [filtros={}] Filtros de nome, período, instrutor, sessão, setor, status e paginação.
 * @returns {Promise<{data: object[], pagination: object, export: object}>}
 */
async function listarAuditoria(filtros = {}) {
  const resultado = await buscarLinhasAuditoria(filtros, { semPaginacao: false });

  return {
    data: resultado.data,
    pagination: {
      page: resultado.page,
      pageSize: resultado.pageSize,
      total: resultado.total,
      totalPages: Math.max(Math.ceil(resultado.total / resultado.pageSize), 1),
    },
    export: { prepared: true },
  };
}

async function listarAuditoriaParaExportacao(filtros = {}, limite = 10000) {
  const resultado = await buscarLinhasAuditoria(filtros, {
    semPaginacao: true,
    limiteExportacao: limite,
  });

  return resultado.data;
}

module.exports = {
  listarAuditoria,
  listarAuditoriaParaExportacao,
};
