'use strict';

/**
 * Módulo administrativo de usuários e coleção facial.
 *
 * Controla o cadastro, a atualização de perfis, o reset de senha e a sincronização das
 * imagens faciais enviadas para cada usuário selecionado.
 */
const PERFIS = ['admin', 'gestor', 'instrutor', 'colaborador'];
const SETOR_SEM_NOME = 'Sem setor';
const collatorPtBr = new Intl.Collator('pt-BR', { usage: 'sort', sensitivity: 'variant' });

const usuariosStatusEl = document.getElementById('usuariosStatus');
const refreshBtn = document.getElementById('refreshBtn');
const openCadastroModalBtn = document.getElementById('openCadastroModalBtn');
const usuariosSearchEl = document.getElementById('usuariosSearch');
const subjectsListEl = document.getElementById('subjectsList');
const voltarSetoresBtn = document.getElementById('voltarSetoresBtn');
const usuarioSelecionadoStatusEl = document.getElementById('usuarioSelecionadoStatus');

const usuarioAdminFormEl = document.getElementById('usuarioAdminForm');
const adminNomeEl = document.getElementById('adminNome');
const adminCpfEl = document.getElementById('adminCpf');
const adminUsuarioEl = document.getElementById('adminUsuario');
const adminPerfilEl = document.getElementById('adminPerfil');
const adminAtivoEl = document.getElementById('adminAtivo');
const adminGestorEl = document.getElementById('adminGestor');
const adminSetorEl = document.getElementById('adminSetor');
const adminSalvarBtn = document.getElementById('adminSalvarBtn');
const adminResetSenhaBtn = document.getElementById('adminResetSenhaBtn');
const adminExcluirBtn = document.getElementById('adminExcluirBtn');

const cadastroModalEl = document.getElementById('cadastroModal');
const closeCadastroModalBtn = document.getElementById('closeCadastroModalBtn');
const resetSenhaModalEl = document.getElementById('resetSenhaModal');
const closeResetSenhaModalBtn = document.getElementById('closeResetSenhaModalBtn');
const resetSenhaFormEl = document.getElementById('resetSenhaForm');
const resetNovaSenhaEl = document.getElementById('resetNovaSenha');
const resetConfirmarNovaSenhaEl = document.getElementById('resetConfirmarNovaSenha');
const resetPrimeiroAcessoModalEl = document.getElementById('resetPrimeiroAcessoModal');
const confirmarResetSenhaBtn = document.getElementById('confirmarResetSenhaBtn');
const resetSenhaUsuarioNomeEl = document.getElementById('resetSenhaUsuarioNome');
const resetSenhaDescricaoEl = document.getElementById('resetSenhaDescricao');
const usuarioForm = document.getElementById('usuarioForm');
const novoNomeEl = document.getElementById('novoNome');
const novoCpfEl = document.getElementById('novoCpf');
const novoUsuarioEl = document.getElementById('novoUsuario');
const novoSenhaEl = document.getElementById('novoSenha');
const novoResetPrimeiroAcessoEl = document.getElementById('novoResetPrimeiroAcesso');
const novoPerfilEl = document.getElementById('novoPerfil');
const novoGestorNomeEl = document.getElementById('novoGestorNome');
const novoGestorIdEl = document.getElementById('novoGestorId');
const novoGestorSugestoesEl = document.getElementById('novoGestorSugestoes');
const novoSetorEl = document.getElementById('novoSetor');
const novoSetorSugestoesEl = document.getElementById('novoSetorSugestoes');
const gestorLabelEl = document.getElementById('gestorLabel');
const setorLabelEl = document.getElementById('setorLabel');
const novasFotosEl = document.getElementById('novasFotos');
const criarUsuarioBtn = document.getElementById('criarUsuarioBtn');

const colecaoTituloEl = document.getElementById('colecaoTitulo');
const colecaoStatusEl = document.getElementById('colecaoStatus');
const colecaoGridEl = document.getElementById('colecaoGrid');
const colecaoFotosInputEl = document.getElementById('colecaoFotosInput');
const colecaoUploadBtn = document.getElementById('colecaoUploadBtn');
const colecaoRefreshBtn = document.getElementById('colecaoRefreshBtn');
const colecaoLimparBtn = document.getElementById('colecaoLimparBtn');
const colecaoContadorEl = document.getElementById('colecaoContador');
const dropzoneLabelEl = document.getElementById('dropzoneLabel');

const state = {
  user: null,
  usuarios: [],
  gestores: [],
  setores: [],
  colecaoUsuario: null,
  colecaoFaces: [],
  colecaoSetorAtual: null,
  usuariosBusca: '',
};

