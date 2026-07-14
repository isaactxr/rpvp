'use strict';

/**
 * Controller principal da aplicação.
 *
 * Concentra os handlers HTTP ligados a autenticação, reconhecimento facial, auditoria,
 * sessões e usuários, delegando as regras de negócio para a camada de serviços.
 */
const compreFaceService = require('../services/compreFaceService');
const faceRecognitionService = require('../services/faceRecognitionService');
const usuarioFaceService = require('../services/usuarioFaceService');
const presencaService = require('../services/presencaService');
const auditImageService = require('../services/auditImageService');
const sessaoService = require('../services/sessaoService');
const sessaoExportService = require('../services/sessaoExportService');
const usuarioService = require('../services/usuarioService');
const authService = require('../services/authService');
const auditoriaService = require('../services/auditoriaService');
const auditoriaExportService = require('../services/auditoriaExportService');

function responderErro(res, err, fallback) {
  console.error(`[controller] ${fallback}: ${err.message}`);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || fallback,
  });
}

const TIMEZONE_PADRAO = 'America/Sao_Paulo';

function obterDataHojeLocal() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_PADRAO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return `${partes.year}-${partes.month}-${partes.day}`;
}

function montarFotoUrlAuditoria(presencaId, temImagem) {
  if (!temImagem || !presencaId) return null;
  return `/auditoria/imagens/${encodeURIComponent(presencaId)}`;
}

async function login(req, res) {
  try {
    const resultado = await authService.login(req.body?.usuario, req.body?.senha);
    res.json({ success: true, ...resultado });
  } catch (err) {
    responderErro(res, err, 'Erro ao autenticar usuário.');
  }
}

