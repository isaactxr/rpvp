'use strict';

/**
 * src/services/compreFaceService.js — Integração com a API do CompreFace
 *
 * Responsabilidades:
 *   - Construir a requisição multipart/form-data com o buffer recebido do Multer
 *   - Chamar POST /api/v1/recognition/recognize do CompreFace (local via Docker)
 *   - Normalizar a resposta para um formato simples e consistente
 *   - Nunca expor a API Key fora deste módulo
 *
 * Estrutura da resposta normalizada:
 *   {
 *     rostoEncontrado: boolean,
 *     reconhecido:     boolean,
 *     subject:         string | null,   // ID/nome do usuário cadastrado
 *     similarity:      number | null,
 *   }
 */

const axios    = require('axios');
const FormData = require('form-data');
const config   = require('../config/env');

const ENDPOINT = `${config.COMPREFACE_URL}/api/v1/recognition/recognize`;
const ENDPOINT_SUBJECTS = `${config.COMPREFACE_URL}/api/v1/recognition/subjects`;
const ENDPOINT_FACES = `${config.COMPREFACE_URL}/api/v1/recognition/faces`;
const ENDPOINT_STATIC = `${config.COMPREFACE_URL}/api/v1/static/${config.COMPREFACE_API_KEY}/images`;

function getHeadersExtra() {
  return {
    'x-api-key': config.COMPREFACE_API_KEY,
  };
}

/**
 * Envia a imagem ao CompreFace e retorna o resultado normalizado.
 *
 * @param {Buffer} buffer       - Buffer da imagem (de req.file.buffer)
 * @param {string} mimetype     - MIME type (ex.: 'image/jpeg')
 * @param {string} [filename]   - Nome do arquivo (opcional, para logs)
 * @returns {Promise<{
 *   rostoEncontrado: boolean,
 *   reconhecido: boolean,
 *   subject: string|null,
 *   similarity: number|null
 * }>}
 */
async function reconhecer(buffer, mimetype, filename = 'face.jpg') {
  // ── Monta multipart com o buffer da imagem ──────────────────
  const form = new FormData();
  form.append('file', buffer, {
    filename,
    contentType: mimetype,
    knownLength: buffer.length,
  });

  let resposta;
  try {
    resposta = await axios.post(ENDPOINT, form, {
      headers: {
        // API key nunca vai ao frontend
        ...getHeadersExtra(),
        ...form.getHeaders(),
      },
      timeout: config.COMPREFACE_TIMEOUT_MS,
      // Resolve mesmo para status 4xx/5xx. A normalização abaixo
      // lida com cada cenário sem lançar exceção desnecessária.
      validateStatus: () => true,
    });
  } catch (err) {
    // Erros de rede (ECONNREFUSED, timeout, DNS, etc.)
    const tipoErro = err.code === 'ECONNABORTED' ? 'Timeout' : 'Erro de rede';
    throw new Error(`[compreFace] ${tipoErro} ao conectar: ${err.message}`);
  }

  const { status, data } = resposta;

  // ── HTTP 400: CompreFace não encontrou rosto na imagem ───────
  if (status === 400) {
    console.warn('[compreFace] Nenhum rosto detectado na imagem enviada.');
    return { rostoEncontrado: false, reconhecido: false, subject: null, similarity: null };
  }

  // ── HTTP 401 / 403: API Key inválida ──────────────────────────
  if (status === 401 || status === 403) {
    throw new Error(`[compreFace] Autenticação falhou (HTTP ${status}). Verifique COMPREFACE_API_KEY.`);
  }

  // ── Outros erros HTTP ─────────────────────────────────────────
  if (status >= 400) {
    throw new Error(`[compreFace] Resposta inesperada HTTP ${status}: ${JSON.stringify(data)}`);
  }

  // ── Normaliza resposta de sucesso ─────────────────────────────
  // Estrutura esperada do CompreFace:
  // { "result": [{ "subjects": [{ "subject": "...", "similarity": 0.95 }] }] }
  const resultados = data?.result;

  if (!Array.isArray(resultados) || resultados.length === 0) {
    return { rostoEncontrado: false, reconhecido: false, subject: null, similarity: null };
  }

  // Pega o primeiro rosto detectado
  const subjects = resultados[0]?.subjects;

  if (!Array.isArray(subjects) || subjects.length === 0) {
    // Rosto encontrado, mas sem correspondência no banco do CompreFace
    return { rostoEncontrado: true, reconhecido: false, subject: null, similarity: null };
  }

  // O CompreFace já retorna subjects ordenados por similaridade (maior primeiro)
  const melhor = subjects[0];

  return {
    rostoEncontrado: true,
    reconhecido:     melhor.similarity >= config.SIMILARITY_THRESHOLD,
    subject:         melhor.subject    ?? null,
    similarity:      melhor.similarity ?? null,
  };
}