function escapeHtml(valor) {
  return String(valor || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizarTexto(valor) {
  return String(valor || '').trim();
}

function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function formatarCpfVisual(valor) {
  const digitos = somenteDigitos(valor).slice(0, 11);
  return digitos
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function compararTextoPtBr(a, b) {
  return collatorPtBr.compare(String(a || ''), String(b || ''));
}

function obterChaveSetor(valor) {
  const setor = normalizarTexto(valor);
  return setor || SETOR_SEM_NOME;
}

function obterSetoresExistentes() {
  const unicos = new Set();
  state.usuarios.forEach((usuario) => {
    const setor = normalizarTexto(usuario.setor);
    if (setor) {
      unicos.add(setor);
    }
  });
  return Array.from(unicos.values()).sort(compararTextoPtBr);
}

function obterValorSetorFormulario() {
  return normalizarTexto(novoSetorEl?.value);
}

function atualizarCamposColaborador() {
  const isColaborador = novoPerfilEl?.value === 'colaborador';
  if (novoGestorNomeEl) novoGestorNomeEl.required = isColaborador;
  if (novoSetorEl) novoSetorEl.required = isColaborador;
  gestorLabelEl?.querySelector('span')?.classList.toggle('required-mark', isColaborador);
  setorLabelEl?.querySelector('span')?.classList.toggle('required-mark', isColaborador);
}

function sincronizarGestorPorNome() {
  const nomeDigitado = normalizarTexto(novoGestorNomeEl?.value);
  const gestor = state.gestores.find((item) => normalizarTexto(item.nome_completo).toLowerCase() === nomeDigitado.toLowerCase());
  if (novoGestorIdEl) {
    novoGestorIdEl.value = gestor ? String(gestor.id) : '';
  }
}

function renderSugestoes(containerEl, itens, onPick) {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  if (!itens.length) {
    containerEl.classList.add('hidden');
    return;
  }

  itens.forEach((nome) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'suggestion-item';
    btn.textContent = nome;
    btn.addEventListener('mousedown', (event) => {
      event.preventDefault();
      onPick(nome);
      containerEl.classList.add('hidden');
    });
    containerEl.appendChild(btn);
  });

  containerEl.classList.remove('hidden');
}

function abrirSugestoesGestor() {
  const termo = normalizarTexto(novoGestorNomeEl?.value).toLowerCase();
  const nomes = state.gestores
    .map((item) => normalizarTexto(item.nome_completo))
    .filter(Boolean)
    .filter((nome) => nome.toLowerCase().includes(termo))
    .sort(compararTextoPtBr)
    .slice(0, 10);

  renderSugestoes(novoGestorSugestoesEl, nomes, (nomeEscolhido) => {
    if (novoGestorNomeEl) novoGestorNomeEl.value = nomeEscolhido;
    sincronizarGestorPorNome();

    const gestor = state.gestores.find((item) => normalizarTexto(item.nome_completo) === nomeEscolhido);
    const setorGestor = normalizarTexto(gestor?.setor);
    if (setorGestor && novoSetorEl && !normalizarTexto(novoSetorEl.value)) {
      novoSetorEl.value = setorGestor;
    }
  });
}

function abrirSugestoesSetor() {
  const termo = normalizarTexto(novoSetorEl?.value).toLowerCase();
  const setores = [...new Set(state.setores.map(normalizarTexto).filter(Boolean))]
    .filter((setor) => setor.toLowerCase().includes(termo))
    .sort(compararTextoPtBr)
    .slice(0, 10);

  renderSugestoes(novoSetorSugestoesEl, setores, (setorEscolhido) => {
    if (novoSetorEl) novoSetorEl.value = setorEscolhido;
  });
}

function statusAtivoPill(ativo) {
  return ativo
    ? '<span class="pill pill-ok">Ativo</span>'
    : '<span class="pill pill-danger">Inativo</span>';
}

function montarSelectPerfil(valorAtual) {
  const select = document.createElement('select');
  select.className = 'profile-select';

  PERFIS.forEach((perfil) => {
    const option = document.createElement('option');
    option.value = perfil;
    option.textContent = perfil.charAt(0).toUpperCase() + perfil.slice(1);
    option.selected = valorAtual === perfil;
    select.appendChild(option);
  });

  return select;
}

function montarSelectGestor(valorAtual) {
  const select = document.createElement('select');
  select.className = 'profile-select';

  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = 'Sem gestor';
  select.appendChild(empty);

  state.gestores.forEach((gestor) => {
    const option = document.createElement('option');
    option.value = String(gestor.id);
    option.textContent = gestor.nome_completo;
    option.selected = String(gestor.id) === String(valorAtual || '');
    select.appendChild(option);
  });

  return select;
}

function preencherPerfilAdmin(valorAtual) {
  adminPerfilEl.innerHTML = '';
  PERFIS.forEach((perfil) => {
    const option = document.createElement('option');
    option.value = perfil;
    option.textContent = perfil.charAt(0).toUpperCase() + perfil.slice(1);
    option.selected = perfil === valorAtual;
    adminPerfilEl.appendChild(option);
  });
}

function preencherGestorAdmin(valorAtual) {
  adminGestorEl.innerHTML = '<option value="">Sem gestor</option>';
  state.gestores.forEach((gestor) => {
    const option = document.createElement('option');
    option.value = String(gestor.id);
    option.textContent = gestor.nome_completo;
    option.selected = String(gestor.id) === String(valorAtual || '');
    adminGestorEl.appendChild(option);
  });
}

function preencherSetorAdmin(valorAtual) {
  const atual = normalizarTexto(valorAtual);
  const setores = [...new Set(state.setores.map(normalizarTexto).filter(Boolean))];
  if (atual && !setores.includes(atual)) {
    setores.push(atual);
  }
  setores.sort(compararTextoPtBr);

  adminSetorEl.innerHTML = '<option value="">Sem setor</option>';
  setores.forEach((setor) => {
    const option = document.createElement('option');
    option.value = setor;
    option.textContent = setor;
    option.selected = setor === atual;
    adminSetorEl.appendChild(option);
  });
}

function renderPainelUsuarioSelecionado() {
  const usuario = state.colecaoUsuario;
  const habilitado = Boolean(usuario);

  adminNomeEl.value = usuario?.nome_completo || '';
  adminCpfEl.value = formatarCpfVisual(usuario?.cpf || '');
  adminUsuarioEl.value = usuario?.usuario || '';
  adminAtivoEl.value = usuario ? String(Boolean(usuario.ativo)) : 'true';
  preencherPerfilAdmin(usuario?.perfil_acesso || 'colaborador');
  preencherGestorAdmin(usuario?.gestor_id || '');
  preencherSetorAdmin(usuario?.setor || '');

  adminCpfEl.disabled = !habilitado;
  adminPerfilEl.disabled = !habilitado;
  adminAtivoEl.disabled = !habilitado;
  adminGestorEl.disabled = !habilitado;
  adminSetorEl.disabled = !habilitado;
  adminSalvarBtn.disabled = !habilitado;
  adminResetSenhaBtn.disabled = !habilitado;
  adminExcluirBtn.disabled = !habilitado;

  usuarioSelecionadoStatusEl.textContent = habilitado
    ? `Gerenciando ${usuario.nome_completo}.`
    : 'Selecione um usuário no Face Collection para gerenciar.';
}

function abrirModalCadastro() {
  cadastroModalEl?.classList.remove('hidden');
  cadastroModalEl?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  usuarioForm?.reset();
  if (novoGestorIdEl) novoGestorIdEl.value = '';
  if (novoGestorNomeEl) novoGestorNomeEl.value = '';
  if (novoSetorEl) novoSetorEl.value = '';
  if (novoCpfEl) novoCpfEl.value = '';
  if (novoResetPrimeiroAcessoEl) novoResetPrimeiroAcessoEl.checked = false;
  novoGestorSugestoesEl?.classList.add('hidden');
  novoSetorSugestoesEl?.classList.add('hidden');
  atualizarCamposColaborador();
  novoNomeEl?.focus();
}

function fecharModalCadastro() {
  cadastroModalEl?.classList.add('hidden');
  cadastroModalEl?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function abrirModalResetSenha() {
  if (!state.colecaoUsuario) return;
  resetSenhaModalEl?.classList.remove('hidden');
  resetSenhaModalEl?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  resetSenhaFormEl?.reset();
  if (resetSenhaUsuarioNomeEl) {
    resetSenhaUsuarioNomeEl.textContent = state.colecaoUsuario.nome_completo || '-';
  }
  if (resetSenhaDescricaoEl) {
    resetSenhaDescricaoEl.textContent = `Defina uma nova senha temporária para ${state.colecaoUsuario.nome_completo}.`;
  }
  if (resetPrimeiroAcessoModalEl) {
    resetPrimeiroAcessoModalEl.checked = Boolean(state.colecaoUsuario?.reset_senha_primeiro_acesso);
  }
  resetNovaSenhaEl?.focus();
}

function fecharModalResetSenha() {
  resetSenhaModalEl?.classList.add('hidden');
  resetSenhaModalEl?.setAttribute('aria-hidden', 'true');
  if (!cadastroModalEl || cadastroModalEl.classList.contains('hidden')) {
    document.body.classList.remove('modal-open');
  }
}

function filtrarUsuariosColecao() {
  const termo = state.usuariosBusca.trim().toLowerCase();
  if (!termo) return state.usuarios;

  return state.usuarios.filter((usuario) => {
    const subject = Object.entries(usuario).find(([key]) => key.startsWith('subject_'))?.[1];
    return [usuario.nome_completo, usuario.usuario, subject, usuario.setor]
      .filter(Boolean)
      .some((valor) => String(valor).toLowerCase().includes(termo));
  });
}

function renderListaSetores(usuariosFiltrados) {
  const grupos = new Map();
  usuariosFiltrados.forEach((usuario) => {
    const chave = obterChaveSetor(usuario.setor);
    if (!grupos.has(chave)) {
      grupos.set(chave, []);
    }
    grupos.get(chave).push(usuario);
  });

  const setores = Array.from(grupos.entries()).sort((a, b) => compararTextoPtBr(a[0], b[0]));
  if (setores.length === 0) {
    subjectsListEl.innerHTML = '<p class="muted-text">Nenhum setor encontrado.</p>';
    return;
  }

  subjectsListEl.innerHTML = '';
  setores.forEach(([setor, usuarios]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'subject-item';
    button.innerHTML = `
      <strong>${escapeHtml(setor)}</strong>
      <span>${usuarios.length} usuário(s)</span>
    `;
    button.addEventListener('click', () => {
      state.colecaoSetorAtual = setor;
      state.colecaoUsuario = null;
      state.colecaoFaces = [];
      atualizarContadorColecao();
      setColecaoBotoesHabilitados(false);
      colecaoGridEl.innerHTML = '<p class="muted-text">Selecione um usuário desta pasta para gerenciar as faces.</p>';
      colecaoTituloEl.textContent = `Coleção facial • ${setor}`;
      colecaoStatusEl.textContent = `Exibindo usuários do setor ${setor}.`;
      renderPainelUsuarioSelecionado();
      renderSubjectsList();
    });
    subjectsListEl.appendChild(button);
  });
}

function renderListaUsuariosDoSetor(usuariosFiltrados) {
  const usuariosDoSetor = usuariosFiltrados.filter((usuario) => obterChaveSetor(usuario.setor) === state.colecaoSetorAtual);

  if (usuariosDoSetor.length === 0) {
    subjectsListEl.innerHTML = '<p class="muted-text">Nenhum usuário encontrado neste setor.</p>';
    return;
  }

  subjectsListEl.innerHTML = '';
  usuariosDoSetor
    .sort((a, b) => compararTextoPtBr(a.nome_completo, b.nome_completo))
    .forEach((usuario) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'subject-item';
      if (state.colecaoUsuario?.id === usuario.id) {
        button.classList.add('active');
      }

      const totalFaces = state.colecaoUsuario?.id === usuario.id ? state.colecaoFaces.length : null;
      button.innerHTML = `
        <strong>${escapeHtml(usuario.nome_completo || '-')}</strong>
        <span>${escapeHtml(Object.entries(usuario).find(([key]) => key.startsWith('subject_'))?.[1] || usuario.usuario || '-')}</span>
        <span>${usuario.ativo ? 'Ativo' : 'Inativo'}${totalFaces !== null ? ` • ${totalFaces} imagem(ns)` : ''}</span>
      `;
      button.addEventListener('click', async () => {
        await carregarColecaoFacial(usuario);
        renderSubjectsList();
      });
      subjectsListEl.appendChild(button);
    });
}

/**
 * Decide se o painel lateral deve mostrar a visão por setores ou os usuários de um setor já selecionado.
 * @returns {void}
 */
function renderSubjectsList() {
  const usuariosFiltrados = filtrarUsuariosColecao();
  voltarSetoresBtn?.classList.toggle('hidden', !state.colecaoSetorAtual);

  if (state.colecaoSetorAtual) {
    renderListaUsuariosDoSetor(usuariosFiltrados);
    return;
  }

  renderListaSetores(usuariosFiltrados);
}

function setColecaoBotoesHabilitados(habilitado) {
  colecaoUploadBtn.disabled = !habilitado;
  colecaoRefreshBtn.disabled = !habilitado;
  colecaoLimparBtn.disabled = !habilitado;
  colecaoFotosInputEl.disabled = !habilitado;
  dropzoneLabelEl.classList.toggle('is-disabled', !habilitado);
}

function atualizarContadorColecao() {
  colecaoContadorEl.textContent = String(state.colecaoFaces.length || 0);
}

function atualizarEstadoDropzone() {
  if (!state.colecaoUsuario) {
    dropzoneLabelEl.querySelector('span').textContent = 'Selecione um usuário antes de enviar imagens.';
    return;
  }

  const totalArquivos = colecaoFotosInputEl.files?.length || 0;
  dropzoneLabelEl.querySelector('span').textContent = totalArquivos > 0
    ? `${totalArquivos} arquivo(s) pronto(s) para envio.`
    : 'Envie novas fotos para a coleção facial do usuário selecionado.';
}

function definirArquivosColecao(files) {
  const dataTransfer = new DataTransfer();
  Array.from(files || []).forEach((file) => dataTransfer.items.add(file));
  colecaoFotosInputEl.files = dataTransfer.files;
  atualizarEstadoDropzone();
}

async function carregarImagemAutenticada(url, imgEl) {
  try {
    const response = await window.Auth.authFetch(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    imgEl.src = objectUrl;
    imgEl.dataset.objectUrl = objectUrl;
  } catch (err) {
    console.error('[usuarios] Falha ao carregar imagem da face:', err);
    imgEl.alt = 'Falha ao carregar imagem';
  }
}

function montarUrlImagemColecao(face) {
  const imageId = String(face?.image_id || face?.imageId || face?.id || '').trim();
  if (imageId) {
    return `${window.Auth.getApiBase()}/faces/${encodeURIComponent(imageId)}/img`;
  }

  return String(face?.foto_url || '').trim() || null;
}

function limparPainelColecao(mensagem) {
  state.colecaoUsuario = null;
  state.colecaoFaces = [];
  colecaoTituloEl.textContent = state.colecaoSetorAtual ? `Coleção facial • ${state.colecaoSetorAtual}` : 'Coleção facial';
  colecaoStatusEl.textContent = mensagem;
  colecaoGridEl.innerHTML = '<p class="muted-text">Nenhum usuário selecionado.</p>';
  colecaoFotosInputEl.value = '';
  atualizarContadorColecao();
  setColecaoBotoesHabilitados(false);
  atualizarEstadoDropzone();
  renderPainelUsuarioSelecionado();
  renderSubjectsList();
}

function renderColecaoFaces() {
  if (!state.colecaoUsuario) {
    limparPainelColecao('Selecione um usuário para visualizar as faces cadastradas.');
    return;
  }

  atualizarContadorColecao();

  if (state.colecaoFaces.length === 0) {
    colecaoGridEl.innerHTML = '<p class="muted-text">Nenhuma face cadastrada para este usuário.</p>';
    return;
  }

  colecaoGridEl.innerHTML = '';
  state.colecaoFaces.forEach((face) => {
    const imageId = String(face?.image_id || face?.imageId || face?.id || '').trim();
    const card = document.createElement('article');
    card.className = 'face-card';
    card.innerHTML = `
      <img src="" alt="Face cadastrada" loading="lazy" />
      <div class="face-card-body">
        <div class="face-card-meta">
          <button type="button" class="ghost-btn" data-image-id="${escapeHtml(imageId)}" ${imageId ? '' : 'disabled'}>Remover face</button>
        </div>
      </div>
    `;

    const imgEl = card.querySelector('img');
    const fotoUrl = montarUrlImagemColecao(face);
    if (imgEl && fotoUrl) {
      carregarImagemAutenticada(fotoUrl, imgEl);
    } else if (imgEl) {
      imgEl.alt = 'Imagem indisponível';
    }

    card.querySelector('[data-image-id]')?.addEventListener('click', async () => {
      const confirmou = window.confirm('Remover esta face da colecao facial?');
      if (!confirmou) return;

      try {
        await window.Auth.apiJson(`/usuarios/${state.colecaoUsuario.id}/face-collection/${encodeURIComponent(face.image_id)}`, {
          method: 'DELETE',
        });
        colecaoStatusEl.textContent = 'Face removida da colecao facial.';
        await carregarColecaoFacial(state.colecaoUsuario);
      } catch (err) {
        console.error('[usuarios] erro ao remover face:', err);
        colecaoStatusEl.textContent = err.message;
      }
    });

    colecaoGridEl.appendChild(card);
  });
}

/**
 * Carrega a coleção facial do usuário escolhido, sincronizando grid de faces, contador e ações disponíveis.
 * @param {object} usuario Registro atualmente selecionado no painel lateral.
 * @returns {Promise<void>}
 */
async function carregarColecaoFacial(usuario) {
  state.colecaoUsuario = usuario;
  state.colecaoSetorAtual = obterChaveSetor(usuario.setor);
  colecaoTituloEl.textContent = `Coleção facial • ${usuario.nome_completo}`;
  colecaoStatusEl.textContent = 'Carregando faces cadastradas...';
  setColecaoBotoesHabilitados(true);

  try {
    const json = await window.Auth.apiJson(`/usuarios/${usuario.id}/face-collection`);
    state.colecaoFaces = Array.isArray(json?.data) ? json.data : [];
    colecaoStatusEl.textContent = `${state.colecaoFaces.length} face(s) cadastrada(s).`;
    atualizarEstadoDropzone();
    renderColecaoFaces();
    renderPainelUsuarioSelecionado();
    renderSubjectsList();
  } catch (err) {
    console.error('[usuarios] erro ao carregar coleção facial:', err);
    state.colecaoFaces = [];
    colecaoGridEl.innerHTML = '<p class="muted-text">Falha ao carregar faces deste usuário.</p>';
    colecaoStatusEl.textContent = err.message;
    atualizarContadorColecao();
  }
}

/**
 * Carrega usuários, gestores e setores usados na administração, preservando a seleção atual quando possível.
 * @returns {Promise<void>}
 */
async function carregarUsuarios() {
  usuariosStatusEl.textContent = 'Carregando usuários...';
  refreshBtn.disabled = true;

  try {
    const json = await window.Auth.apiJson('/usuarios');
    state.usuarios = Array.isArray(json?.data) ? json.data : [];

    const gestoresJson = await window.Auth.apiJson('/usuarios?perfil=gestor&ativo=true');
    state.gestores = Array.isArray(gestoresJson?.data) ? gestoresJson.data : [];

    try {
      const setoresJson = await window.Auth.apiJson('/setores?ativo=true');
      const setoresApi = Array.isArray(setoresJson?.data) ? setoresJson.data : [];
      state.setores = [...new Set(setoresApi.map((item) => normalizarTexto(item.nome)).filter(Boolean))]
        .sort(compararTextoPtBr);
    } catch (_err) {
      state.setores = obterSetoresExistentes();
    }

    sincronizarGestorPorNome();
    renderPainelUsuarioSelecionado();

    if (state.colecaoUsuario?.id) {
      const usuarioSelecionado = state.usuarios.find((item) => item.id === state.colecaoUsuario.id);
      if (usuarioSelecionado) {
        state.colecaoUsuario = usuarioSelecionado;
        state.colecaoSetorAtual = obterChaveSetor(usuarioSelecionado.setor);
        colecaoTituloEl.textContent = `Coleção facial • ${usuarioSelecionado.nome_completo}`;
      } else {
        limparPainelColecao('Usuário selecionado não está mais disponível.');
      }
    }

    renderSubjectsList();
    usuariosStatusEl.textContent = `${state.usuarios.length} usuário(s) carregado(s).`;
  } catch (err) {
    console.error('[usuarios] erro ao carregar:', err);
    subjectsListEl.innerHTML = '<p class="muted-text">Falha ao carregar setores.</p>';
    usuariosStatusEl.textContent = err.message;
  } finally {
    refreshBtn.disabled = false;
  }
}

usuarioAdminFormEl?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.colecaoUsuario?.id) return;

  adminSalvarBtn.disabled = true;
  try {
    await atualizarUsuario(
      state.colecaoUsuario.id,
      {
        cpf: somenteDigitos(adminCpfEl.value) || null,
        perfil: adminPerfilEl.value,
        ativo: adminAtivoEl.value === 'true',
        gestorId: adminGestorEl.value || null,
        setor: adminSetorEl.value || null,
      },
      `Usuário ${state.colecaoUsuario.nome_completo} atualizado.`
    );
  } finally {
    adminSalvarBtn.disabled = false;
  }
});

