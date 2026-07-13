'use strict';

/**
 * Serviço de exportação da auditoria.
 *
 * Converte as linhas retornadas pela consulta de auditoria em artefatos legíveis para uso
 * gerencial, nos formatos PDF e Excel, preservando o mesmo recorte aplicado nos filtros.
 */
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const TIMEZONE_PADRAO = 'America/Sao_Paulo';
function resolverCaminhoLogo() {
  const candidatos = [
    process.env.RELATORIO_LOGO_PATH,
    path.resolve(__dirname, '../../assets/img/logo_dark.png'),
    path.resolve(__dirname, '../../../frontend/assets/img/logo_dark.png'),
  ].filter(Boolean);

  return candidatos.find((caminho) => fs.existsSync(caminho)) || null;
}

const LOGO_CAMINHO = resolverCaminhoLogo();

function desenharCabecalhoComLogo(doc, titulo) {
  const yInicial = doc.y;
  const xTitulo = doc.page.margins.left;
  const logoWidth = 153;
  const logoHeight = 110;
  const logoX = doc.page.width - doc.page.margins.right - logoWidth;
  const alturaFluxoCabecalho = 40;
  const deslocamentoVerticalLogo = 15;
  const logoY = Math.max(8, yInicial - Math.max(0, (logoHeight - alturaFluxoCabecalho) / 2) + deslocamentoVerticalLogo);
  const larguraTitulo = Math.max(140, logoX - xTitulo - 10);

  if (fs.existsSync(LOGO_CAMINHO)) {
    try {
      doc.image(LOGO_CAMINHO, logoX, logoY, { fit: [logoWidth, logoHeight] });
    } catch (_err) {
      // Se o logo falhar, mantem apenas o titulo textual.
    }
  }

  doc.fontSize(14).fillColor('#0F172A').text(titulo, xTitulo, yInicial + 3, {
    align: 'left',
    width: larguraTitulo,
  });
  doc.y = Math.max(doc.y, yInicial + alturaFluxoCabecalho);
}

function formatarData(data) {
  if (!data) return '-';
  const base = String(data).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(base)) {
    const [ano, mes, dia] = base.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  const dt = new Date(data);
  return Number.isNaN(dt.getTime())
    ? String(data)
    : dt.toLocaleDateString('pt-BR', { timeZone: TIMEZONE_PADRAO });
}

