'use strict';

/**
 * src/services/auditImageService.js — Processamento de imagens com watermark
 *
 * Responsabilidades:
 *   - Manter a imagem original apenas em memória durante o processamento
 *   - Adicionar watermark (tipo da sessão + data/hora) na diagonal
 *   - Retornar apenas o buffer final para persistência no banco (BYTEA)
 */

const sharp = require('sharp');

const TIMEZONE_PADRAO = 'America/Sao_Paulo';

function garantirDiretorio() {
  return true;
}

function escaparSvgTexto(texto) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizarTextoWatermark(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function adicionarWatermark(buffer, mimetype = 'image/jpeg', rotuloSessao = 'SESSAO') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const err = new Error('Imagem inválida para watermark.');
    err.statusCode = 400;
    throw err;
  }

  garantirDiretorio();

  const formato = mimetype === 'image/png' ? 'png' : 'jpeg';
  const contentType = formato === 'png' ? 'image/png' : 'image/jpeg';

  try {
    const labelSessao = normalizarTextoWatermark(rotuloSessao || 'SESSAO').toUpperCase().slice(0, 80) || 'SESSAO';
    const agora = new Date();
    const data = agora.toLocaleDateString('pt-BR', { timeZone: TIMEZONE_PADRAO });
    const hora = agora.toLocaleTimeString('pt-BR', { timeZone: TIMEZONE_PADRAO });
    const linhas = [
      'VIANA PEIXOTO',
      `${labelSessao}`,
      `${data} ${hora}`,
    ];

    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 800;
    const height = metadata.height || 600;
    const fontSize = Math.max(12, Math.round(Math.min(width, height) / 28));
    const lineHeight = Math.round(fontSize * 1.22);
    const blocoLargura = Math.round(width * 0.35);
    const blocoAltura = Math.round(lineHeight * (linhas.length + 0.7));
    const passoX = Math.max(90, Math.round(blocoLargura * 0.95));
    const passoY = Math.max(75, Math.round(blocoAltura * 1.05));

    const marcas = [];
    for (let y = -passoY; y <= height + passoY; y += passoY) {
      for (let x = -passoX; x <= width + passoX; x += passoX) {
        const linhasSvg = linhas.map((linha, index) => {
          const yy = index * lineHeight;
          return `<text x="0" y="${yy}" class="watermark-text">${escaparSvgTexto(linha)}</text>`;
        }).join('');

        marcas.push(`<g transform="translate(${x} ${y})">${linhasSvg}</g>`);
      }
    }

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            .watermark-text {
              font-family: "Noto Sans", "DejaVu Sans", "Liberation Sans", Arial, sans-serif;
              font-size: ${fontSize}px;
              font-weight: 700;
              fill: rgba(255, 255, 255, 0.70);
              text-anchor: start;
            }
          </style>
        </defs>
        <g transform="rotate(-28 ${width / 2} ${height / 2})">
          ${marcas.join('')}
        </g>
      </svg>
    `;

    const outputBuffer = await sharp(buffer)
      .composite([{ input: Buffer.from(svg, 'utf8'), blend: 'over' }])
      .toFormat(formato, formato === 'png' ? {} : { quality: 90 })
      .toBuffer();

    return {
      buffer: outputBuffer,
      contentType,
    };
  } catch (err) {
    console.error(`[auditImage] Erro ao adicionar watermark: ${err.message}`);
    throw err;
  }
}

module.exports = {
  adicionarWatermark,
  garantirDiretorio,
};
