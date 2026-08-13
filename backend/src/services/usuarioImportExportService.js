'use strict';

const JSZip = require('jszip');
const db = require('../config/database');

const EXPORT_VERSION = 1;

function criarErro(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function normalizarTextoOpcional(valor) {
  const texto = String(valor || '').trim();
  return texto || null;
}

function normalizarBoolean(valor, padrao = false) {
  if (valor === undefined || valor === null || valor === '') return Boolean(padrao);
  if (typeof valor === 'boolean') return valor;
  return ['1', 'true', 'sim', 'on'].includes(String(valor).trim().toLowerCase());
}

function validarSenhaHash(hash) {
  const valor = normalizarTextoOpcional(hash);
  if (!valor) return null;
  const partes = valor.split('$');
  if (partes.length !== 4 || partes[0] !== 'pbkdf2') {
    throw criarErro('Arquivo contem senha_hash invalido.');
  }
  return valor;
}

function validarEmbedding(embedding) {
  if (embedding === null || embedding === undefined) return null;
  if (
    !Array.isArray(embedding) ||
    embedding.length !== 128 ||
    embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value))
  ) {
    throw criarErro('Arquivo contem embedding facial invalido.');
  }
  return embedding;
}

async function obterOuCriarSetor(client, nome) {
  const setor = normalizarTextoOpcional(nome);
  if (!setor) return null;

  const result = await client.query(
    `INSERT INTO setores (nome)
     VALUES ($1)
     ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
     RETURNING id`,
    [setor]
  );
  return result.rows[0]?.id || null;
}

async function listarUsuariosExportacao() {
  const result = await db.query(
    `SELECT u.id,
            u.nome_completo,
            u.cpf,
            u.usuario,
            u.senha_hash,
            u.perfil_acesso,
            u.ativo,
            u.gestor_id,
            gestor.usuario AS gestor_usuario,
            gestor.cpf AS gestor_cpf,
            gestor.nome_completo AS gestor_nome_completo,
            u.setor_id,
            setor.nome AS setor,
            u.reset_senha_primeiro_acesso,
            u.criado_em,
            u.atualizado_em,
            u.ultimo_login_em
     FROM usuarios u
     LEFT JOIN usuarios gestor ON gestor.id = u.gestor_id
     LEFT JOIN setores setor ON setor.id = u.setor_id
     ORDER BY u.id ASC`
  );
  return result.rows;
}

async function listarFacesExportacao() {
  const result = await db.query(
    `SELECT id,
            usuario_id,
            face,
            embedding,
            content_type,
            atualizado_em
     FROM usuarios_faces
     ORDER BY usuario_id ASC, id ASC`
  );
  return result.rows;
}

async function exportarUsuariosZip() {
  const [usuarios, faces] = await Promise.all([
    listarUsuariosExportacao(),
    listarFacesExportacao(),
  ]);

  const zip = new JSZip();
  const facesPorUsuario = new Map();

  for (const face of faces) {
    if (!facesPorUsuario.has(face.usuario_id)) {
      facesPorUsuario.set(face.usuario_id, []);
    }
    const extensao = String(face.content_type || '').includes('png')
      ? 'png'
      : String(face.content_type || '').includes('webp')
        ? 'webp'
        : 'jpg';
    const caminho = `faces/usuario-${face.usuario_id}/face-${face.id}.${extensao}`;
    zip.file(caminho, face.face);
    facesPorUsuario.get(face.usuario_id).push({
      id: face.id,
      path: caminho,
      content_type: face.content_type || 'image/jpeg',
      embedding: face.embedding || null,
      atualizado_em: face.atualizado_em,
    });
  }

  const payload = {
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    warning: 'Arquivo sensivel: contem senha_hash e fotos dos usuarios.',
    usuarios: usuarios.map((usuario) => ({
      ...usuario,
      faces: facesPorUsuario.get(usuario.id) || [],
    })),
  };

  zip.file('usuarios.json', JSON.stringify(payload, null, 2));
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return {
    buffer,
    filename: `usuarios_export_${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}.zip`,
    totalUsuarios: usuarios.length,
    totalFaces: faces.length,
  };
}

