'use strict';

const APP_TIMEZONE = 'America/Sao_Paulo';
const statusEl = document.getElementById('dashboardStatus');
const listaEl = document.getElementById('dashboardLista');
const atualizarBtn = document.getElementById('dashboardAtualizar');
let carregando = false;
let ultimaAtualizacao = null;
let dataCarregada = null;

function obterDataHojeLocal() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${partes.year}-${partes.month}-${partes.day}`;
}

function statusSessao(sessao) {
  if (sessao.fim_efetivo_em) return 'concluida';
  return sessao.inicio_efetivo_em ? 'em_andamento' : 'pendente';
}

function criarElemento(tag, classe, texto) {
  const el = document.createElement(tag);
  el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function horarioSessao(sessao) {
  if (!sessao.inicio_efetivo_em) return 'Aguardando início';
  const dt = new Date(sessao.inicio_efetivo_em);
  if (Number.isNaN(dt.getTime())) return 'Horário indisponível';
  return `Início às ${dt.toLocaleTimeString('pt-BR', {timeZone: APP_TIMEZONE, hour: '2-digit', minute: '2-digit'})}`;
}

function renderizarSessoes(sessoes) {
  const ordem = {em_andamento: 0, pendente: 1, concluida: 2};
  const labels = {em_andamento: 'Em andamento', pendente: 'Pendente', concluida: 'Concluída'};
  const totais = {pendente: 0, em_andamento: 0, concluida: 0};
  sessoes.forEach(sessao => { totais[statusSessao(sessao)] += 1; });
  for (const [id, valor] of Object.entries({kpiTotal: sessoes.length, kpiPendentes: totais.pendente, kpiAndamento: totais.em_andamento, kpiConcluidas: totais.concluida})) {
    document.getElementById(id).textContent = String(valor);
  }
  const ordenadas = [...sessoes].sort((a, b) =>
    ordem[statusSessao(a)] - ordem[statusSessao(b)] ||
    String(a.inicio_efetivo_em || '').localeCompare(String(b.inicio_efetivo_em || '')) || Number(a.id) - Number(b.id));
  const cards = ordenadas.map(sessao => {
    const status = statusSessao(sessao);
    const card = criarElemento('article', 'card dashboard-session');
    card.dataset.status = status;
    const info = criarElemento('div', 'dashboard-session-info');
    info.append(criarElemento('span', 'eyebrow', `Sessão ${sessao.nome || sessao.id}`),
      criarElemento('h2', '', sessao.tipo_sessao || 'Sessão'),
      criarElemento('p', 'muted-text', `${horarioSessao(sessao)} · Instrutor: ${sessao.instrutor_nome || 'Não informado'}`));
    if (sessao.local) info.append(criarElemento('p', 'muted-text', sessao.local));
    const actions = criarElemento('div', 'dashboard-session-actions');
    const badge = criarElemento('span', `pill ${status === 'concluida' ? 'pill-ok' : status === 'em_andamento' ? 'pill-warn' : ''}`, labels[status]);
    const link = criarElemento('a', 'ghost-btn', 'Ver sessão');
    link.href = `sessao.html?id=${encodeURIComponent(sessao.id)}`;
    link.setAttribute('aria-label', `Ver sessão ${sessao.tipo_sessao || sessao.nome || sessao.id}`);
    actions.append(badge, link);
    card.append(info, actions);
    return card;
  });
  listaEl.replaceChildren(...(cards.length ? cards : [criarElemento('p', 'card dashboard-empty', 'Nenhuma sessão prevista para hoje')]));
}

async function carregarDados() {
  if (carregando) return;
  carregando = true;
  atualizarBtn.disabled = true;
  listaEl.setAttribute('aria-busy', 'true');
  statusEl.textContent = 'Atualizando sessões...';
  const hoje = obterDataHojeLocal();
  document.getElementById('dashboardData').textContent = new Date(`${hoje}T12:00:00-03:00`).toLocaleDateString('pt-BR', {
    timeZone: APP_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  // Não apresentar sessões de ontem sob o cabeçalho do dia atual.
  if (dataCarregada && dataCarregada !== hoje) {
    ultimaAtualizacao = null;
    listaEl.replaceChildren();
    ['kpiTotal', 'kpiPendentes', 'kpiAndamento', 'kpiConcluidas'].forEach(id => { document.getElementById(id).textContent = '—'; });
  }
  try {
    const resposta = await window.Auth.apiJson(`/sessoes?data=${encodeURIComponent(hoje)}`);
    if (!Array.isArray(resposta?.data)) throw new Error('Resposta inválida de sessões.');
    renderizarSessoes(resposta.data);
    ultimaAtualizacao = new Date();
    dataCarregada = hoje;
    statusEl.textContent = `Atualizado às ${ultimaAtualizacao.toLocaleTimeString('pt-BR', {timeZone: APP_TIMEZONE})} · atualização automática`;
  } catch (err) {
    statusEl.textContent = ultimaAtualizacao ? 'Dados desatualizados. Não foi possível atualizar; tente novamente.' : 'Não foi possível carregar as sessões. Tente novamente.';
    if (!ultimaAtualizacao) listaEl.replaceChildren(criarElemento('p', 'card dashboard-empty', 'Sessões indisponíveis no momento.'));
  } finally {
    carregando = false;
    atualizarBtn.disabled = false;
    listaEl.setAttribute('aria-busy', 'false');
  }
}

(async function init() {
  const user = await window.Auth.requireAuth(['admin', 'gestor', 'instrutor']);
  if (!user) return;
  atualizarBtn.addEventListener('click', carregarDados);
  await carregarDados();
  setInterval(() => { if (!document.hidden) carregarDados(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) carregarDados(); });
})();