function normalizarSubject(subject) {
  const valor = String(subject || '').trim();
  if (!valor) {
    const err = new Error('Subject inválido para o CompreFace.');
    err.statusCode = 400;
    throw err;
  }
  return valor;
}

async function garantirSubject(subject) {
  const subjectNormalizado = normalizarSubject(subject);

  const resposta = await axios.post(
    ENDPOINT_SUBJECTS,
    { subject: subjectNormalizado },
    {
      headers: {
        ...getHeadersExtra(),
        'Content-Type': 'application/json',
      },
      timeout: config.COMPREFACE_TIMEOUT_MS,
      validateStatus: () => true,
    }
  );

  if (resposta.status === 201 || resposta.status === 200) {
    return { subject: subjectNormalizado, created: true };
  }

  if (resposta.status === 409) {
    return { subject: subjectNormalizado, created: false };
  }

  if (resposta.status === 400) {
    const mensagem = String(
      resposta.data?.message || resposta.data?.detail || resposta.data?.error || ''
    ).toLowerCase();

    // Alguns deployments retornam 400 em vez de 409 quando o subject já existe.
    if (mensagem.includes('already') || mensagem.includes('exists') || mensagem.includes('duplicate')) {
      return { subject: subjectNormalizado, created: false };
    }
  }

  if (resposta.status === 401 || resposta.status === 403) {
    const err = new Error('Falha de autenticação com CompreFace (x-api-key).');
    err.statusCode = 502;
    throw err;
  }

  const err = new Error(`Falha ao criar subject no CompreFace (HTTP ${resposta.status}).`);
  err.statusCode = 502;
  throw err;
}

async function enviarFaceParaSubject(subject, file) {
  if (!file?.buffer) {
    const err = new Error('Arquivo de imagem inválido para envio ao CompreFace.');
    err.statusCode = 400;
    throw err;
  }

  const subjectNormalizado = normalizarSubject(subject);
  const form = new FormData();
  form.append('file', file.buffer, {
    filename: file.originalname || 'face.jpg',
    contentType: file.mimetype,
    knownLength: file.buffer.length,
  });

  const resposta = await axios.post(
    `${ENDPOINT_FACES}?subject=${encodeURIComponent(subjectNormalizado)}`,
    form,
    {
      headers: {
        ...getHeadersExtra(),
        ...form.getHeaders(),
      },
      timeout: config.COMPREFACE_TIMEOUT_MS,
      maxBodyLength: Infinity,
      validateStatus: () => true,
    }
  );

  if (resposta.status !== 201 && resposta.status !== 200) {
    const detalhe = resposta.data?.message || resposta.data?.error || resposta.data?.detail || '';
    const err = new Error(`Falha ao enviar foto para o CompreFace (HTTP ${resposta.status}). ${detalhe}`.trim());
    err.statusCode = 502;
    throw err;
  }

  return {
    imageId: resposta.data?.image_id || null,
    subject: resposta.data?.subject || subjectNormalizado,
  };
}

async function renomearSubject(subjectAtual, novoSubject) {
  const atual = normalizarSubject(subjectAtual);
  const novo = normalizarSubject(novoSubject);

  if (atual === novo) {
    return { updated: false };
  }

  const resposta = await axios.put(
    `${ENDPOINT_SUBJECTS}/${encodeURIComponent(atual)}`,
    { subject: novo },
    {
      headers: {
        ...getHeadersExtra(),
        'Content-Type': 'application/json',
      },
      timeout: config.COMPREFACE_TIMEOUT_MS,
      validateStatus: () => true,
    }
  );

  if (resposta.status === 200) {
    return { updated: Boolean(resposta.data?.updated) };
  }

  if (resposta.status === 404) {
    return { updated: false, notFound: true };
  }

  const err = new Error(`Falha ao renomear subject no CompreFace (HTTP ${resposta.status}).`);
  err.statusCode = 502;
  throw err;
}