adminResetSenhaBtn?.addEventListener('click', () => {
  abrirModalResetSenha();
});

resetSenhaFormEl?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.colecaoUsuario?.id) return;

  const senha = String(resetNovaSenhaEl?.value || '');
  const confirmarSenha = String(resetConfirmarNovaSenhaEl?.value || '');
  if (senha.length < 6) {
    usuariosStatusEl.textContent = 'A nova senha deve ter no mínimo 6 caracteres.';
    return;
  }

  if (senha !== confirmarSenha) {
    usuariosStatusEl.textContent = 'Os campos Nova senha e Confirmar nova senha devem ser iguais.';
    return;
  }

  confirmarResetSenhaBtn.disabled = true;
  try {
    await atualizarUsuario(
      state.colecaoUsuario.id,
      {
        senha,
        resetSenhaPrimeiroAcesso: Boolean(resetPrimeiroAcessoModalEl?.checked),
      },
      `Senha de ${state.colecaoUsuario.nome_completo} redefinida com sucesso.`
    );
    fecharModalResetSenha();
  } finally {
    confirmarResetSenhaBtn.disabled = false;
  }
});

adminExcluirBtn?.addEventListener('click', async () => {
  if (!state.colecaoUsuario?.id) return;
  const alvo = state.colecaoUsuario;
  const confirmou = window.confirm(`Excluir definitivamente ${alvo.nome_completo}? Isso remove o usuário aqui e na colecao facial.`);
  if (!confirmou) return;

  adminExcluirBtn.disabled = true;
  try {
    await window.Auth.apiJson(`/usuarios/${alvo.id}?hard=true`, { method: 'DELETE' });
    usuariosStatusEl.textContent = `Usuário ${alvo.nome_completo} excluído definitivamente.`;
    state.colecaoUsuario = null;
    state.colecaoFaces = [];
    limparPainelColecao('Usuário excluído. Selecione outro usuário para gerenciar a coleção facial.');
    await carregarUsuarios();
  } catch (err) {
    console.error('[usuarios] erro ao excluir:', err);
    usuariosStatusEl.textContent = err.message;
  } finally {
    adminExcluirBtn.disabled = false;
  }
});

