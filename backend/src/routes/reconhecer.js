'use strict';

/**
 * Registro central das rotas HTTP da aplicação.
 *
 * Este arquivo organiza os endpoints por domínio funcional (auth, reconhecimento, auditoria,
 * sessões, usuários e painel admin), aplicando middlewares de autenticação, autorização e upload.
 */

const express = require('express');
const controller = require('../controllers/reconhecerController');
const adminController = require('../controllers/adminController');
const config = require('../config/env');
const { upload, tratarErroUpload } = require('../middleware/upload');
const { autenticar, autorizar } = require('../middleware/auth');

const router = express.Router();

router.post('/auth/login', controller.login);
if (config.ALLOW_BOOTSTRAP_ADMIN) {
  router.post('/auth/bootstrap-admin', controller.bootstrapAdmin);
}

// Endpoint público — sem autenticação
router.get('/config/publica', adminController.obterConfigPublica);

router.use(autenticar);
router.get('/auth/me', controller.me);
router.post('/auth/logout', controller.logout);
router.post('/auth/alterar-senha', controller.alterarMinhaSenhaPrimeiroAcesso);

router.post(
  '/reconhecer',
  autorizar(['admin', 'gestor', 'instrutor', 'colaborador']),
  upload.single('file'),
  tratarErroUpload,
  controller.reconhecer,
);

router.get('/presencas', autorizar(['admin', 'gestor', 'instrutor']), controller.listarPresencas);
router.get('/auditoria/imagens/:presencaId', autorizar(['admin', 'gestor', 'instrutor']), controller.obterImagemAuditoria);
router.get('/auditoria/registros', autorizar(['admin', 'gestor', 'instrutor']), controller.listarAuditoria);
router.get('/auditoria/registros/export/pdf', autorizar(['admin', 'gestor', 'instrutor']), controller.exportarAuditoriaPdf);
router.get('/auditoria/registros/export/excel', autorizar(['admin', 'gestor', 'instrutor']), controller.exportarAuditoriaExcel);
router.get('/sessoes', autorizar(['admin', 'gestor', 'instrutor', 'colaborador']), controller.listarSessoes);
router.post('/sessoes', autorizar(['admin', 'instrutor']), controller.criarSessao);
router.post('/sessoes/:id/iniciar', autorizar(['admin', 'instrutor']), controller.iniciarSessao);
router.post('/sessoes/:id/encerrar', autorizar(['admin', 'instrutor']), controller.encerrarSessao);
router.patch('/sessoes/:id/checkout', autorizar(['admin', 'instrutor']), controller.atualizarCheckoutSessao);
router.get('/sessoes/:id/acompanhamento', autorizar(['admin', 'gestor', 'instrutor', 'colaborador']), controller.listarAcompanhamentoSessao);
router.get('/sessoes/:id/acompanhamento/export/pdf', autorizar(['admin', 'gestor', 'instrutor']), controller.exportarAcompanhamentoSessaoPdf);
router.get('/sessoes/:id/acompanhamento/export/excel', autorizar(['admin', 'gestor', 'instrutor']), controller.exportarAcompanhamentoSessaoExcel);

router.get('/setores', autorizar(['admin', 'gestor', 'instrutor']), controller.listarSetores);
router.get('/usuarios', autorizar(['admin', 'gestor']), controller.listarUsuarios);
router.post(
  '/usuarios',
  autorizar(['admin']),
  upload.array('fotos', 10),
  tratarErroUpload,
  controller.criarUsuario
);
router.get('/usuarios/:id/face-collection', autorizar(['admin']), controller.listarColecaoFacialUsuario);
router.post(
  '/usuarios/:id/face-collection/fotos',
  autorizar(['admin']),
  upload.array('fotos', 10),
  tratarErroUpload,
  controller.adicionarFotosColecaoUsuario
);
router.delete('/usuarios/:id/face-collection', autorizar(['admin']), controller.limparColecaoFacialUsuario);
router.delete('/usuarios/:id/face-collection/:imageId', autorizar(['admin']), controller.deletarFaceColecaoUsuario);
router.put('/usuarios/:id', autorizar(['admin']), controller.atualizarUsuario);
router.patch('/usuarios/:id/perfil', autorizar(['admin']), controller.atualizarPerfilUsuario);
router.delete('/usuarios/:id', autorizar(['admin']), controller.desativarUsuario);
router.get('/faces/:faceId/img', autorizar(['admin']), controller.baixarImagemFace);

// ─── Painel Admin ─────────────────────────────────────────────────────────────
router.get('/admin/configuracoes',  autorizar(['admin']), adminController.listarConfiguracoes);
router.put('/admin/configuracoes',  autorizar(['admin']), adminController.atualizarConfiguracoes);

router.get('/tipos-sessao',    autorizar(['admin', 'gestor', 'instrutor', 'colaborador']), adminController.listarTiposSessao);
router.post('/tipos-sessao',   autorizar(['admin']), adminController.criarTipoSessao);
router.put('/tipos-sessao/:id', autorizar(['admin']), adminController.atualizarTipoSessao);
router.delete('/tipos-sessao/:id', autorizar(['admin']), adminController.deletarTipoSessao);

module.exports = router;