async function encontrarUsuarioExistente(client, usuario) {
  const login = normalizarTextoOpcional(usuario.usuario);
  const cpf = normalizarTextoOpcional(usuario.cpf);

  if (login) {
    const result = await client.query('SELECT id FROM usuarios WHERE LOWER(usuario) = LOWER($1) LIMIT 1', [login]);
    if (result.rows.length > 0) return result.rows[0].id;
  }

  if (cpf) {
    const result = await client.query('SELECT id FROM usuarios WHERE cpf = $1 LIMIT 1', [cpf]);
    if (result.rows.length > 0) return result.rows[0].id;
  }

  const originalId = Number(usuario.id);
  if (Number.isInteger(originalId) && originalId > 0) {
    const result = await client.query('SELECT id FROM usuarios WHERE id = $1 LIMIT 1', [originalId]);
    if (result.rows.length > 0) return result.rows[0].id;
  }

  return null;
}

async function inserirUsuario(client, usuario, setorId) {
  const originalId = Number(usuario.id);
  const idDisponivel = Number.isInteger(originalId) && originalId > 0
    ? (await client.query('SELECT id FROM usuarios WHERE id = $1', [originalId])).rows.length === 0
    : false;

  const colunas = [
    'nome_completo',
    'cpf',
    'usuario',
    'senha_hash',
    'perfil_acesso',
    'ativo',
    'reset_senha_primeiro_acesso',
    'setor_id',
  ];
  const valores = [
    normalizarTextoOpcional(usuario.nome_completo),
    normalizarTextoOpcional(usuario.cpf),
    normalizarTextoOpcional(usuario.usuario),
    validarSenhaHash(usuario.senha_hash),
    normalizarTextoOpcional(usuario.perfil_acesso) || 'colaborador',
    normalizarBoolean(usuario.ativo, true),
    normalizarBoolean(usuario.reset_senha_primeiro_acesso, false),
    setorId,
  ];

  if (!valores[0] || !valores[2] || !valores[3]) {
    throw criarErro('Usuario importado sem nome_completo, usuario ou senha_hash.');
  }

  if (idDisponivel) {
    colunas.unshift('id');
    valores.unshift(originalId);
  }

  const placeholders = valores.map((_, index) => `$${index + 1}`).join(', ');
  const result = await client.query(
    `INSERT INTO usuarios (${colunas.join(', ')})
     VALUES (${placeholders})
     RETURNING id`,
    valores
  );
  return result.rows[0].id;
}

async function atualizarUsuarioImportado(client, id, usuario, setorId) {
  await client.query(
    `UPDATE usuarios
     SET nome_completo = $1,
         cpf = $2,
         usuario = $3,
         senha_hash = $4,
         perfil_acesso = $5,
         ativo = $6,
         reset_senha_primeiro_acesso = $7,
         setor_id = $8,
         atualizado_em = CURRENT_TIMESTAMP
     WHERE id = $9`,
    [
      normalizarTextoOpcional(usuario.nome_completo),
      normalizarTextoOpcional(usuario.cpf),
      normalizarTextoOpcional(usuario.usuario),
      validarSenhaHash(usuario.senha_hash),
      normalizarTextoOpcional(usuario.perfil_acesso) || 'colaborador',
      normalizarBoolean(usuario.ativo, true),
      normalizarBoolean(usuario.reset_senha_primeiro_acesso, false),
      setorId,
      id,
    ]
  );
}