async function bootstrapAdmin(req, res) {
  try {
    const admin = await authService.bootstrapAdmin(req.body || {});
    res.status(201).json({
      success: true,
      data: admin,
      message: 'Admin inicial criado com sucesso. Faça login para continuar.',
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao executar bootstrap de admin.');
  }
}

async function me(req, res) {
  res.json({ success: true, user: req.auth.user, expiraEm: req.auth.expiraEm });
}

async function logout(req, res) {
  await authService.logout(req.auth.token);
  res.json({ success: true, message: 'Sessão encerrada.' });
}

async function alterarMinhaSenhaPrimeiroAcesso(req, res) {
  try {
    const usuario = await authService.alterarSenhaPrimeiroAcesso(req.auth.user.id, req.body?.novaSenha);
    res.json({
      success: true,
      message: 'Senha alterada com sucesso. A exigência de troca no primeiro acesso foi removida.',
      data: usuario,
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao alterar senha no primeiro acesso.');
  }
}

/**
 * Endpoint central do reconhecimento facial.
 *
 * Recebe a imagem enviada pelo navegador, consulta o motor facial, tenta gerar a imagem auditada
 * e delega ao `presencaService` a decisão final de check-in/check-out.
 */
async function reconhecer(req, res) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      reconhecido: false,
      message: 'Nenhuma imagem recebida. Envie o campo "file" como multipart/form-data.',
    });
  }

  const { buffer, mimetype, originalname } = req.file;
  const sessaoId = presencaService.normalizarSessaoId(req.body?.sessaoId);
  const tipoRegistro = String(req.body?.tipoRegistro || 'auto').toLowerCase();

  if (!sessaoId) {
    return res.status(400).json({
      success: false,
      reconhecido: false,
      message: 'Selecione uma sessão para realizar a verificação de presença',
    });
  }

  console.log(
    `[reconhecer] Imagem recebida :: ${originalname ?? 'face.jpg'} | ` +
    `${mimetype} | ${(buffer.length / 1024).toFixed(1)} KB | tipo=${tipoRegistro}`
  );

  let resultado;
  try {
    const candidates = await usuarioFaceService.listarCandidatosReconhecimento();
    resultado = await faceRecognitionService.recognizeImage({
      buffer,
      mimetype,
      originalname,
      candidates,
    });
  } catch (err) {
    console.error(`[reconhecer] Erro ao consultar motor facial: ${err.message}`);
    return res.status(err.statusCode === 422 ? 422 : 502).json({
      success: false,
      reconhecido: false,
      message: err.statusCode === 422
        ? err.message
        : 'Serviço de reconhecimento indisponível. Tente novamente.',
    });
  }

  if (!resultado.reconhecido || !resultado.usuarioId) {
    return res.status(200).json({
      success: false,
      reconhecido: false,
      message: 'Não reconhecido',
    });
  }

  const usuarioReconhecido = await usuarioService.obterUsuarioPorId(resultado.usuarioId);
  const subject = usuarioReconhecido.subject_compreface || usuarioReconhecido.nome_completo;
  const similarity = resultado.distance === null ? null : Math.max(0, 1 - resultado.distance);

  let imagemAuditada = null;
  let avisoImagemAuditoria = null;
  let tipoSessaoWatermark = 'SESSAO';

  try {
    const sessao = await sessaoService.obterSessaoPorId(sessaoId);
    tipoSessaoWatermark = String(sessao?.tipo_sessao || sessao?.nome || 'SESSAO').trim() || 'SESSAO';
  } catch (err) {
    console.warn(`[reconhecer] Falha ao buscar tipo da sessão para watermark: ${err.message}`);
  }

  try {
    imagemAuditada = await auditImageService.adicionarWatermark(buffer, mimetype, tipoSessaoWatermark);
  } catch (err) {
    console.error(`[reconhecer] Erro ao processar imagem auditada: ${err.message}`);
    avisoImagemAuditoria = 'Não foi possível processar a imagem de auditoria nesta tentativa.';
  }

  try {
    const registro = await presencaService.registrarBatidaFacial({
      subject,
      similarity,
      imagemAuditada,
      sessaoId,
      tipoRegistro,
    });

    return res.status(200).json({
      success: true,
      reconhecido: true,
      message: registro.message,
      user: registro.nomeCompleto || subject,
      userId: registro.userId,
      sessaoId: registro.sessaoId,
      tipoRegistro: registro.tipo,
      status: registro.status,
      similarity: registro.similarity,
      horario: registro.horario,
      alerta: registro.alerta || null,
      tempoRestanteSegundos: registro.tempoRestanteSegundos || null,
      avisoImagemAuditoria,
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao registrar batida facial.');
  }
}

async function listarPresencas(req, res) {
  try {
    const listarTudo = String(req.query?.all || '').toLowerCase() === 'true';
    const lista = await presencaService.listarPresencas({
      all: listarTudo,
      nome: req.query?.nome,
      data: req.query?.data,
      sessaoId: req.query?.sessaoId,
    });

    const dataComUrl = lista.map((item) => ({
      ...item,
      foto_url: montarFotoUrlAuditoria(item.id, item.tem_imagem_auditoria),
    }));

    res.json({
      data: dataComUrl,
      total: dataComUrl.length,
      data_referencia: obterDataHojeLocal(),
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao listar presenças.');
  }
}

/**
 * Lista a auditoria consolidada já com filtros normalizados e URLs para consulta das imagens associadas.
 */
async function listarAuditoria(req, res) {
  try {
    const filtros = montarFiltrosAuditoria(req);
    const resultado = await auditoriaService.listarAuditoria(filtros);
    res.json({
      success: true,
      ...resultado,
      data: (resultado.data || []).map((item) => ({
        ...item,
        foto_url: montarFotoUrlAuditoria(item.presenca_id, item.tem_imagem_auditoria),
      })),
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao listar auditoria.');
  }
}

async function obterImagemAuditoria(req, res) {
  try {
    const gestorId = req.auth.user.perfil_acesso === 'gestor' ? req.auth.user.id : null;
    const tipoRegistro = req.query?.tipo;
    const imagem = await presencaService.obterImagemAuditoria(req.params.presencaId, gestorId, tipoRegistro);
    res.setHeader('Content-Type', imagem.content_type || 'image/jpeg');
    res.send(imagem.foto);
  } catch (err) {
    responderErro(res, err, 'Erro ao carregar imagem de auditoria.');
  }
}

function montarFiltrosAuditoria(req) {
  const filtros = {
    nome: req.query?.nome,
    dataInicio: req.query?.dataInicio,
    dataFim: req.query?.dataFim,
    instrutorId: req.query?.instrutorId,
    sessaoId: req.query?.sessaoId,
    tipoSessao: req.query?.tipoSessao,
    setor: req.query?.setor,
    status: req.query?.status,
    page: req.query?.page,
    pageSize: req.query?.pageSize,
  };

  if (req.auth.user.perfil_acesso === 'gestor') {
    filtros.gestorId = req.auth.user.id;
  }

  return filtros;
}

function montarTimestampArquivo() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_PADRAO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return `${partes.year}${partes.month}${partes.day}${partes.hour}${partes.minute}${partes.second}`;
}

async function exportarAuditoriaPdf(req, res) {
  try {
    const filtros = montarFiltrosAuditoria(req);
    const registros = await auditoriaService.listarAuditoriaParaExportacao(filtros);
    const layout = String(req.query?.layout || 'portrait').toLowerCase() === 'landscape' ? 'landscape' : 'portrait';
    const arquivo = await auditoriaExportService.gerarBufferPdf(registros, filtros, {
      geradoPor: req.auth?.user,
      layout,
    });
    const nome = `auditoria_${montarTimestampArquivo()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(arquivo);
  } catch (err) {
    responderErro(res, err, 'Erro ao exportar auditoria em PDF.');
  }
}

async function exportarAuditoriaExcel(req, res) {
  try {
    const filtros = montarFiltrosAuditoria(req);
    const registros = await auditoriaService.listarAuditoriaParaExportacao(filtros);
    const arquivo = await auditoriaExportService.gerarBufferExcel(registros, filtros);
    const nome = `auditoria_${montarTimestampArquivo()}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(Buffer.from(arquivo));
  } catch (err) {
    responderErro(res, err, 'Erro ao exportar auditoria em Excel.');
  }
}

async function listarSessoes(req, res) {
  try {
    const queryAtivo = String(req.query?.ativo || '').toLowerCase();
    const filtros = {
      data: req.query?.data,
      instrutorId: req.query?.instrutorId,
      tipoSessao: req.query?.tipoSessao,
      ativo: queryAtivo === 'true',
    };

    if (req.auth.user.perfil_acesso === 'instrutor') {
      filtros.instrutorId = req.auth.user.id;
    }

    const lista = await sessaoService.listarSessoes(filtros);
    res.json({ data: lista, total: lista.length });
  } catch (err) {
    responderErro(res, err, 'Erro ao listar sessões.');
  }
}

async function criarSessao(req, res) {
  try {
    const payload = { ...(req.body || {}) };
    payload.instrutorId = req.auth.user.id;

    const sessao = await sessaoService.criarSessao(payload);
    res.status(201).json({
      success: true,
      message: 'Sessão criada com sucesso.',
      data: sessao,
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao criar sessão.');
  }
}

async function iniciarSessao(req, res) {
  try {
    const sessao = await sessaoService.iniciarSessao(req.params.id, req.auth.user);
    res.json({
      success: true,
      message: 'Sessão iniciada com sucesso.',
      data: sessao,
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao iniciar sessão.');
  }
}

async function encerrarSessao(req, res) {
  try {
    const sessao = await sessaoService.encerrarSessao(req.params.id, req.auth.user);
    res.json({
      success: true,
      message: 'Sessão encerrada com sucesso.',
      data: sessao,
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao encerrar sessão.');
  }
}

async function atualizarCheckoutSessao(req, res) {
  try {
    const checkoutHabilitado = Boolean(req.body?.checkoutHabilitado);
    const sessao = await sessaoService.atualizarCheckoutSessao({
      sessaoId: req.params.id,
      checkoutHabilitado,
      user: req.auth.user,
    });

    res.json({
      success: true,
      message: checkoutHabilitado
        ? 'Check-out habilitado para esta sessão.'
        : 'Check-out desabilitado para esta sessão.',
      data: sessao,
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao atualizar checkout da sessão.');
  }
}

async function listarAcompanhamentoSessao(req, res) {
  try {
    const perfil = req.auth.user.perfil_acesso;
    const lista = await sessaoService.listarAcompanhamento(req.params.id, {
      gestorId: perfil === 'gestor' ? req.auth.user.id : null,
      colaboradorId: perfil === 'colaborador' ? req.auth.user.id : null,
    });

    const data = lista.map((item) => ({
      ...item,
      foto_checkin_url: item.tem_foto_checkin
        ? `/auditoria/imagens/${encodeURIComponent(item.presenca_id)}?tipo=checkin`
        : null,
      foto_checkout_url: item.tem_foto_checkout
        ? `/auditoria/imagens/${encodeURIComponent(item.presenca_id)}?tipo=checkout`
        : null,
    }));

    res.json({ success: true, data, total: data.length });
  } catch (err) {
    responderErro(res, err, 'Erro ao listar acompanhamento da sessão.');
  }
}

async function exportarAcompanhamentoSessaoPdf(req, res) {
  try {
    const perfil = req.auth.user.perfil_acesso;
    const layout = String(req.query?.layout || 'portrait').toLowerCase() === 'landscape' ? 'landscape' : 'portrait';
    const sessao = await sessaoService.obterSessaoPorId(req.params.id);
    const registros = await sessaoService.listarAcompanhamento(req.params.id, {
      gestorId: perfil === 'gestor' ? req.auth.user.id : null,
      colaboradorId: perfil === 'colaborador' ? req.auth.user.id : null,
    });

    const arquivo = await sessaoExportService.gerarBufferPdf({
      sessao,
      registros,
      geradoPor: req.auth?.user,
      layout,
    });
    const nome = `sessao_${req.params.id}_presenca_${montarTimestampArquivo()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(arquivo);
  } catch (err) {
    responderErro(res, err, 'Erro ao exportar lista de presença em PDF.');
  }
}

async function exportarAcompanhamentoSessaoExcel(req, res) {
  try {
    const perfil = req.auth.user.perfil_acesso;
    const sessao = await sessaoService.obterSessaoPorId(req.params.id);
    const registros = await sessaoService.listarAcompanhamento(req.params.id, {
      gestorId: perfil === 'gestor' ? req.auth.user.id : null,
      colaboradorId: perfil === 'colaborador' ? req.auth.user.id : null,
    });

    const arquivo = await sessaoExportService.gerarBufferExcel({ sessao, registros });
    const nome = `sessao_${req.params.id}_presenca_${montarTimestampArquivo()}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(Buffer.from(arquivo));
  } catch (err) {
    responderErro(res, err, 'Erro ao exportar lista de presença em Excel.');
  }
}

async function listarSetores(req, res) {
  try {
    const lista = await usuarioService.listarSetores();
    res.json({ data: lista, total: lista.length });
  } catch (err) {
    responderErro(res, err, 'Erro ao listar setores.');
  }
}

async function listarUsuarios(req, res) {
  try {
    const filtros = {
      perfil: req.query?.perfil,
      ativo: req.query?.ativo,
      busca: req.query?.busca,
      gestorId: req.query?.gestorId,
    };

    if (req.auth.user.perfil_acesso === 'gestor') {
      filtros.gestorId = req.auth.user.id;
    }

    const lista = await usuarioService.listarUsuarios(filtros);
    res.json({ data: lista, total: lista.length, perfis: usuarioService.PERFIS_ACESSO });
  } catch (err) {
    responderErro(res, err, 'Erro ao listar usuários.');
  }
}

/**
 * Cria um usuário no banco e, quando houver arquivos anexados, envia as fotos para a coleção facial do CompreFace.
 */
async function criarUsuario(req, res) {
  try {
    const usuario = await usuarioService.criarUsuario(req.body || {});
    const arquivos = Array.isArray(req.files) ? req.files : [];
    const subject = String(usuario.subject_compreface || '').trim();

    let compreface = null;
    if (subject) {
      await compreFaceService.garantirSubject(subject);

      const uploads = [];
      for (const arquivo of arquivos) {
        const enviado = await compreFaceService.enviarFaceParaSubject(subject, arquivo);
        uploads.push(enviado);
      }

      compreface = {
        subject,
        fotosEnviadas: uploads.length,
        imagens: uploads,
      };
    }

    res.status(201).json({
      success: true,
      data: usuario,
      compreface,
      message: arquivos.length > 0
        ? 'Usuário criado e fotos enviadas para o CompreFace.'
        : 'Usuário criado com sucesso.',
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao criar usuário.');
  }
}

async function atualizarUsuario(req, res) {
  try {
    const usuarioId = Number(req.params.id);
    const atual = await usuarioService.obterUsuarioPorId(usuarioId);
    const usuario = await usuarioService.atualizarUsuario(usuarioId, req.body || {});

    if (atual.subject_compreface && usuario.subject_compreface && atual.subject_compreface !== usuario.subject_compreface) {
      await compreFaceService.renomearSubject(atual.subject_compreface, usuario.subject_compreface);
    }

    res.json({ success: true, data: usuario, message: 'Usuário atualizado com sucesso.' });
  } catch (err) {
    responderErro(res, err, 'Erro ao atualizar usuário.');
  }
}

async function atualizarPerfilUsuario(req, res) {
  try {
    const usuarioId = Number(req.params.id);
    const usuario = await usuarioService.atualizarPerfil(usuarioId, req.body?.perfil);

    res.json({
      success: true,
      message: 'Perfil atualizado com sucesso.',
      data: usuario,
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao atualizar perfil.');
  }
}

async function desativarUsuario(req, res) {
  try {
    const usuarioId = Number(req.params.id);
    const hardDelete = String(req.query?.hard || '').toLowerCase() === 'true';

    if (hardDelete) {
      const usuarioAtual = await usuarioService.obterUsuarioPorId(usuarioId);

      if (usuarioAtual.subject_compreface) {
        await compreFaceService.deletarSubject(usuarioAtual.subject_compreface).catch((err) => {
          if (err.statusCode === 404) return null;
          throw err;
        });
      }

      const usuario = await usuarioService.excluirUsuario(usuarioId);
      res.json({ success: true, data: usuario, message: 'Usuário excluído definitivamente e removido do CompreFace.' });
      return;
    }

    const usuario = await usuarioService.desativarUsuario(usuarioId);
    res.json({ success: true, data: usuario, message: 'Usuário desativado com sucesso.' });
  } catch (err) {
    responderErro(res, err, 'Erro ao desativar usuário.');
  }
}

async function listarColecaoFacialUsuario(req, res) {
  try {
    const usuario = await usuarioService.obterUsuarioPorId(Number(req.params.id));
    const subject = String(usuario.subject_compreface || usuario.nome_completo || '').trim();

    const resultado = await compreFaceService.listarFacesPorSubject(subject);

    res.json({
      success: true,
      subject,
      data: resultado.faces.map((face) => {
        const imageId = String(face?.image_id || face?.imageId || face?.id || '').trim();
        return {
          ...face,
          image_id: imageId || null,
          foto_url: imageId
            ? `/compreface/faces/${encodeURIComponent(imageId)}/img`
            : null,
        };
      }),
      pagination: {
        pageNumber: resultado.pageNumber,
        pageSize: resultado.pageSize,
        totalPages: resultado.totalPages,
        totalElements: resultado.totalElements,
      },
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao listar coleção facial do usuário.');
  }
}

async function adicionarFotosColecaoUsuario(req, res) {
  try {
    const usuario = await usuarioService.obterUsuarioPorId(Number(req.params.id));
    const subject = String(usuario.subject_compreface || usuario.nome_completo || '').trim();
    const arquivos = Array.isArray(req.files) ? req.files : [];

    if (arquivos.length === 0) {
      const err = new Error('Envie ao menos uma foto.');
      err.statusCode = 400;
      throw err;
    }

    await compreFaceService.garantirSubject(subject);

    const imagens = [];
    for (const arquivo of arquivos) {
      imagens.push(await compreFaceService.enviarFaceParaSubject(subject, arquivo));
    }

    res.status(201).json({
      success: true,
      subject,
      total: imagens.length,
      data: imagens,
      message: `${imagens.length} foto(s) enviada(s) ao CompreFace.`,
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao adicionar fotos na coleção facial.');
  }
}

async function deletarFaceColecaoUsuario(req, res) {
  try {
    const resultado = await compreFaceService.deletarFacePorId(req.params.imageId);
    res.json({ success: true, data: resultado, message: 'Face removida do CompreFace.' });
  } catch (err) {
    responderErro(res, err, 'Erro ao remover face da coleção facial.');
  }
}

async function limparColecaoFacialUsuario(req, res) {
  try {
    const usuario = await usuarioService.obterUsuarioPorId(Number(req.params.id));
    const subject = String(usuario.subject_compreface || usuario.nome_completo || '').trim();
    const resultado = await compreFaceService.deletarFacesPorSubject(subject);
    res.json({ success: true, subject, ...resultado, message: 'Coleção facial removida do CompreFace.' });
  } catch (err) {
    responderErro(res, err, 'Erro ao limpar coleção facial do usuário.');
  }
}

async function baixarImagemFaceCompreface(req, res) {
  try {
    const imagem = await compreFaceService.baixarImagemFace(req.params.imageId);
    res.setHeader('Content-Type', imagem.contentType);
    res.send(imagem.buffer);
  } catch (err) {
    responderErro(res, err, 'Erro ao baixar imagem da coleção facial.');
  }
}

module.exports = {
  bootstrapAdmin,
  login,
  me,
  logout,
  alterarMinhaSenhaPrimeiroAcesso,
  reconhecer,
  listarPresencas,
  listarAuditoria,
  obterImagemAuditoria,
  listarSessoes,
  criarSessao,
  iniciarSessao,
  encerrarSessao,
  atualizarCheckoutSessao,
  listarAcompanhamentoSessao,
  exportarAcompanhamentoSessaoPdf,
  exportarAcompanhamentoSessaoExcel,
  listarSetores,
  listarUsuarios,
  criarUsuario,
  atualizarUsuario,
  desativarUsuario,
  atualizarPerfilUsuario,
  exportarAuditoriaPdf,
  exportarAuditoriaExcel,
  listarColecaoFacialUsuario,
  adicionarFotosColecaoUsuario,
  deletarFaceColecaoUsuario,
  limparColecaoFacialUsuario,
  baixarImagemFaceCompreface,
};