async function listarFacesPorSubject(subject, page = 0, size = 20) {
  const subjectNormalizado = normalizarSubject(subject);
  const resposta = await axios.get(ENDPOINT_FACES, {
    headers: getHeadersExtra(),
    params: {
      subject: subjectNormalizado,
      page,
      size,
    },
    timeout: config.COMPREFACE_TIMEOUT_MS,
    validateStatus: () => true,
  });

  if (resposta.status !== 200) {
    const err = new Error(`Falha ao listar faces no CompreFace (HTTP ${resposta.status}).`);
    err.statusCode = 502;
    throw err;
  }

  return {
    faces: Array.isArray(resposta.data?.faces) ? resposta.data.faces : [],
    pageNumber: Number(resposta.data?.page_number || 0),
    pageSize: Number(resposta.data?.page_size || size),
    totalPages: Number(resposta.data?.total_pages || 0),
    totalElements: Number(resposta.data?.total_elements || 0),
  };
}

async function deletarFacesPorSubject(subject) {
  const subjectNormalizado = normalizarSubject(subject);
  const resposta = await axios.delete(ENDPOINT_FACES, {
    headers: getHeadersExtra(),
    params: { subject: subjectNormalizado },
    timeout: config.COMPREFACE_TIMEOUT_MS,
    validateStatus: () => true,
  });

  if (resposta.status !== 200) {
    const err = new Error(`Falha ao deletar faces do subject no CompreFace (HTTP ${resposta.status}).`);
    err.statusCode = 502;
    throw err;
  }

  return { deleted: Number(resposta.data?.deleted || 0) };
}

async function deletarFacePorId(imageId) {
  const resposta = await axios.delete(`${ENDPOINT_FACES}/${encodeURIComponent(imageId)}`, {
    headers: getHeadersExtra(),
    timeout: config.COMPREFACE_TIMEOUT_MS,
    validateStatus: () => true,
  });

  if (resposta.status === 404) {
    return { deleted: false, notFound: true };
  }

  if (resposta.status !== 200) {
    const err = new Error(`Falha ao deletar face do CompreFace (HTTP ${resposta.status}).`);
    err.statusCode = 502;
    throw err;
  }

  return {
    deleted: true,
    imageId: resposta.data?.image_id || imageId,
    subject: resposta.data?.subject || null,
  };
}

async function deletarSubject(subject) {
  const subjectNormalizado = normalizarSubject(subject);
  const resposta = await axios.delete(`${ENDPOINT_SUBJECTS}/${encodeURIComponent(subjectNormalizado)}`, {
    headers: {
      ...getHeadersExtra(),
      'Content-Type': 'application/json',
    },
    timeout: config.COMPREFACE_TIMEOUT_MS,
    validateStatus: () => true,
  });

  if (resposta.status === 404) {
    return { deleted: false, notFound: true };
  }

  if (resposta.status !== 200) {
    const err = new Error(`Falha ao deletar subject no CompreFace (HTTP ${resposta.status}).`);
    err.statusCode = 502;
    throw err;
  }

  return {
    deleted: true,
    subject: resposta.data?.subject || subjectNormalizado,
  };
}

async function baixarImagemFace(imageId) {
  const resposta = await axios.get(`${ENDPOINT_STATIC}/${encodeURIComponent(imageId)}`, {
    responseType: 'arraybuffer',
    timeout: config.COMPREFACE_TIMEOUT_MS,
    validateStatus: () => true,
  });

  if (resposta.status !== 200) {
    const err = new Error(`Falha ao baixar imagem do CompreFace (HTTP ${resposta.status}).`);
    err.statusCode = resposta.status === 404 ? 404 : 502;
    throw err;
  }

  return {
    contentType: resposta.headers['content-type'] || 'application/octet-stream',
    buffer: Buffer.from(resposta.data),
  };
}

module.exports = {
  reconhecer,
  garantirSubject,
  enviarFaceParaSubject,
  renomearSubject,
  listarFacesPorSubject,
  deletarFacesPorSubject,
  deletarFacePorId,
  deletarSubject,
  baixarImagemFace,
};