async function importarFacesUsuario(client, zip, usuarioId, faces = []) {
  await client.query('DELETE FROM usuarios_faces WHERE usuario_id = $1', [usuarioId]);

  let total = 0;
  for (const face of faces) {
    const arquivo = zip.file(face.path);
    if (!arquivo) {
      throw criarErro(`Foto ausente no ZIP: ${face.path}`);
    }
    const buffer = await arquivo.async('nodebuffer');
    await client.query(
      `INSERT INTO usuarios_faces (usuario_id, face, embedding, content_type, atualizado_em)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [
        usuarioId,
        buffer,
        validarEmbedding(face.embedding),
        normalizarTextoOpcional(face.content_type) || 'image/jpeg',
      ]
    );
    total += 1;
  }
  return total;
}

async function resolverGestorImportado(client, idMap, usuario) {
  const gestorOriginal = Number(usuario.gestor_id);
  if (Number.isInteger(gestorOriginal) && gestorOriginal > 0 && idMap.has(gestorOriginal)) {
    return idMap.get(gestorOriginal);
  }

  const gestorUsuario = normalizarTextoOpcional(usuario.gestor_usuario);
  if (gestorUsuario) {
    const result = await client.query(
      'SELECT id FROM usuarios WHERE LOWER(usuario) = LOWER($1) LIMIT 1',
      [gestorUsuario]
    );
    if (result.rows.length > 0) return result.rows[0].id;
  }

  const gestorCpf = normalizarTextoOpcional(usuario.gestor_cpf);
  if (gestorCpf) {
    const result = await client.query('SELECT id FROM usuarios WHERE cpf = $1 LIMIT 1', [gestorCpf]);
    if (result.rows.length > 0) return result.rows[0].id;
  }

  return null;
}

async function importarUsuariosZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw criarErro('Arquivo de importacao invalido.');
  }

  const zip = await JSZip.loadAsync(buffer);
  const manifestFile = zip.file('usuarios.json');
  if (!manifestFile) {
    throw criarErro('ZIP sem usuarios.json.');
  }

  let payload;
  try {
    payload = JSON.parse(await manifestFile.async('string'));
  } catch (err) {
    throw criarErro(`usuarios.json invalido: ${err.message}`);
  }
  if (!Array.isArray(payload.usuarios)) {
    throw criarErro('usuarios.json invalido: campo usuarios deve ser um array.');
  }

  const client = await db.getClient();
  const idMap = new Map();
  let criados = 0;
  let atualizados = 0;
  let facesImportadas = 0;

  try {
    await client.query('BEGIN');

    for (const usuario of payload.usuarios) {
      const setorId = await obterOuCriarSetor(client, usuario.setor);
      const existenteId = await encontrarUsuarioExistente(client, usuario);
      let usuarioId;

      if (existenteId) {
        usuarioId = existenteId;
        await atualizarUsuarioImportado(client, usuarioId, usuario, setorId);
        atualizados += 1;
      } else {
        usuarioId = await inserirUsuario(client, usuario, setorId);
        criados += 1;
      }

      idMap.set(Number(usuario.id), usuarioId);
    }

    for (const usuario of payload.usuarios) {
      const usuarioId = idMap.get(Number(usuario.id));
      if (!usuarioId) continue;

      const gestorId = await resolverGestorImportado(client, idMap, usuario);
      await client.query(
        'UPDATE usuarios SET gestor_id = $1 WHERE id = $2',
        [gestorId && gestorId !== usuarioId ? gestorId : null, usuarioId]
      );

      facesImportadas += await importarFacesUsuario(client, zip, usuarioId, usuario.faces || []);
    }

    await client.query(
      `SELECT setval(
         pg_get_serial_sequence('usuarios', 'id'),
         COALESCE((SELECT MAX(id) FROM usuarios), 1),
         (SELECT COUNT(*) > 0 FROM usuarios)
       )`
    );
    await client.query(
      `SELECT setval(
         pg_get_serial_sequence('usuarios_faces', 'id'),
         COALESCE((SELECT MAX(id) FROM usuarios_faces), 1),
         (SELECT COUNT(*) > 0 FROM usuarios_faces)
       )`
    );

    await client.query('COMMIT');
    return {
      total: payload.usuarios.length,
      criados,
      atualizados,
      faces: facesImportadas,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  exportarUsuariosZip,
  importarUsuariosZip,
};
