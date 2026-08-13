'use strict';

/**
 * Serviço de exportação do acompanhamento de sessão.
 *
 * Gera arquivos PDF e Excel com layout operacional para uso em auditoria
 * e acompanhamento de presença por sessão.
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

  if (LOGO_CAMINHO && fs.existsSync(LOGO_CAMINHO)) {
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

function formatarDuracao(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '-';
  const inicio = new Date(checkIn);
  const fim = new Date(checkOut);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return '-';

  const totalSegundos = Math.floor((fim.getTime() - inicio.getTime()) / 1000);
  if (!Number.isFinite(totalSegundos) || totalSegundos < 0) return '-';

  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);
  const segundos = totalSegundos % 60;

  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
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

function mapearLinha(item) {
  return {
    colaborador: item.nome_completo || '-',
    status: statusLabel(item.status),
    checkIn: formatarHora(item.check_in_em),
    checkOut: formatarHora(item.check_out_em),
    duracao: formatarDuracao(item.check_in_em, item.check_out_em),
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

function truncarTexto(doc, texto, largura, fontSize = 8.4) {
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
    const valor = truncarTexto(doc, valores[coluna.key], coluna.width, 7.8);
    doc.rect(x, y, coluna.width, altura).stroke('#E3E8F0');
    doc.fillColor('#0F172A').fontSize(7.8).text(valor, x + 3, y + 3.7, {
      width: coluna.width - 6,
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

function gerarBufferPdf({ sessao, registros, geradoPor, layout }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      layout: normalizarLayoutPdf(layout),
      bufferPages: true,
    });
    const chunks = [];
    const larguraConteudo = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const tituloSessao = `${String(sessao?.tipo_sessao || sessao?.nome || 'Sessao')} - ${String(sessao?.local || 'Sem local')}`;
    desenharCabecalhoComLogo(doc, 'Lista de Presenca da Sessao - Laboral');
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
    const geradoPorNome = resolverNomeGerador(geradoPor);

    doc.fontSize(9).fillColor('#555').text(`Gerado em: ${geradoEm} | Gerado por: ${geradoPorNome}`);
    doc.text(`Total de linhas: ${registros.length}`);

    const resumoSessao = [
      `Sessao: ${tituloSessao}`,
      `Inicio efetivo: ${formatarDataHora(sessao?.inicio_efetivo_em)}`,
      `Encerramento: ${formatarDataHora(sessao?.fim_efetivo_em)}`,
      `Instrutor: ${String(sessao?.instrutor_nome || sessao?.instrutor || '-').trim() || '-'}`,
    ];

    doc.moveDown(0.35);
    doc.text(resumoSessao.join(' | '), { width: larguraConteudo });
    doc.moveDown(0.6);
    doc.fillColor('#111');

    if (registros.length === 0) {
      doc.fontSize(10).text('Nenhum registro encontrado para esta sessao.');
      doc.end();
      return;
    }

    const colunas = [
      { key: 'colaborador', label: 'Colaborador', width: 232 },
      { key: 'status', label: 'Status', width: 76 },
      { key: 'checkIn', label: 'Check-in', width: 70 },
      { key: 'checkOut', label: 'Check-out', width: 70 },
    ];

    let y = doc.y;
    y += desenharCabecalhoTabela(doc, colunas, y);

    registros.forEach((item) => {
      const linha = mapearLinha(item);
      const rodapeLimite = doc.page.height - doc.page.margins.bottom;
      if (y + 18 > rodapeLimite) {
        doc.addPage();
        y = doc.page.margins.top;
        y += desenharCabecalhoTabela(doc, colunas, y);
      }

      y += desenharLinhaTabela(doc, colunas, linha, y);
    });

    doc.end();
  });
}

async function gerarBufferExcel({ sessao, registros }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Presenca Sessao');
  const tituloSessao = `${String(sessao?.tipo_sessao || sessao?.nome || 'Sessao')} - ${String(sessao?.local || 'Sem local')}`;

  sheet.addRow(['Relatorio de Presenca da Sessao - Laboral']);
  sheet.addRow(['Sessao', tituloSessao]);
  sheet.addRow(['Instrutor', String(sessao?.instrutor_nome || '-')]);
  sheet.addRow(['Inicio efetivo', formatarDataHora(sessao?.inicio_efetivo_em)]);
  sheet.addRow(['Encerramento', formatarDataHora(sessao?.fim_efetivo_em)]);
  sheet.addRow(['Total de linhas', registros.length]);
  sheet.addRow([]);

  const header = sheet.addRow(['Colaborador', 'Status', 'Check-in', 'Check-out', 'Duracao']);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };

  sheet.columns = [
    { width: 34 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 14 },
  ];

  registros.forEach((item) => {
    const linha = mapearLinha(item);
    sheet.addRow([
      linha.colaborador,
      linha.status,
      linha.checkIn,
      linha.checkOut,
      linha.duracao,
    ]);
  });

  sheet.views = [{ state: 'frozen', ySplit: 8 }];

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  gerarBufferPdf,
  gerarBufferExcel,
};