function formatarDataHora(valor) {
  if (!valor) return '-';
  const dt = new Date(valor);
  return Number.isNaN(dt.getTime())
    ? String(valor)
    : dt.toLocaleString('pt-BR', {
        timeZone: TIMEZONE_PADRAO,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
}

function formatarHora(valor) {
  if (!valor) return '-';
  const dt = new Date(valor);
  return Number.isNaN(dt.getTime())
    ? String(valor)
    : dt.toLocaleTimeString('pt-BR', {
        timeZone: TIMEZONE_PADRAO,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
}

function formatarDuracao(intervalo) {
  if (!intervalo) return '-';

  if (typeof intervalo === 'object') {
    const hours = Number(intervalo.hours || 0);
    const minutes = Number(intervalo.minutes || 0);
    const seconds = Number(intervalo.seconds || 0);
    if ([hours, minutes, seconds].some((n) => Number.isNaN(n))) return '-';
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(Math.floor(seconds)).padStart(2, '0')}`;
  }

  const texto = String(intervalo);
  const [h = '00', m = '00', s = '00'] = texto.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${String(s).slice(0, 2).padStart(2, '0')}`;
}

function statusLabel(status) {
  const labels = {
    nao_iniciado: 'Nao iniciado',
    em_andamento: 'Em andamento',
    concluido: 'Presente',
    ausente: 'Ausente',
  };
  return labels[status] || status || '-';
}

function montarDataHoraSessao(item) {
  const inicio = formatarDataHora(item.inicio_efetivo_em);
  const fim = formatarDataHora(item.fim_efetivo_em);
  return `${inicio} - ${fim}`;
}

function montarNomeSessao(item) {
  const candidatos = [item.tipo_sessao, item.sessao_nome, item.nome_sessao, item.sessao];
  const nomeDireto = candidatos.find((valor) => String(valor || '').trim());
  if (nomeDireto) return String(nomeDireto).trim();

  const exibicao = String(item.sessao_exibicao || '').trim();
  const local = String(item.sessao_local || '').trim();
  if (!exibicao) return '-';
  if (!local) return exibicao;

  const sufixoComSeparador = ` - ${local}`;
  if (exibicao.endsWith(sufixoComSeparador)) {
    return exibicao.slice(0, -sufixoComSeparador.length).trim() || '-';
  }

  return exibicao;
}

/**
 * Normaliza a linha vinda do banco para uma estrutura amigável aos exportadores.
 * @param {object} item Registro bruto retornado pelo serviço de auditoria.
 * @returns {{colaborador:string,sessao:string,instrutor:string,dataHoraSessao:string,status:string,checkIn:string,checkOut:string,duracao:string,local:string}}
 */
function mapearLinha(item) {
  return {
    colaborador: item.nome_completo || '-',
    sessao: montarNomeSessao(item),
    instrutor: item.instrutor_nome || '-',
    dataHoraSessao: montarDataHoraSessao(item),
    status: statusLabel(item.status),
    checkIn: formatarHora(item.check_in_em),
    checkOut: formatarHora(item.check_out_em),
    duracao: formatarDuracao(item.duracao_participacao),
    local: item.sessao_local || '-',
  };
}

function escreverLinhaCompacta(doc, texto, largura, opcoes = {}) {
  const {
    fontSize = 8.5,
    minFontSize = 6.8,
    color = '#333',
  } = opcoes;

  let tamanhoAtual = fontSize;
  doc.fontSize(tamanhoAtual);

  while (tamanhoAtual > minFontSize && doc.widthOfString(texto) > largura) {
    tamanhoAtual = Math.max(minFontSize, Number((tamanhoAtual - 0.2).toFixed(2)));
    doc.fontSize(tamanhoAtual);
  }

  doc.fillColor(color).text(texto, {
    width: largura,
    lineGap: 0,
  });

  doc.fillColor('#111');
}

function truncarTexto(doc, texto, largura, fontSize = 8) {
  const conteudo = String(texto ?? '-');
  doc.fontSize(fontSize);
  if (doc.widthOfString(conteudo) <= largura - 4) return conteudo;

  const sufixo = '...';
  let base = conteudo;
  while (base.length > 0 && doc.widthOfString(`${base}${sufixo}`) > largura - 4) {
    base = base.slice(0, -1);
  }
  return `${base}${sufixo}`;
}

function desenharCabecalhoTabela(doc, colunas, y) {
  let x = doc.page.margins.left;
  const altura = 17;

  colunas.forEach((coluna) => {
    doc.rect(x, y, coluna.width, altura).fillAndStroke('#F8FAFC', '#D8E0EB');
    doc.fillColor('#334155').fontSize(8).text(coluna.label, x + 3, y + 4.5, {
      width: coluna.width - 6,
      height: altura - 6,
      ellipsis: true,
    });
    x += coluna.width;
  });

  doc.fillColor('#111');
  return altura;
}

function desenharLinhaTabela(doc, colunas, valores, y) {
  let x = doc.page.margins.left;
  const altura = 16;

  colunas.forEach((coluna) => {
    const valor = truncarTexto(doc, valores[coluna.key], coluna.width, 7.6);
    doc.rect(x, y, coluna.width, altura).stroke('#E3E8F0');
    doc.fillColor('#0F172A').fontSize(7.6).text(valor, x + 3, y + 3.7, {
      width: coluna.width - 6,
      height: altura - 4,
      ellipsis: true,
    });
    x += coluna.width;
  });

  return altura;
}

function resolverNomeGerador(geradoPor) {
  if (!geradoPor || typeof geradoPor !== 'object') return '-';
  return String(
    geradoPor.nome_completo
      || geradoPor.nome
      || geradoPor.usuario
      || geradoPor.login
      || geradoPor.id
      || '-'
  );
}

function normalizarLayoutPdf(layout) {
  return String(layout || '').toLowerCase() === 'landscape' ? 'landscape' : 'portrait';
}

function montarColunasPdf(larguraConteudo) {
  const colunas = [
    { key: 'colaborador', label: 'Colaborador', width: 150 },
    { key: 'sessao', label: 'Sessao', width: 74 },
    { key: 'instrutor', label: 'Instrutor', width: 150 },
    { key: 'status', label: 'Status', width: 43 },
    { key: 'checkIn', label: 'Check-in', width: 50 },
    { key: 'checkOut', label: 'Check-out', width: 50 },
  ];

  const larguraBase = colunas.reduce((total, coluna) => total + coluna.width, 0);
  const extra = Math.max(0, Math.floor(larguraConteudo - larguraBase));

  if (extra > 0) {
    const extraColaborador = Math.floor(extra * 0.6);
    const extraSessao = Math.floor(extra * 0.15);
    const extraLocal = Math.floor(extra * 0.1);
    const extraInstrutor = extra - extraColaborador - extraSessao - extraLocal;

    colunas[0].width += extraColaborador;
    colunas[1].width += extraSessao;
    colunas[2].width += extraLocal;
    colunas[3].width += extraInstrutor;
  }

  return colunas;
}

/**
 * Gera um PDF textual com o resultado da auditoria, incluindo total de linhas e resumo dos filtros aplicados.
 * @param {object[]} [registros=[]] Linhas da auditoria já filtradas.
 * @param {object} [filtros={}] Filtros usados para compor o relatório.
 * @returns {Promise<Buffer>} Buffer pronto para envio como download HTTP.
 */
function gerarBufferPdf(registros = [], filtros = {}, opcoes = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      layout: normalizarLayoutPdf(opcoes.layout),
      bufferPages: true,
    });
    const chunks = [];
    const larguraConteudo = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    desenharCabecalhoComLogo(doc, 'Relatorio de Auditoria - Laboral');
    doc.moveDown(0.25);
    const geradoEm = new Date().toLocaleString('pt-BR', {
      timeZone: TIMEZONE_PADRAO,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const geradoPor = resolverNomeGerador(opcoes.geradoPor);

    doc.fontSize(9).fillColor('#555').text(`Gerado em: ${geradoEm} | Gerado por: ${geradoPor}`);
    doc.text(`Total de linhas: ${registros.length}`);

    const resumoFiltros = [
      filtros.nome ? `Nome: ${filtros.nome}` : null,
      filtros.dataInicio ? `Data inicio: ${filtros.dataInicio}` : null,
      filtros.dataFim ? `Data fim: ${filtros.dataFim}` : null,
      filtros.instrutorId ? `Instrutor ID: ${filtros.instrutorId}` : null,
      filtros.sessaoId ? `Sessao ID: ${filtros.sessaoId}` : null,
      filtros.status ? `Status: ${filtros.status}` : null,
    ].filter(Boolean);

    if (resumoFiltros.length > 0) {
      doc.moveDown(0.35);
      doc.text(`Filtros: ${resumoFiltros.join(' | ')}`, { width: larguraConteudo });
    }

    doc.moveDown(0.6);
    doc.fillColor('#111');

    const colunas = montarColunasPdf(larguraConteudo);

    let y = doc.y;
    y += desenharCabecalhoTabela(doc, colunas, y);

    registros.forEach((item) => {
      const linha = mapearLinha(item);
      const rodapeLimite = doc.page.height - doc.page.margins.bottom;
      if (y + 17 > rodapeLimite) {
        doc.addPage();
        y = doc.page.margins.top;
        y += desenharCabecalhoTabela(doc, colunas, y);
      }

      y += desenharLinhaTabela(doc, colunas, linha, y);
    });

    doc.end();
  });
}

/**
 * Gera uma planilha Excel com cabeçalho formatado e uma linha por registro de auditoria.
 * @param {object[]} [registros=[]] Linhas consolidadas da auditoria.
 * @returns {Promise<Buffer>} Conteúdo binário do arquivo `.xlsx`.
 */
async function gerarBufferExcel(registros = []) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Auditoria');

  sheet.columns = [
    { header: 'Colaborador', key: 'colaborador', width: 28 },
    { header: 'Sessao', key: 'sessao', width: 24 },
    { header: 'Local', key: 'local', width: 24 },
    { header: 'Instrutor', key: 'instrutor', width: 24 },
    { header: 'Data/Hora Sessao', key: 'dataHoraSessao', width: 22 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Check-in', key: 'checkIn', width: 22 },
    { header: 'Check-out', key: 'checkOut', width: 22 },
    { header: 'Duracao', key: 'duracao', width: 12 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A8A' },
  };

  registros.forEach((item) => {
    sheet.addRow(mapearLinha(item));
  });

  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  gerarBufferPdf,
  gerarBufferExcel,
};