/**
 * Envia atualizações administrativas de um usuário para o backend e recarrega a listagem local.
 * @param {number} usuarioId Identificador do usuário persistido no banco.
 * @param {object} payload Campos que devem ser alterados.
 * @param {string} mensagemSucesso Texto de confirmação exibido na interface.
 * @returns {Promise<void>}
 */
async function atualizarUsuario(usuarioId, payload, mensagemSucesso) {
  try {
    await window.Auth.apiJson(`/usuarios/${usuarioId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    usuariosStatusEl.textContent = mensagemSucesso;
    await carregarUsuarios();
  } catch (err) {
    console.error('[usuarios] erro ao atualizar:', err);
    usuariosStatusEl.textContent = err.message;
  }
}

usuarioForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  usuariosStatusEl.textContent = 'Criando usuário...';
  criarUsuarioBtn.disabled = true;

  try {
    const perfil = novoPerfilEl.value;
    sincronizarGestorPorNome();
    const gestorId = novoGestorIdEl.value || '';
    const setor = obterValorSetorFormulario();

    if (perfil === 'colaborador' && !gestorId) {
      throw new Error('Selecione um gestor para colaboradores.');
    }

    if (perfil === 'colaborador' && !setor) {
      throw new Error('Selecione ou informe um setor para colaboradores.');
    }

    const formData = new FormData();
    formData.append('nomeCompleto', normalizarTexto(novoNomeEl.value));
    formData.append('cpf', somenteDigitos(novoCpfEl.value));
    formData.append('usuario', normalizarTexto(novoUsuarioEl.value));
    formData.append('senha', novoSenhaEl.value);
    formData.append('resetSenhaPrimeiroAcesso', String(Boolean(novoResetPrimeiroAcessoEl?.checked)));
    formData.append('perfil', perfil);

    if (gestorId) {
      formData.append('gestorId', gestorId);
    }

    if (setor) {
      formData.append('setor', setor);
    }

    Array.from(novasFotosEl?.files || []).forEach((foto) => {
      formData.append('fotos', foto, foto.name);
    });

    const response = await window.Auth.authFetch(`${window.Auth.getApiBase()}/usuarios`, {
      method: 'POST',
      body: formData,
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json?.message || 'Falha ao criar usuário.');
    }

    const totalFotos = Number(json?.faceRecognition?.fotosEnviadas || json?.totalFotos || 0);
    usuariosStatusEl.textContent = totalFotos > 0
      ? `Usuário criado e ${totalFotos} foto(s) cadastrada(s).`
      : (json?.message || 'Usuário criado com sucesso.');

    fecharModalCadastro();
    usuarioForm.reset();
    if (novoGestorIdEl) novoGestorIdEl.value = '';
    if (novoGestorNomeEl) novoGestorNomeEl.value = '';
    if (novoSetorEl) novoSetorEl.value = '';
    if (novoCpfEl) novoCpfEl.value = '';
    if (novoResetPrimeiroAcessoEl) novoResetPrimeiroAcessoEl.checked = false;
    atualizarCamposColaborador();
    await carregarUsuarios();

    if (json?.data?.id) {
      const usuarioCriado = state.usuarios.find((item) => item.id === json.data.id);
      if (usuarioCriado) {
        await carregarColecaoFacial(usuarioCriado);
      }
    }
  } catch (err) {
    console.error('[usuarios] erro ao criar:', err);
    usuariosStatusEl.textContent = err.message;
  } finally {
    criarUsuarioBtn.disabled = false;
  }
});

refreshBtn?.addEventListener('click', async () => {
  await carregarUsuarios();
});

openCadastroModalBtn?.addEventListener('click', () => {
  abrirModalCadastro();
});

closeCadastroModalBtn?.addEventListener('click', () => {
  fecharModalCadastro();
});

closeResetSenhaModalBtn?.addEventListener('click', () => {
  fecharModalResetSenha();
});

cadastroModalEl?.addEventListener('click', (event) => {
  if (event.target === cadastroModalEl) {
    fecharModalCadastro();
  }
});

resetSenhaModalEl?.addEventListener('click', (event) => {
  if (event.target === resetSenhaModalEl) {
    fecharModalResetSenha();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && cadastroModalEl && !cadastroModalEl.classList.contains('hidden')) {
    fecharModalCadastro();
  }
  if (event.key === 'Escape' && resetSenhaModalEl && !resetSenhaModalEl.classList.contains('hidden')) {
    fecharModalResetSenha();
  }
});

usuariosSearchEl?.addEventListener('input', () => {
  state.usuariosBusca = usuariosSearchEl.value || '';
  renderSubjectsList();
});

voltarSetoresBtn?.addEventListener('click', () => {
  state.colecaoSetorAtual = null;
  state.colecaoUsuario = null;
  state.colecaoFaces = [];
  limparPainelColecao('Selecione um setor para navegar pelos usuários.');
});

novoGestorNomeEl?.addEventListener('focus', () => {
  abrirSugestoesGestor();
});

novoGestorNomeEl?.addEventListener('input', () => {
  sincronizarGestorPorNome();
  abrirSugestoesGestor();
});

novoGestorNomeEl?.addEventListener('blur', () => {
  setTimeout(() => novoGestorSugestoesEl?.classList.add('hidden'), 120);
  sincronizarGestorPorNome();
});

novoSetorEl?.addEventListener('focus', () => {
  abrirSugestoesSetor();
});

novoSetorEl?.addEventListener('input', () => {
  abrirSugestoesSetor();
});

novoSetorEl?.addEventListener('blur', () => {
  setTimeout(() => novoSetorSugestoesEl?.classList.add('hidden'), 120);
});

novoPerfilEl?.addEventListener('change', () => {
  atualizarCamposColaborador();
});

novoCpfEl?.addEventListener('input', () => {
  novoCpfEl.value = formatarCpfVisual(novoCpfEl.value);
});

adminCpfEl?.addEventListener('input', () => {
  adminCpfEl.value = formatarCpfVisual(adminCpfEl.value);
});

colecaoFotosInputEl?.addEventListener('change', () => {
  atualizarEstadoDropzone();
});

dropzoneLabelEl?.addEventListener('dragover', (event) => {
  if (!state.colecaoUsuario) return;
  event.preventDefault();
  dropzoneLabelEl.classList.add('dragover');
});

dropzoneLabelEl?.addEventListener('dragleave', () => {
  dropzoneLabelEl.classList.remove('dragover');
});

dropzoneLabelEl?.addEventListener('drop', (event) => {
  if (!state.colecaoUsuario) return;
  event.preventDefault();
  dropzoneLabelEl.classList.remove('dragover');
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length > 0) {
    definirArquivosColecao(files);
  }
});

colecaoRefreshBtn?.addEventListener('click', async () => {
  if (!state.colecaoUsuario) return;
  await carregarColecaoFacial(state.colecaoUsuario);
});

colecaoUploadBtn?.addEventListener('click', async () => {
  if (!state.colecaoUsuario) return;

  const fotos = Array.from(colecaoFotosInputEl.files || []);
  if (fotos.length === 0) {
    colecaoStatusEl.textContent = 'Selecione ao menos uma foto para enviar.';
    return;
  }

  const formData = new FormData();
  fotos.forEach((foto) => formData.append('fotos', foto, foto.name));
  colecaoStatusEl.textContent = 'Enviando fotos...';
  colecaoUploadBtn.disabled = true;

  try {
    const response = await window.Auth.authFetch(
      `${window.Auth.getApiBase()}/usuarios/${state.colecaoUsuario.id}/face-collection/fotos`,
      {
        method: 'POST',
        body: formData,
      }
    );

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json?.message || 'Falha ao enviar fotos.');
    }

    colecaoFotosInputEl.value = '';
    colecaoStatusEl.textContent = json?.message || 'Fotos cadastradas.';
    atualizarEstadoDropzone();
    await carregarColecaoFacial(state.colecaoUsuario);
  } catch (err) {
    console.error('[usuarios] erro ao enviar fotos:', err);
    colecaoStatusEl.textContent = err.message;
  } finally {
    colecaoUploadBtn.disabled = false;
  }
});

colecaoLimparBtn?.addEventListener('click', async () => {
  if (!state.colecaoUsuario) return;

  const confirmou = window.confirm(`Remover todas as faces de ${state.colecaoUsuario.nome_completo}?`);
  if (!confirmou) return;

  try {
    await window.Auth.apiJson(`/usuarios/${state.colecaoUsuario.id}/face-collection`, {
      method: 'DELETE',
    });
    colecaoStatusEl.textContent = 'Colecao facial removida.';
    await carregarColecaoFacial(state.colecaoUsuario);
  } catch (err) {
    console.error('[usuarios] erro ao limpar coleção:', err);
    colecaoStatusEl.textContent = err.message;
  }
});

(async function init() {
  const user = await window.Auth.requireAuth(['admin']);
  if (!user) return;
  state.user = user;
  atualizarCamposColaborador();
  limparPainelColecao('Selecione um setor para navegar pelos usuários.');
  await carregarUsuarios();
})();
