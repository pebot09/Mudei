/* ============================================================
   Mudei — Organizador de Mudança
   App 100% estático: os dados vivem no localStorage do
   navegador e podem ser compartilhados por link ou arquivo.
   ============================================================ */

'use strict';

/* ================= Utilitários ================= */

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const now = () => Date.now();

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const BRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—';
  return (n % 1 === 0 ? BRL0 : BRL).format(n);
}

function parseMoney(s) {
  s = String(s ?? '').trim().replace(/R\$\s*/i, '').replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}(\.|$)/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function moneyInputValue(n) {
  if (n == null) return '';
  return String(n).replace('.', ',');
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtDateShort(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function daysUntil(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function relTime(ts) {
  const diff = now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function sum(arr, fn) {
  let t = 0;
  for (const x of arr) { const v = fn(x); if (v != null && !isNaN(v)) t += v; }
  return t;
}

const PERSON_COLORS = ['#e8590c', '#0ca678', '#1971c2', '#9c36b5', '#e03131', '#f08c00', '#2f9e44', '#0c8599', '#6741d9', '#c2255c'];

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

/* ================= Estado ================= */

const DB_KEY      = 'mudei.state.v1';
const PREFS_KEY   = 'mudei.prefs.v1';
const PROFILE_KEY = 'mudei.profile.v1';

let state, prefs, profile;
let deferredInstall = null;
let incomingState = null;
let editingCatId = null;

function normalizeState(s) {
  const base = makeSeedState();
  if (!s || typeof s !== 'object') return base;
  const out = {
    version: 1,
    meta: Object.assign(base.meta, s.meta || {}),
    people: Array.isArray(s.people) ? s.people : [],
    items: Array.isArray(s.items) ? s.items : [],
    tasks: Array.isArray(s.tasks) ? s.tasks : [],
    boxes: Array.isArray(s.boxes) ? s.boxes : [],
    cats: Array.isArray(s.cats) && s.cats.length ? s.cats : base.cats,
    log: Array.isArray(s.log) ? s.log : [],
    guide: { steps: (s.guide && s.guide.steps) || {} },
  };
  // expurga registros excluídos há mais de 60 dias
  const cutoff = now() - 60 * 86400000;
  for (const key of ['people', 'items', 'tasks', 'boxes', 'cats']) {
    out[key] = out[key].filter(e => !(e.deleted && (e.updatedAt || 0) < cutoff));
  }
  return out;
}

function loadState() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (e) { console.warn('estado corrompido, recomeçando', e); }
  return normalizeState(makeSeedState());
}

function save() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(state)); }
  catch (e) { toast('⚠️ Não consegui salvar (armazenamento cheio?)'); }
  scheduleSyncPush();
}

function loadJSON(key, fallback) {
  try { const raw = localStorage.getItem(key); if (raw) return Object.assign({}, fallback, JSON.parse(raw)); } catch (e) {}
  return Object.assign({}, fallback);
}

function savePrefs()   { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }
function saveProfile() { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }

const alive = arr => arr.filter(e => !e.deleted);

function touch(e) { e.updatedAt = now(); e.updatedBy = profile.name || ''; }

function addLog(emoji, text) {
  state.log.unshift({ id: uid(), ts: now(), who: profile.name || 'Alguém', emoji, text });
  state.log = state.log.slice(0, 100);
}

function mergeStates(a, b) {
  const out = { version: 1, meta: null, people: [], items: [], tasks: [], boxes: [], cats: [], log: [] };
  out.meta = ((b.meta && b.meta.updatedAt) || 0) > ((a.meta && a.meta.updatedAt) || 0)
    ? Object.assign({}, a.meta, b.meta) : Object.assign({}, b.meta, a.meta);
  // o canal de sincronização nunca se perde numa mesclagem
  if (!out.meta.syncId) out.meta.syncId = (a.meta && a.meta.syncId) || (b.meta && b.meta.syncId) || '';
  for (const key of ['people', 'items', 'tasks', 'boxes', 'cats']) {
    const map = new Map();
    for (const e of a[key] || []) map.set(e.id, e);
    for (const e of b[key] || []) {
      const cur = map.get(e.id);
      if (!cur || (e.updatedAt || 0) > (cur.updatedAt || 0)) map.set(e.id, e);
    }
    out[key] = Array.from(map.values());
  }
  const logMap = new Map();
  for (const l of [...(a.log || []), ...(b.log || [])]) if (l && l.id) logMap.set(l.id, l);
  out.log = Array.from(logMap.values()).sort((x, y) => y.ts - x.ts).slice(0, 100);
  // progresso do guia: por passo, vence a marcação mais recente
  const gsA = (a.guide && a.guide.steps) || {};
  const gsB = (b.guide && b.guide.steps) || {};
  const gs = {};
  for (const k of new Set([...Object.keys(gsA), ...Object.keys(gsB)])) {
    const ea = gsA[k], eb = gsB[k];
    gs[k] = !ea ? eb : !eb ? ea : ((eb.updatedAt || 0) > (ea.updatedAt || 0) ? eb : ea);
  }
  out.guide = { steps: gs };
  return normalizeState(out);
}

/* ================= Consultas ================= */

const isResolved = it => it.status === 'comprado' || it.status === 'doado';

function catById(id) {
  return alive(state.cats).find(c => c.id === id) || { id: 'outros', name: 'Outros', emoji: '📦' };
}

function personById(id) {
  return alive(state.people).find(p => p.id === id) || null;
}

function itemEstimate(it) {
  return it.bestPrice != null ? it.bestPrice : it.budget;
}

/* Item que vem (ou deve vir) de doação/presente — não pesa no seu bolso */
const isGift = i => i.cond === 'doacao' || !!i.donor || i.status === 'prometido';
const paidOf = i => (i.paidPrice != null ? i.paidPrice : i.bestPrice);

function computeStats() {
  const items = alive(state.items);
  const resolved = items.filter(isResolved);
  const pending = items.filter(i => !isResolved(i));
  // "spent" = só o que saiu do SEU bolso; o que outros pagaram vai separado
  const spent = sum(items, i => i.status === 'comprado' && !i.paidBy ? paidOf(i) : null);
  const spentByOthers = sum(items, i => i.status === 'comprado' && i.paidBy ? paidOf(i) : null);
  const toSpend = sum(pending, i => isGift(i) ? null : itemEstimate(i));
  const budget = sum(items, i => i.budget);
  let saved = 0;
  for (const i of items) {
    if (i.status === 'comprado') {
      const paid = paidOf(i);
      if (i.paidBy) saved += i.budget != null ? i.budget : (paid || 0);
      else if (i.budget != null && paid != null) saved += i.budget - paid;
    } else if (i.status === 'doado' && i.budget != null) {
      saved += i.budget;
    }
  }
  return { items, resolved, pending, spent, spentByOthers, toSpend, budget, saved };
}

/* ================= Guia da mudança ================= */
/* Passos podem ser: ligados a uma tarefa (task), automáticos (auto:
   completam sozinhos conforme o estado do app) ou manuais. O círculo
   sempre permite marcar/desmarcar; o automático nunca "desmarca". */

function multiTaskDone(s, ids) {
  const ts = ids.map(id => alive(s.tasks).find(t => t.id === id)).filter(Boolean);
  if (!ts.length) return null;
  const dn = ts.filter(t => t.done).length;
  return { done: dn === ts.length, prog: `${dn}/${ts.length}` };
}

const GUIDE_STAGES = [
  {
    id: 'start', emoji: '🚀', name: 'Ponto de partida', when: 'Comece por aqui — leva 5 minutos', steps: [
      { id: 'g-date', title: 'Definir a data da mudança', desc: 'O guia usa a data para dizer o que fazer a cada semana.', auto: s => !!s.meta.movingDate, act: 'open-setup' },
      { id: 'g-budget', title: 'Definir o teto de gastos', desc: 'Opcional, mas evita susto no fim. Prefere sem teto? Toque no círculo.', auto: s => s.meta.budgetTotal != null, act: 'open-setup' },
      { id: 'g-team', title: 'Montar a equipe e compartilhar', desc: 'Adicione quem vai ajudar e mande o link com os dados.', auto: s => alive(s.people).length >= 2, act: 'go-equipe' },
      { id: 'g-review', title: 'Revisar a lista de compras', desc: 'Ajuste prioridades e complete com o kit enxoval.', act: 'go-compras' },
      { id: 'g-mark-donations', title: 'Marcar o que pode vir de doação', desc: 'Na ficha do item, escolha condição "Doação" e anote de quem vai pedir.', auto: s => alive(s.items).some(i => i.cond === 'doacao' || i.donor), act: 'go-compras' },
    ],
  },
  {
    id: 'plan', emoji: '📋', name: 'Planejamento', when: 'Ideal com 3+ semanas de antecedência', steps: [
      { id: 'g-frete', task: 't-frete', title: 'Cotar frete/carreto (3 orçamentos)', act: 'go-tarefas' },
      { id: 'g-medidas', task: 't-medidas', title: 'Medir portas e vãos do novo lar', desc: 'Anote as medidas nos itens grandes para não errar na compra.', act: 'go-tarefas' },
      {
        id: 'g-research', title: 'Pesquisar preços da prioridade alta', desc: 'Registre o melhor preço achado em cada item vermelho (doações não precisam).',
        auto: s => {
          const its = alive(s.items).filter(i => i.prio === 'alta');
          const dn = its.filter(i => isResolved(i) || i.bestPrice != null || isGift(i)).length;
          return { done: its.length > 0 && dn === its.length, prog: `${dn}/${its.length}` };
        }, act: 'go-compras-alta',
      },
      {
        id: 'g-ask-donations', title: 'Pedir as doações a amigos e parentes', desc: 'Quando alguém topar, mude o item para "🤝 Doação prometida" com o nome da pessoa.',
        auto: s => {
          const its = alive(s.items).filter(i => i.cond === 'doacao' || i.donor);
          if (!its.length) return null;
          const dn = its.filter(i => i.status === 'prometido' || isResolved(i)).length;
          return { done: dn === its.length, prog: `${dn}/${its.length}` };
        }, act: 'go-compras-doacao',
      },
      { id: 'g-desapegar', task: 't-desapegar', title: 'Separar o que não vai: doar, vender, descartar', act: 'go-tarefas' },
      { id: 'g-materiais', task: 't-caixas', title: 'Juntar caixas, fita e plástico-bolha', act: 'go-tarefas' },
      {
        id: 'g-plan-tasks', title: 'Fechar as tarefas de planejamento', desc: 'Internet, luz, água, documentos — tudo na aba Tarefas.',
        auto: s => {
          const ts = alive(s.tasks).filter(t => t.phase === 'antes');
          const dn = ts.filter(t => t.done).length;
          return { done: ts.length > 0 && dn === ts.length, prog: `${dn}/${ts.length}` };
        }, act: 'go-tarefas',
      },
    ],
  },
  {
    id: 'buy', emoji: '🛒', name: 'Compras & serviços', when: '2 a 3 semanas antes', steps: [
      {
        id: 'g-buy-alta', title: 'Resolver os itens de prioridade alta', desc: 'Comprar ou garantir doação do que é essencial.',
        auto: s => {
          const its = alive(s.items).filter(i => i.prio === 'alta');
          const dn = its.filter(isResolved).length;
          return { done: its.length > 0 && dn === its.length, prog: `${dn}/${its.length}` };
        }, act: 'go-compras-alta',
      },
      { id: 'g-utilities', title: 'Garantir luz, água, gás e internet', desc: 'Transferências e instalações agendadas para antes da mudança.', auto: s => multiTaskDone(s, ['t-luz', 't-agua', 't-gas', 't-internet']), act: 'go-tarefas' },
      { id: 'g-deliveries', title: 'Agendar entregas e retiradas para o novo endereço', desc: 'Compras grandes vão direto para o novo lar; combine também quando buscar as doações. Anote as datas nas observações de cada item.', act: 'go-compras' },
      {
        id: 'g-budget-check', title: 'Conferir se o orçamento fecha', desc: 'A projeção precisa caber no teto — cace preço melhor se estourar.',
        auto: s => {
          if (s.meta.budgetTotal == null) return null;
          const st = computeStats();
          return st.spent + st.toSpend <= s.meta.budgetTotal;
        }, act: 'go-resumo',
      },
    ],
  },
  {
    id: 'pack', emoji: '🧳', name: 'Malas & caixas', when: 'Semana da mudança', steps: [
      { id: 'g-first-box', title: 'Organizar o que já é seu em malas e caixas', desc: 'Roupas e itens pessoais: malas e sacolas também entram na aba Caixas. Mudança pequena? Toque no círculo e siga.', auto: s => alive(s.boxes).length > 0 ? true : null, act: 'go-caixas' },
      {
        id: 'g-pack-all', title: 'Deixar tudo fechado e pronto', desc: 'O que for levar no dia deve estar embalado na véspera.',
        auto: s => {
          const b = alive(s.boxes);
          if (!b.length) return null;
          const dn = b.filter(x => x.status !== 'aberta').length;
          return { done: dn === b.length, prog: `${dn}/${b.length}` };
        }, act: 'go-caixas',
      },
      { id: 'g-mala', task: 't-mala', title: 'Montar a mala dos primeiros dias', act: 'go-tarefas' },
      { id: 'g-degelo', task: 't-degelo', title: 'Descongelar a geladeira 24 h antes', act: 'go-tarefas' },
      { id: 'g-conf-frete', task: 't-confirmar-frete', title: 'Confirmar horário com o frete', act: 'go-tarefas' },
      { id: 'g-limpeza', task: 't-limpeza-novo', title: 'Limpeza pesada do imóvel novo', act: 'go-tarefas' },
      { id: 'g-desmontar', task: 't-desmontar', title: 'Desmontar móveis (parafusos etiquetados!)', act: 'go-tarefas' },
    ],
  },
  {
    id: 'day', emoji: '🚚', name: 'Dia da mudança', when: 'O grande dia', steps: [
      { id: 'g-kit', task: 't-kit-dia', title: 'Kit básico acessível (água, papel, carregador)', act: 'go-tarefas' },
      { id: 'g-valores', task: 't-valores', title: 'Documentos e valores vão com você', act: 'go-tarefas' },
      {
        id: 'g-truck', title: 'Conferir volumes na saída e na chegada', desc: 'Dê baixa em cada mala/caixa que chegar no novo lar.',
        auto: s => {
          const b = alive(s.boxes);
          if (!b.length) return null;
          const dn = b.filter(x => x.status === 'destino' || x.status === 'desfeita').length;
          return { done: dn === b.length, prog: `${dn}/${b.length}` };
        }, act: 'go-caixas',
      },
      { id: 'g-receive', title: 'Receber entregas e doações no novo lar', desc: 'Confira cada item que chegar e marque como comprado/ganho na lista.', act: 'go-compras-pend' },
      { id: 'g-leituras', task: 't-leituras', title: 'Anotar leituras de luz e água', act: 'go-tarefas' },
      { id: 'g-chaves', task: 't-chaves', title: 'Entregar as chaves do imóvel antigo', act: 'go-tarefas' },
    ],
  },
  {
    id: 'home', emoji: '🏠', name: 'Novo lar', when: 'Primeiros dias', steps: [
      {
        id: 'g-unpack-prio', title: 'Desfazer as caixas "abrir primeiro"', desc: 'As com ⭐ têm o que você precisa já nos primeiros dias.',
        auto: s => {
          const pb = alive(s.boxes).filter(b => b.priority);
          if (!pb.length) return null;
          const dn = pb.filter(b => b.status === 'desfeita').length;
          return { done: dn === pb.length, prog: `${dn}/${pb.length}` };
        }, act: 'go-caixas',
      },
      { id: 'g-montar', task: 't-montar', title: 'Montar os móveis', act: 'go-tarefas' },
      { id: 'g-endereco', task: 't-endereco', title: 'Atualizar endereço em bancos e cadastros', act: 'go-tarefas' },
      { id: 'g-correios', task: 't-correios', title: 'Redirecionar correspondência nos Correios', act: 'go-tarefas' },
      {
        id: 'g-finish-buys', title: 'Concluir as compras restantes', desc: 'Sem pressa: o essencial já está aí.',
        auto: s => {
          const its = alive(s.items);
          const dn = its.filter(isResolved).length;
          return { done: its.length > 0 && dn === its.length, prog: `${dn}/${its.length}` };
        }, act: 'go-compras-pend',
      },
      { id: 'g-vizinhanca', task: 't-vizinhanca', title: 'Explorar a vizinhança', act: 'go-tarefas' },
      { id: 'g-done', title: 'Brindar o novo lar 🥂', desc: 'Você conseguiu! As caixas que sobraram podem esperar.' },
    ],
  },
];

function guideSteps() { return (state.guide && state.guide.steps) || {}; }

function stepInfo(step) {
  const manual = !!(guideSteps()[step.id] && guideSteps()[step.id].done);
  if (step.task) {
    const t = alive(state.tasks).find(x => x.id === step.task);
    if (t) return { done: t.done || manual, prog: null, task: t };
  }
  let auto = null, prog = null;
  if (step.auto) {
    const r = step.auto(state);
    if (r && typeof r === 'object') { auto = r.done; prog = r.prog; }
    else auto = !!r;
  }
  return { done: manual || !!auto, prog, autoDone: !!auto };
}

function stageDone(stage) { return stage.steps.every(s => stepInfo(s).done); }

function findGuideStep(id) {
  for (const stg of GUIDE_STAGES) {
    const step = stg.steps.find(s => s.id === id);
    if (step) return { stage: stg, step };
  }
  return {};
}

/* Etapa recomendada pelo calendário (índice em GUIDE_STAGES) */
function recommendedStage() {
  const d = daysUntil(state.meta.movingDate);
  if (d == null) return 0;
  if (d > 14) return 1;
  if (d > 7) return 2;
  if (d > 0) return 3;
  if (d === 0) return 4;
  return 5;
}

/* Próximas ações: o que importa AGORA, já ranqueado */
function nowActions() {
  const acts = [];
  const seenTasks = new Set();
  const st = computeStats();

  if (!state.meta.movingDate) {
    acts.push({ kind: 'alert', emoji: '📅', title: 'Defina a data da mudança', sub: 'Destrava o calendário do guia', act: 'open-setup' });
  }
  const pend = alive(state.tasks).filter(t => !t.done);
  for (const t of pend.filter(t => t.due && daysUntil(t.due) < 0).slice(0, 2)) {
    seenTasks.add(t.id);
    acts.push({ kind: 'task', task: t });
  }
  if (state.meta.budgetTotal != null && st.spent + st.toSpend > state.meta.budgetTotal) {
    acts.push({ kind: 'alert', emoji: '💸', title: 'A projeção estourou o teto', sub: `Corte ${fmtMoney(st.spent + st.toSpend - state.meta.budgetTotal)} ou ajuste o teto`, act: 'go-compras-pend' });
  }
  const rec = Math.min(recommendedStage(), GUIDE_STAGES.length - 1);
  for (let i = 0; i <= rec && acts.length < 5; i++) {
    for (const step of GUIDE_STAGES[i].steps) {
      if (acts.length >= 5) break;
      const info = stepInfo(step);
      if (info.done) continue;
      if (step.task && seenTasks.has(step.task)) continue;
      if (step.id === 'g-date' && !state.meta.movingDate) continue; // já coberto acima
      if (step.task) seenTasks.add(step.task);
      acts.push({ kind: 'step', stage: GUIDE_STAGES[i], step });
    }
  }
  for (const t of pend.filter(t => t.due && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 3 && !seenTasks.has(t.id))) {
    if (acts.length >= 5) break;
    acts.push({ kind: 'task', task: t });
  }
  return acts.slice(0, 5);
}

/* ================= Toasts ================= */

function toast(msg, opts = {}) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>` + (opts.undo ? '<button type="button">Desfazer</button>' : '');
  if (opts.undo) el.querySelector('button').onclick = () => { opts.undo(); el.remove(); };
  box.appendChild(el);
  setTimeout(() => el.remove(), opts.undo ? 7000 : 3500);
}

/* ================= Tema ================= */

const darkMq = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const mode = prefs.theme || 'auto';
  const dark = mode === 'dark' || (mode === 'auto' && darkMq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
darkMq.addEventListener('change', applyTheme);

/* ================= Renderização ================= */

let lastTab = null;

function render() {
  renderTopbar();
  const v = prefs.tab || 'resumo';
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === v));
  const keepScroll = lastTab === v;
  const y = window.scrollY;
  $('#view').innerHTML = VIEWS[v] ? VIEWS[v]() : VIEWS.resumo();
  lastTab = v;
  window.scrollTo(0, keepScroll ? y : 0);
}

function renderTopbar() {
  $('#brand-title').textContent = state.meta.title || 'Mudei';
  const btn = $('#profile-btn');
  const p = personById(profile.personId);
  if (p) {
    btn.textContent = initials(p.name);
    btn.style.background = p.color || PERSON_COLORS[0];
    btn.title = `Você: ${p.name}`;
  } else {
    btn.textContent = '?';
    btn.style.background = 'var(--muted)';
    btn.title = 'Dizer quem está usando';
  }
  const chipBox = $('#countdown-chip');
  const days = daysUntil(state.meta.movingDate);
  if (days == null) { chipBox.innerHTML = ''; return; }
  let label, cls = 'accent';
  if (days > 1) label = `🚚 ${days} dias`;
  else if (days === 1) label = '🚚 amanhã!';
  else if (days === 0) { label = '🎉 é hoje!'; cls = 'green'; }
  else { label = `🏠 dia ${-days}`; cls = 'green'; }
  chipBox.innerHTML = `<span class="chip ${cls}">${label}</span>`;
}

/* ---------- helpers de UI ---------- */

function avatarHtml(person, size) {
  if (!person) return '';
  return `<span class="avatar" style="background:${esc(person.color || PERSON_COLORS[0])}${size ? `;width:${size}px;height:${size}px` : ''}">${esc(initials(person.name))}</span>`;
}

function assigneeChip(id) {
  const p = personById(id);
  if (!p) return '';
  return `<span class="chip">${avatarHtml(p)} ${esc(p.name.split(' ')[0])}</span>`;
}

const PRIO_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const COND_LABEL = { novo: 'Novo', usado: 'Usado', doacao: 'Doação' };
const STATUS_META = {
  pendente:    { label: 'A conseguir',   cls: '' },
  pesquisando: { label: 'Pesquisando',   cls: 'blue' },
  prometido:   { label: '🤝 Prometido',  cls: 'amber' },
  comprado:    { label: 'Comprado ✓',    cls: 'green' },
  doado:       { label: 'Ganhei ✓',      cls: 'teal' },
};

function progressBar(pct, extraCls) {
  const p = Math.max(0, Math.min(100, pct || 0));
  return `<div class="progress ${extraCls || ''}"><div style="width:${p}%"></div></div>`;
}

function emptyState(emoji, title, hint) {
  return `<div class="empty"><span class="empty-emoji">${emoji}</span><b>${esc(title)}</b><br><span class="small">${esc(hint || '')}</span></div>`;
}

/* ================= VIEW: Guia (tela inicial) ================= */

function stepRowHtml(step) {
  const info = stepInfo(step);
  const goBtn = step.act && !info.done
    ? `<button class="chip step-go" data-act="${step.act}" data-stop="1">abrir →</button>` : '';
  return `
    <div class="task-row step-row ${info.done ? 'done' : ''}">
      <button class="bigcheck ${info.done ? 'on' : ''}" style="width:23px;height:23px"
        data-act="toggle-step" data-id="${step.id}" data-stop="1" aria-label="Concluir passo">✓</button>
      <div class="grow" ${step.act ? `data-act="${step.act}"` : ''}>
        <div class="task-title">${esc(step.title)}${info.prog ? ` <span class="chip step-prog">${info.prog}</span>` : ''}</div>
        ${step.desc ? `<div class="task-sub"><span>${esc(step.desc)}</span></div>` : ''}
      </div>
      ${goBtn}
    </div>`;
}

function stageCardHtml(stage, idx, rec, expandedId) {
  const doneCount = stage.steps.filter(s => stepInfo(s).done).length;
  const total = stage.steps.length;
  const complete = doneCount === total;
  const open = expandedId === stage.id;
  let chip = '';
  if (complete) chip = '<span class="chip green">✓ concluída</span>';
  else if (idx === rec) chip = '<span class="chip accent">é agora</span>';
  else if (idx < rec) chip = '<span class="chip red">em atraso</span>';
  return `
    <section class="card phase-card stage-card ${complete ? 'stage-done' : ''}">
      <button class="phase-head" data-act="toggle-stage" data-id="${stage.id}">
        <span class="stage-badge ${complete ? 'done' : ''} ${idx === rec && !complete ? 'rec' : ''}">${complete ? '✓' : idx + 1}</span>
        <span class="grow">
          <div class="phase-name">${stage.emoji} ${esc(stage.name)} ${chip}</div>
          <div class="phase-hint">${esc(stage.when)}</div>
        </span>
        <span class="phase-count">${doneCount}/${total}</span>
        <span class="chev" style="transform:rotate(${open ? 0 : -90}deg)">▾</span>
      </button>
      <div class="phase-progress"><div style="width:${total ? doneCount / total * 100 : 0}%"></div></div>
      ${open ? `<div class="task-list">${stage.steps.map(stepRowHtml).join('')}</div>` : ''}
    </section>`;
}

function nowCardHtml() {
  const acts = nowActions();
  if (!acts.length) {
    return `<section class="card now-card"><h3>🧭 Agora</h3>
      <p class="muted">Tudo em dia por aqui ✨ Aproveite para adiantar a próxima etapa da jornada.</p></section>`;
  }
  const rows = acts.map(a => {
    if (a.kind === 'task') return taskRowHtml(a.task);
    if (a.kind === 'step') return stepRowHtml(a.step);
    return `
      <button class="alert-item" data-act="${a.act}">
        <span>${a.emoji}</span>
        <span class="grow">${esc(a.title)}<br><span class="muted small">${esc(a.sub)}</span></span>
        <span class="muted">→</span>
      </button>`;
  }).join('');
  return `<section class="card now-card"><h3>🧭 Agora <span class="count">o que importa hoje</span></h3>${rows}</section>`;
}

function viewResumo() {
  const st = computeStats();
  const total = st.items.length;
  const done = st.resolved.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const days = daysUntil(state.meta.movingDate);

  let dateLine;
  if (state.meta.movingDate) {
    dateLine = `<div class="hero-date">📅 ${esc(fmtDate(state.meta.movingDate))}</div>
      <div class="hero-days">${days > 0 ? `Faltam ${days} dia${days > 1 ? 's' : ''} — bora!` : days === 0 ? 'É hoje! Boa mudança! 🎉' : 'Agora é curtir o novo lar ✨'}</div>`;
  } else {
    dateLine = `<div class="hero-days"><button class="btn btn-sm" style="background:rgba(255,255,255,.22);border-color:transparent;color:#fff" data-act="open-setup">📅 Definir a data da mudança</button></div>`;
  }

  const hero = `
    <section class="card hero">
      <h2>${esc(state.meta.title || 'Minha Mudança')}</h2>
      ${dateLine}
      ${progressBar(pct)}
      <div class="progress-label"><span>${done} de ${total} itens resolvidos</span><span>${pct}%</span></div>
    </section>`;

  const rec = recommendedStage();
  const firstIncomplete = GUIDE_STAGES.find(s => !stageDone(s));
  const expandedId = prefs.openStage === '__none' ? null
    : (prefs.openStage || (firstIncomplete ? firstIncomplete.id : null));
  const doneStages = GUIDE_STAGES.filter(stageDone).length;
  const jornada = `
    <h3 class="section-title">🗺️ Jornada da mudança <span class="count">${doneStages}/${GUIDE_STAGES.length} etapas</span></h3>
    ${GUIDE_STAGES.map((s, i) => stageCardHtml(s, i, rec, expandedId)).join('')}`;

  const overBudget = state.meta.budgetTotal != null && st.spent + st.toSpend > state.meta.budgetTotal;
  const statCards = `
    <h3 class="section-title">📊 Números</h3>
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">Orçamento previsto</div><div class="stat-value">${fmtMoney(st.budget)}</div><div class="stat-hint">soma dos itens</div></div>
      <div class="stat"><div class="stat-label">Do seu bolso</div><div class="stat-value">${fmtMoney(st.spent)}</div><div class="stat-hint">${st.spentByOthers ? `+ ${fmtMoney(st.spentByOthers)} pagos por outros 💝` : (n => `${n} compra${n === 1 ? '' : 's'} sua${n === 1 ? '' : 's'}`)(st.resolved.filter(i => i.status === 'comprado').length)}</div></div>
      <div class="stat ${overBudget ? 'bad' : ''}"><div class="stat-label">Ainda vai gastar</div><div class="stat-value">${fmtMoney(st.toSpend)}</div><div class="stat-hint">doações não entram na conta</div></div>
      <div class="stat ${st.saved > 0 ? 'good' : ''}"><div class="stat-label">Economia</div><div class="stat-value">${fmtMoney(st.saved)}</div><div class="stat-hint">doações e presentes contam</div></div>
    </div>`;

  let budgetCard = '';
  if (state.meta.budgetTotal != null) {
    const projected = st.spent + st.toSpend;
    const pctB = Math.round(st.spent / state.meta.budgetTotal * 100);
    budgetCard = `
      <section class="card">
        <h3>💰 Teto de gastos <span class="count">${fmtMoney(state.meta.budgetTotal)}</span></h3>
        ${progressBar(pctB, st.spent > state.meta.budgetTotal ? '' : 'green')}
        <div class="progress-label">
          <span>Do seu bolso: <b>${fmtMoney(st.spent)}</b></span>
          <span>Projeção final: <b style="color:${projected > state.meta.budgetTotal ? 'var(--red)' : 'var(--green)'}">${fmtMoney(projected)}</b></span>
        </div>
        ${projected > state.meta.budgetTotal ? `<p class="small" style="color:var(--red)">⚠️ A projeção passa do teto em ${fmtMoney(projected - state.meta.budgetTotal)}. Vale caçar preço melhor ou cortar itens.</p>` : ''}
      </section>`;
  }

  const cats = alive(state.cats);
  const catRows = cats.map(c => {
    const its = st.items.filter(i => i.cat === c.id);
    if (!its.length) return '';
    const dn = its.filter(isResolved).length;
    const val = sum(its.filter(i => !isResolved(i)), i => itemEstimate(i));
    return `
      <div class="cat-summary-row">
        <span class="nm">${c.emoji} ${esc(c.name)}</span>
        <span class="bar">${progressBar(its.length ? dn / its.length * 100 : 0, 'green')}</span>
        <span class="val">${dn}/${its.length}${val ? ` · falta ${fmtMoney(val)}` : ''}</span>
      </div>`;
  }).join('');

  const logCard = state.log.length ? `
    <section class="card">
      <h3>🕓 Atividade recente</h3>
      ${state.log.slice(0, 8).map(l => `
        <div class="log-row"><span>${l.emoji || '•'}</span><span><b>${esc(l.who)}</b> ${esc(l.text)}</span><span class="when">${relTime(l.ts)}</span></div>`).join('')}
    </section>` : '';

  const tourCard = (!prefs.tourDone && !prefs.tourHidden) ? `
    <section class="card tour-invite">
      <span class="tour-invite-emoji">👋</span>
      <div class="grow"><b>Primeira vez por aqui?</b><br><span class="small muted">Um tour de 1 minuto mostra como tudo funciona.</span></div>
      <button class="btn btn-primary btn-sm" data-act="tour-start">Fazer o tour</button>
      <button class="iconbtn tour-invite-x" data-act="tour-hide" aria-label="Dispensar">✕</button>
    </section>` : '';

  return `
    <h1 class="view-title">Guia</h1>
    <p class="view-sub">Sua mudança, passo a passo — o app marca sozinho o que você já resolveu</p>
    ${tourCard}
    ${hero}
    ${nowCardHtml()}
    ${jornada}
    ${statCards}
    ${budgetCard}
    <div class="dash-cols">
      <section class="card"><h3>🗂️ Por categoria</h3>${catRows || '<p class="muted">Sem itens ainda.</p>'}</section>
      ${logCard}
    </div>`;
}

/* ================= VIEW: Compras ================= */

function defaultFilters() {
  return { q: '', cat: '', prio: '', status: '', sort: 'prio', group: true, hideDone: false };
}

function filteredItems() {
  const f = prefs.f;
  let items = alive(state.items);
  if (f.cat) items = items.filter(i => i.cat === f.cat);
  if (f.prio) items = items.filter(i => i.prio === f.prio);
  if (f.status === 'pendentes') items = items.filter(i => !isResolved(i));
  else if (f.status === 'resolvidos') items = items.filter(isResolved);
  else if (f.status === 'doacoes') items = items.filter(i => isGift(i) || i.status === 'doado');
  else if (f.status) items = items.filter(i => i.status === f.status);
  if (f.hideDone) items = items.filter(i => !isResolved(i));
  if (f.q) {
    const q = f.q.toLowerCase();
    items = items.filter(i =>
      (i.name + ' ' + i.notes + ' ' + i.specs + ' ' + i.donor + ' ' + catById(i.cat).name).toLowerCase().includes(q));
  }
  const prioRank = { alta: 0, media: 1, baixa: 2 };
  const catOrder = Object.fromEntries(alive(state.cats).map((c, ix) => [c.id, ix]));
  const sorters = {
    prio:   (a, b) => (isResolved(a) - isResolved(b)) || (prioRank[a.prio] - prioRank[b.prio]) || a.name.localeCompare(b.name, 'pt-BR'),
    nome:   (a, b) => a.name.localeCompare(b.name, 'pt-BR'),
    preco:  (a, b) => (itemEstimate(b) || 0) - (itemEstimate(a) || 0),
    recente:(a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
  };
  items.sort(sorters[f.sort] || sorters.prio);
  if (f.group) items.sort((a, b) => (catOrder[a.cat] ?? 99) - (catOrder[b.cat] ?? 99));
  return items;
}

function itemCardHtml(i) {
  const cat = catById(i.cat);
  const stMeta = STATUS_META[i.status] || STATUS_META.pendente;
  const done = isResolved(i);
  const est = itemEstimate(i);
  const paid = i.paidPrice != null ? i.paidPrice : (i.status === 'comprado' ? i.bestPrice : null);

  let priceHtml = '';
  if (i.status === 'comprado' && paid != null) {
    priceHtml = `<span class="item-price">${fmtMoney(paid)}${i.budget != null && i.budget !== paid ? ` <span class="cut">${fmtMoney(i.budget)}</span>` : ''}</span>`;
  } else if (est != null) {
    priceHtml = `<span class="item-price">${i.bestPrice != null ? '🔎 ' : ''}${fmtMoney(est)}${i.bestPrice != null && i.budget != null ? ` <span class="cut">${fmtMoney(i.budget)}</span>` : ''}</span>`;
  }

  const links = (i.links || []).filter(l => l.url).map(l =>
    `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" data-stop="1">🔗 <span>${esc(l.label || l.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0])}</span></a>`).join('');

  return `
    <article class="item-card ${done ? 'done' : ''}" data-act="open-item" data-id="${i.id}">
      <button class="bigcheck ${i.status === 'comprado' ? 'on' : ''} ${i.status === 'doado' ? 'donated' : ''}"
        data-act="toggle-item" data-id="${i.id}" data-stop="1" aria-label="Marcar como resolvido">✓</button>
      <div class="item-main">
        <div class="item-top">
          <span class="item-name">${esc(i.name)}</span>
          <span class="pill-prio ${i.prio}">${PRIO_LABEL[i.prio] || ''}</span>
          ${i.status !== 'pendente' ? `<span class="chip ${stMeta.cls}">${stMeta.label}</span>` : ''}
        </div>
        <div class="item-meta">
          ${!prefs.f.group ? `<span>${cat.emoji} ${esc(cat.name)}</span>` : ''}
          ${priceHtml}
          ${i.cond ? `<span class="chip">${COND_LABEL[i.cond]}</span>` : ''}
          ${i.donor ? `<span class="chip teal">🎁 ${esc(i.donor)}</span>` : ''}
          ${i.paidBy ? `<span class="chip green">💝 pago por ${esc(i.paidBy)}</span>` : ''}
          ${assigneeChip(i.assigneeId)}
          ${i.space ? `<span title="Medidas do espaço">📐 ${esc(i.space)}</span>` : ''}
        </div>
        ${links ? `<div class="item-links">${links}</div>` : ''}
        ${i.notes ? `<div class="item-notes clamp">${esc(i.notes)}</div>` : ''}
      </div>
    </article>`;
}

function comprasListHtml() {
  const items = filteredItems();
  const pend = items.filter(i => !isResolved(i));
  const estTotal = sum(pend, i => i.cond === 'doacao' ? null : itemEstimate(i));

  let listHtml;
  if (!items.length) {
    listHtml = emptyState('🛒', 'Nada por aqui', prefs.f.q || prefs.f.cat || prefs.f.prio || prefs.f.status ? 'Tente limpar os filtros.' : 'Toque em + para adicionar o primeiro item.');
  } else if (prefs.f.group) {
    const groups = new Map();
    for (const i of items) {
      if (!groups.has(i.cat)) groups.set(i.cat, []);
      groups.get(i.cat).push(i);
    }
    listHtml = Array.from(groups.entries()).map(([catId, its]) => {
      const cat = catById(catId);
      const dn = its.filter(isResolved).length;
      const closed = prefs.closedCats && prefs.closedCats.includes(catId);
      return `
        <div class="cat-group">
          <button class="cat-head ${closed ? 'closed' : ''}" data-act="toggle-cat" data-id="${catId}">
            <span>${cat.emoji}</span>
            <span class="cat-name">${esc(cat.name)}</span>
            <span class="cat-stats">${dn}/${its.length}</span>
            <span class="chev">▾</span>
          </button>
          ${closed ? '' : its.map(itemCardHtml).join('')}
        </div>`;
    }).join('');
  } else {
    listHtml = items.map(itemCardHtml).join('');
  }

  return `
    <div class="filter-summary">
      <span><b>${pend.length}</b> pendente${pend.length === 1 ? '' : 's'}${estTotal ? ` · estimativa <b>${fmtMoney(estTotal)}</b>` : ''}</span>
      <span class="grow"></span>
      <button class="btn btn-ghost btn-sm" data-act="open-kit">💡 kit enxoval</button>
      <button class="btn btn-ghost btn-sm" data-act="share-text">📋 copiar lista</button>
    </div>
    ${listHtml}`;
}

function viewCompras() {
  const f = prefs.f;
  const cats = alive(state.cats);
  return `
    <h1 class="view-title">Compras</h1>
    <p class="view-sub">O que precisa entrar no novo lar</p>
    <div class="toolbar">
      <div class="searchbox">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="search-items" placeholder="Buscar item, anotação, doador…" value="${esc(f.q)}" autocomplete="off">
      </div>
      <div class="chips-scroll">
        <button class="chip-filter ${!f.cat ? 'on' : ''}" data-act="filter-cat" data-id="">Todas</button>
        ${cats.map(c => `<button class="chip-filter ${f.cat === c.id ? 'on' : ''}" data-act="filter-cat" data-id="${c.id}">${c.emoji} ${esc(c.name)}</button>`).join('')}
      </div>
      <div class="selects-row">
        <select id="sel-status">
          <option value="">Situação: todas</option>
          <option value="pendentes" ${f.status === 'pendentes' ? 'selected' : ''}>Pendentes</option>
          <option value="pesquisando" ${f.status === 'pesquisando' ? 'selected' : ''}>Pesquisando</option>
          <option value="doacoes" ${f.status === 'doacoes' ? 'selected' : ''}>🤝 Doações</option>
          <option value="resolvidos" ${f.status === 'resolvidos' ? 'selected' : ''}>Resolvidos ✓</option>
        </select>
        <select id="sel-prio">
          <option value="">Prioridade: todas</option>
          <option value="alta" ${f.prio === 'alta' ? 'selected' : ''}>🔴 Alta</option>
          <option value="media" ${f.prio === 'media' ? 'selected' : ''}>🟡 Média</option>
          <option value="baixa" ${f.prio === 'baixa' ? 'selected' : ''}>⚪ Baixa</option>
        </select>
        <select id="sel-sort">
          <option value="prio" ${f.sort === 'prio' ? 'selected' : ''}>Ordem: prioridade</option>
          <option value="nome" ${f.sort === 'nome' ? 'selected' : ''}>Ordem: nome</option>
          <option value="preco" ${f.sort === 'preco' ? 'selected' : ''}>Ordem: preço</option>
          <option value="recente" ${f.sort === 'recente' ? 'selected' : ''}>Ordem: recentes</option>
        </select>
        <select id="sel-group">
          <option value="1" ${f.group ? 'selected' : ''}>Agrupar: categoria</option>
          <option value="" ${!f.group ? 'selected' : ''}>Lista corrida</option>
        </select>
      </div>
    </div>
    <div id="list-region">${comprasListHtml()}</div>
    <button class="fab" data-act="new-item" aria-label="Adicionar item">+</button>`;
}

/* ================= VIEW: Tarefas ================= */

function taskRowHtml(t) {
  const overdue = t.due && !t.done && daysUntil(t.due) < 0;
  const dueSoon = t.due && !t.done && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 3;
  return `
    <div class="task-row ${t.done ? 'done' : ''}" data-act="open-task" data-id="${t.id}">
      <button class="bigcheck ${t.done ? 'on' : ''}" style="width:23px;height:23px" data-act="toggle-task" data-id="${t.id}" data-stop="1" aria-label="Concluir tarefa">✓</button>
      <div class="grow">
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-sub">
          ${t.due ? `<span class="${overdue ? 'overdue' : ''}">${overdue ? '⚠️ venceu ' : dueSoon ? '⏰ ' : '📅 '}${fmtDateShort(t.due)}</span>` : ''}
          ${assigneeChip(t.assigneeId)}
          ${t.notes ? `<span>💬 ${esc(t.notes.length > 60 ? t.notes.slice(0, 60) + '…' : t.notes)}</span>` : ''}
        </div>
      </div>
    </div>`;
}

function viewTarefas() {
  const tasks = alive(state.tasks);
  const showDone = !!prefs.showDoneTasks;
  const phases = TASK_PHASES.map(ph => {
    const all = tasks.filter(t => t.phase === ph.id);
    if (!all.length) return '';
    const done = all.filter(t => t.done).length;
    const list = all.filter(t => showDone || !t.done);
    const closed = prefs.closedPhases && prefs.closedPhases.includes(ph.id);
    return `
      <section class="card phase-card">
        <button class="phase-head" data-act="toggle-phase" data-id="${ph.id}">
          <span class="phase-emoji">${ph.emoji}</span>
          <span>
            <div class="phase-name">${esc(ph.name)}</div>
            <div class="phase-hint">${esc(ph.hint)}</div>
          </span>
          <span class="phase-count">${done}/${all.length}</span>
        </button>
        <div class="phase-progress"><div style="width:${all.length ? done / all.length * 100 : 0}%"></div></div>
        ${closed ? '' : `<div class="task-list">${list.length ? list.map(taskRowHtml).join('') : '<p class="muted small" style="padding:6px 8px">Todas concluídas ✓</p>'}</div>`}
      </section>`;
  }).join('');

  const total = tasks.length, done = tasks.filter(t => t.done).length;
  return `
    <h1 class="view-title">Tarefas</h1>
    <p class="view-sub">${done} de ${total} concluídas</p>
    <div class="toolbar">
      <div class="chips-scroll">
        <button class="chip-filter ${showDone ? 'on' : ''}" data-act="toggle-show-done">${showDone ? '✓ Mostrando concluídas' : 'Mostrar concluídas'}</button>
      </div>
    </div>
    ${phases || emptyState('✅', 'Sem tarefas', 'Toque em + para criar a primeira.')}
    <button class="fab" data-act="new-task" aria-label="Adicionar tarefa">+</button>`;
}

/* ================= VIEW: Caixas ================= */

const BOX_STATUS = {
  aberta:   { label: '📭 Empacotando', cls: '', next: 'fechada', nextLabel: 'fechar caixa' },
  fechada:  { label: '📦 Fechada', cls: 'amber', next: 'destino', nextLabel: 'chegou no destino' },
  destino:  { label: '🚚 No novo lar', cls: 'blue', next: 'desfeita', nextLabel: 'desfeita!' },
  desfeita: { label: '✅ Desfeita', cls: 'green', next: null },
};

function boxesListHtml() {
  let boxes = alive(state.boxes).sort((a, b) => (a.num || 0) - (b.num || 0));
  const q = (prefs.boxQ || '').toLowerCase();
  if (q) boxes = boxes.filter(b => ((b.contents || '') + ' ' + catById(b.room).name + ' ' + b.num).toLowerCase().includes(q));
  if (!boxes.length) {
    return emptyState('📦', q ? 'Nenhuma caixa encontrada' : 'Nenhuma caixa ainda',
      q ? 'Procure por outra palavra — a busca olha o conteúdo de cada caixa.' : 'Numere as caixas e liste o conteúdo. Malas e sacolas de roupa também contam!');
  }
  return `<div class="box-grid">${boxes.map(b => {
    const stMeta = BOX_STATUS[b.status] || BOX_STATUS.aberta;
    const room = catById(b.room);
    return `
      <article class="box-card" data-act="open-box" data-id="${b.id}">
        <div class="box-num">#${b.num} <span class="badges">${b.fragile ? '⚠️' : ''}${b.priority ? '⭐' : ''}</span></div>
        <div class="box-room">${room.emoji} ${esc(room.name)}</div>
        <div class="box-contents">${esc(b.contents || 'Sem descrição')}</div>
        <div class="box-status"><span class="chip ${stMeta.cls}">${stMeta.label}</span></div>
        ${stMeta.next ? `<button class="box-next" data-act="advance-box" data-id="${b.id}" data-stop="1">→ ${stMeta.nextLabel}</button>` : ''}
      </article>`;
  }).join('')}</div>`;
}

function viewCaixas() {
  const boxes = alive(state.boxes);
  return `
    <h1 class="view-title">Caixas</h1>
    <p class="view-sub">Inventário do que foi empacotado — a busca encontra em qual caixa cada coisa está</p>
    <div class="toolbar">
      <div class="searchbox">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="search-boxes" placeholder='Onde está…? Ex.: "panela"' value="${esc(prefs.boxQ || '')}" autocomplete="off">
      </div>
      ${boxes.length ? `<div class="chips-scroll">
        <span class="chip">📦 ${boxes.length} caixa${boxes.length === 1 ? '' : 's'}</span>
        <span class="chip amber">fechadas: ${boxes.filter(b => b.status === 'fechada').length}</span>
        <span class="chip blue">no destino: ${boxes.filter(b => b.status === 'destino').length}</span>
        <span class="chip green">desfeitas: ${boxes.filter(b => b.status === 'desfeita').length}</span>
        <span class="chip">⭐ abrir primeiro: ${boxes.filter(b => b.priority && b.status !== 'desfeita').length}</span>
      </div>` : ''}
    </div>
    <div id="list-region">${boxesListHtml()}</div>
    <button class="fab" data-act="new-box" aria-label="Adicionar caixa">+</button>`;
}

/* ================= VIEW: Equipe ================= */

function viewEquipe() {
  const people = alive(state.people);
  const items = alive(state.items);
  const tasks = alive(state.tasks);
  const cards = people.map(p => {
    const itsP = items.filter(i => i.assigneeId === p.id && !isResolved(i)).length;
    const tksP = tasks.filter(t => t.assigneeId === p.id && !t.done).length;
    const itsD = items.filter(i => i.assigneeId === p.id && isResolved(i)).length;
    const tksD = tasks.filter(t => t.assigneeId === p.id && t.done).length;
    const isMe = profile.personId === p.id;
    return `
      <article class="person-card" data-act="open-person" data-id="${p.id}">
        ${avatarHtml(p, 40)}
        <div class="grow">
          <div class="person-name">${esc(p.name)} ${isMe ? '<span class="chip accent">você</span>' : ''}</div>
          <div class="person-stats">${itsP + tksP ? `${itsP} item(ns) + ${tksP} tarefa(s) pendentes` : 'nada pendente'} · ${itsD + tksD} concluído(s)</div>
        </div>
      </article>`;
  }).join('');

  return `
    <h1 class="view-title">Equipe</h1>
    <p class="view-sub">Quem está ajudando na mudança</p>
    ${cards || emptyState('👥', 'Ninguém cadastrado ainda', 'Adicione as pessoas para atribuir compras e tarefas a cada uma.')}
    <section class="card" style="background:var(--accent-soft);border-color:transparent">
      <h3>🤝 Como colaborar ${state.meta.syncId ? '<span class="chip green">🔄 sincronização ativa</span>' : ''}</h3>
      ${state.meta.syncId ? `
        <p class="small" style="color:var(--accent-text)">Para entrar alguém novo: mande o <b>link com os dados</b> (botão compartilhar) — a pessoa abre <b>uma única vez</b>, toca em "Mesclar" e pronto. Daí em diante <b>tudo se junta sozinho pela internet</b>: o que cada um marcar aparece nos outros celulares automaticamente.</p>
        <button class="btn btn-sm btn-primary" data-act="open-share">Convidar mais alguém</button>
      ` : `
        <p class="small" style="color:var(--accent-text)">1. Toque em <b>Ativar sincronização</b> (uma vez só).<br>
        2. Mande o <b>link com os dados</b> para cada pessoa — ela abre uma única vez e toca em "Mesclar".<br>
        3. Pronto: daí em diante <b>tudo se junta sozinho pela internet</b>, sem mandar link nunca mais.</p>
        <button class="btn btn-sm btn-primary" data-act="open-share">Ativar sincronização</button>
      `}
    </section>
    <button class="fab" data-act="new-person" aria-label="Adicionar pessoa">+</button>`;
}

/* ================= VIEW: Ajustes ================= */

function viewAjustes() {
  const me = personById(profile.personId);
  const cats = alive(state.cats);
  const catRows = cats.map(c => {
    if (editingCatId === c.id) {
      return `
        <div class="cat-row" data-catid="${c.id}">
          <input class="cat-emoji-input" value="${esc(c.emoji)}" maxlength="4" style="width:52px;text-align:center;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:6px 4px">
          <input class="cat-name-input" value="${esc(c.name)}" maxlength="30" style="flex:1;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:6px 10px">
          <button class="btn btn-sm btn-primary" data-act="save-cat" data-id="${c.id}">OK</button>
          <button class="btn btn-sm btn-ghost" data-act="cancel-cat">✕</button>
        </div>`;
    }
    return `
      <div class="cat-row">
        <span class="cat-emoji">${c.emoji}</span>
        <span class="grow">${esc(c.name)}</span>
        <button class="btn btn-sm btn-ghost" data-act="edit-cat" data-id="${c.id}">✏️</button>
        ${c.id !== 'outros' ? `<button class="btn btn-sm btn-ghost" data-act="del-cat" data-id="${c.id}" style="color:var(--red)">🗑</button>` : ''}
      </div>`;
  }).join('');

  return `
    <h1 class="view-title">Ajustes</h1>
    <p class="view-sub">Configurações da mudança e do app</p>

    <section class="card">
      <h3>🚚 Minha mudança</h3>
      <div class="settings-row">
        <div class="lbl"><b>Nome</b><span>aparece no topo do app</span></div>
        <input type="text" id="set-title" value="${esc(state.meta.title)}" maxlength="40">
      </div>
      <div class="settings-row">
        <div class="lbl"><b>Data da mudança</b><span>ativa a contagem regressiva</span></div>
        <input type="date" id="set-date" value="${esc(state.meta.movingDate)}">
      </div>
      <div class="settings-row">
        <div class="lbl"><b>Teto de gastos (R$)</b><span>alerta se a projeção passar</span></div>
        <input type="text" id="set-budget" inputmode="decimal" placeholder="ex.: 8.000" value="${esc(moneyInputValue(state.meta.budgetTotal))}">
      </div>
    </section>

    <section class="card">
      <h3>👤 Este aparelho</h3>
      <div class="settings-row">
        <div class="lbl"><b>Quem está usando</b><span>assina as alterações feitas aqui</span></div>
        <button class="btn btn-sm" data-act="open-profile">${me ? esc(me.name) : 'Definir'} ↺</button>
      </div>
      <div class="settings-row">
        <div class="lbl"><b>Tema</b><span>claro, escuro ou automático</span></div>
        <select id="set-theme">
          <option value="auto" ${(prefs.theme || 'auto') === 'auto' ? 'selected' : ''}>Automático</option>
          <option value="light" ${prefs.theme === 'light' ? 'selected' : ''}>Claro</option>
          <option value="dark" ${prefs.theme === 'dark' ? 'selected' : ''}>Escuro</option>
        </select>
      </div>
      <div class="settings-row">
        <div class="lbl"><b>Tour pelo app</b><span>reveja o passeio guiado pelas funções</span></div>
        <button class="btn btn-sm" data-act="tour-start">▶ Iniciar</button>
      </div>
      <div class="settings-row" id="install-row">
        <div class="lbl"><b>Instalar como app</b><span>ícone na tela inicial, funciona offline</span></div>
        ${deferredInstall
          ? '<button class="btn btn-sm btn-primary" data-act="install-app">Instalar</button>'
          : '<span class="small muted" style="max-width:170px;text-align:right">No navegador: menu → "Adicionar à tela inicial"</span>'}
      </div>
    </section>

    <section class="card">
      <h3>🗂️ Categorias / cômodos</h3>
      ${catRows}
      <button class="btn btn-ghost btn-sm" data-act="new-cat" style="margin-top:8px">+ nova categoria</button>
    </section>

    <section class="card">
      <h3>📄 Planilha do Google</h3>
      <p class="small muted" style="margin-top:0">Alguém mantém a planilha no Google? Cole o link e puxe as novidades para cá (mão única: planilha → app). Nada é apagado — células vazias não sobrescrevem e "Comprado" só marca, nunca desmarca.</p>
      <label class="field">
        <span>Link da planilha</span>
        <input type="url" id="set-sheet" inputmode="url" placeholder="https://docs.google.com/spreadsheets/d/…" value="${esc(state.meta.sheetUrl || '')}">
      </label>
      <label class="check">
        <input type="checkbox" id="set-sheet-auto" ${state.meta.sheetAuto ? 'checked' : ''}>
        <span>Conferir automaticamente ao abrir o app</span>
      </label>
      <div class="btn-row">
        <button class="btn btn-primary" data-act="sheet-sync">⬇ Importar agora</button>
        <button class="btn" data-act="export-csv">⬆ Exportar para planilha (CSV)</button>
      </div>
      ${prefs.sheetLastSync ? `<p class="small muted">Última importação: há ${relTime(prefs.sheetLastSync)}.</p>` : ''}
      <p class="small muted">Requisitos: no Google Sheets, o arquivo precisa ser uma <b>Planilha Google de verdade</b> (se for .xlsx, use <i>Arquivo → Salvar como Planilhas Google</i>) e estar compartilhado como <b>"Qualquer pessoa com o link — Leitor"</b>. As colunas são as da planilha original (Categoria, Item, Prioridade…).</p>
    </section>

    <section class="card">
      <h3>💾 Dados</h3>
      <div class="btn-row">
        <button class="btn" data-act="open-share">Compartilhar / sincronizar</button>
        <button class="btn" data-act="export-json">Exportar backup</button>
        <button class="btn" data-act="import-json">Importar backup</button>
      </div>
      <div class="settings-row" style="margin-top:10px">
        <div class="lbl"><b style="color:var(--red)">Zerar tudo</b><span>apaga tudo e restaura a lista inicial da planilha</span></div>
        <button class="btn btn-sm btn-danger-ghost" data-act="reset-all">Zerar</button>
      </div>
    </section>

    <p class="muted small" style="text-align:center">Mudei · feito para organizar a sua mudança 🧡<br>Os dados ficam só no seu navegador — exporte um backup de vez em quando.</p>`;
}

const VIEWS = {
  resumo: viewResumo,
  compras: viewCompras,
  tarefas: viewTarefas,
  caixas: viewCaixas,
  equipe: viewEquipe,
  ajustes: viewAjustes,
};

/* ================= Dialogs ================= */

function openDlg(sel) { const d = $(sel); if (!d.open) d.showModal(); }
function closeDlg(el) { const d = el.closest('dialog'); if (d) d.close(); }

function fillSelect(sel, options, value) {
  sel.innerHTML = options.map(o => `<option value="${esc(o.value)}" ${o.value === value ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
}

function peopleOptions(value) {
  return [{ value: '', label: '— ninguém —' }]
    .concat(alive(state.people).map(p => ({ value: p.id, label: p.name })));
}

function catOptions(value) {
  return alive(state.cats).map(c => ({ value: c.id, label: `${c.emoji} ${c.name}` }));
}

/* ---------- Item ---------- */

let editItemId = null;

function linkRowHtml(l) {
  return `
    <div class="link-row">
      <input class="link-label" placeholder="Descrição / loja" value="${esc(l && l.label || '')}" maxlength="120">
      <button type="button" class="iconbtn link-open" data-act="open-link-row" title="Abrir o link da loja" aria-label="Abrir link">↗</button>
      <button type="button" class="iconbtn" data-act="rm-link" aria-label="Remover link" style="width:36px;height:36px">✕</button>
      <input class="link-url" placeholder="Cole o link — descrição e preço vêm sozinhos" inputmode="url" value="${esc(l && l.url || '')}">
      <div class="link-status"></div>
    </div>`;
}

/* ---------- Autopreenchimento a partir do link ----------
   Camada 1 (na hora, offline): loja pelo domínio + nome do produto
   extraído do "slug" do endereço.
   Camada 2 (melhor esforço, via proxy CORS): título real (og:title)
   e preço da página, que entra em "Melhor preço achado" se vazio. */

const STORE_NAMES = {
  'magazineluiza': 'Magalu', 'magalu': 'Magalu',
  'mercadolivre': 'Mercado Livre', 'ml.com': 'Mercado Livre',
  'amazon': 'Amazon', 'a.co': 'Amazon', 'amzn': 'Amazon',
  'casasbahia': 'Casas Bahia', 'pontofrio': 'Ponto', 'extra.com': 'Extra',
  'shopee': 'Shopee', 'shp.ee': 'Shopee',
  'americanas': 'Americanas', 'submarino': 'Submarino',
  'aliexpress': 'AliExpress', 'shein': 'Shein', 'temu': 'Temu',
  'madeiramadeira': 'MadeiraMadeira', 'mobly': 'Mobly', 'tokstok': 'Tok&Stok',
  'leroymerlin': 'Leroy Merlin', 'havan': 'Havan', 'carrefour': 'Carrefour',
  'kabum': 'KaBuM!', 'fastshop': 'Fast Shop', 'polishop': 'Polishop',
  'olx': 'OLX', 'enjoei': 'Enjoei', 'facebook': 'Marketplace',
};

function storeFromUrl(u) {
  try {
    const host = new URL(u).hostname.replace(/^(www|m|br|produto|item)\./, '');
    const labels = host.split('.');
    for (const key of Object.keys(STORE_NAMES)) {
      if (key.includes('.')) {
        // domínio completo (ex.: a.co, shp.ee): precisa bater no fim do host
        if (host === key || host.endsWith('.' + key)) return STORE_NAMES[key];
      } else if (labels.some(l => l === key)) {
        return STORE_NAMES[key];
      }
    }
    const base = labels[0];
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : '';
  } catch (e) { return ''; }
}

function titleFromUrl(u) {
  try {
    const segs = new URL(u).pathname.split('/').filter(Boolean);
    let best = '';
    for (let s of segs) {
      s = decodeURIComponent(s).replace(/-i\.\d+\.\d+$/, '').replace(/\.html?$/i, '');
      if (/^[a-z0-9-]{10,}$/i.test(s) && s.includes('-') && s.length > best.length) best = s;
    }
    if (!best) return '';
    const words = best.split('-').filter(w => w && !/^\d{4,}$/.test(w) && !/^(p|dp|prod|produto|item|mlb\w*)$/i.test(w));
    if (words.length < 2) return '';
    let t = words.join(' ');
    t = t.charAt(0).toUpperCase() + t.slice(1);
    return t.length > 70 ? t.slice(0, 70).trim() + '…' : t;
  } catch (e) { return ''; }
}

function decodeHtmlEntities(s) {
  const ta = document.createElement('textarea');
  ta.innerHTML = s;
  return ta.value;
}

async function fetchLinkMeta(url) {
  const res = await syncFetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = (await res.text()).slice(0, 400000);
  let title =
    (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || [])[1] ||
    (html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) || [])[1] ||
    (html.match(/<title[^>]*>([^<]{4,200})<\/title>/i) || [])[1] || '';
  title = decodeHtmlEntities(title)
    .replace(/\s*[|•]\s*[^|•]{2,40}$/, '')
    .replace(/\s+/g, ' ').trim().slice(0, 110);
  let price = null;
  const mPrice =
    html.match(/property=["']product:price:amount["'][^>]+content=["']([\d.,]+)/i) ||
    html.match(/itemprop=["']price["'][^>]+content=["']([\d.,]+)/i) ||
    html.match(/"price"\s*:\s*"?([\d]+[.,][\d.,]*|\d+)"?/);
  if (mPrice) {
    price = parseMoney(mPrice[1]);
    if (price != null && (price < 1 || price > 1000000)) price = null;
  }
  return { title, price };
}

let linkFillTimer = null;

async function autofillLinkRow(row) {
  const urlIn = row.querySelector('.link-url');
  const labelIn = row.querySelector('.link-label');
  const status = row.querySelector('.link-status');
  let url = urlIn.value.trim();
  if (!/^https?:\/\//i.test(url)) {
    if (/^[\w.-]+\.[a-z]{2,}\//i.test(url)) url = 'https://' + url;
    else { status.textContent = ''; return; }
  }
  const store = storeFromUrl(url);
  const guess = titleFromUrl(url);
  const canAuto = () => !labelIn.value.trim() || labelIn.dataset.auto === '1';
  if (canAuto()) {
    const auto1 = [guess, store].filter(Boolean).join(' — ');
    if (auto1) { labelIn.value = auto1.slice(0, 120); labelIn.dataset.auto = '1'; }
  }
  status.textContent = '🔎 buscando descrição e preço no link…';
  try {
    const meta = await fetchLinkMeta(url);
    if (!row.isConnected) return;
    const parts = [];
    if (meta.title && canAuto()) {
      const full = store && !meta.title.toLowerCase().includes(store.toLowerCase())
        ? `${meta.title} — ${store}` : meta.title;
      labelIn.value = full.slice(0, 120);
      labelIn.dataset.auto = '1';
      parts.push('✓ descrição preenchida');
    }
    if (meta.price != null) {
      const f = $('#form-item');
      if (!f.bestPrice.value.trim()) {
        f.bestPrice.value = moneyInputValue(meta.price);
        parts.push(`💰 melhor preço: ${fmtMoney(meta.price)}`);
      } else {
        parts.push(`preço no link: ${fmtMoney(meta.price)}`);
      }
    }
    status.textContent = parts.length ? parts.join(' · ')
      : (labelIn.value ? `ℹ️ identifiquei: ${store || 'loja'}` : '');
  } catch (e) {
    if (!row.isConnected) return;
    status.textContent = labelIn.value ? 'ℹ️ preenchi pelo endereço (site não respondeu)' : 'ℹ️ não consegui ler o link — preencha a descrição';
  }
}

function openItemEditor(id, presetCat) {
  editItemId = id || null;
  const f = $('#form-item');
  const it = id ? state.items.find(x => x.id === id) : null;
  $('#dlg-item-title').textContent = it ? 'Editar item' : 'Novo item';
  $('#item-delete').style.display = it ? '' : 'none';
  fillSelect($('#item-cat'), catOptions(), it ? it.cat : (presetCat || prefs.f.cat || 'outros'));
  fillSelect($('#item-assignee'), peopleOptions(), it ? it.assigneeId : '');
  f.name.value = it ? it.name : '';
  f.prio.value = it ? it.prio : 'media';
  f.status.value = it ? it.status : 'pendente';
  f.cond.value = it ? it.cond : '';
  f.budget.value = it ? moneyInputValue(it.budget) : '';
  f.bestPrice.value = it ? moneyInputValue(it.bestPrice) : '';
  f.paidPrice.value = it ? moneyInputValue(it.paidPrice) : '';
  f.paidBy.value = it ? (it.paidBy || '') : '';
  f.donor.value = it ? it.donor : '';
  f.space.value = it ? it.space : '';
  f.specs.value = it ? it.specs : '';
  f.notes.value = it ? it.notes : '';
  $('#item-links').innerHTML = ((it && it.links && it.links.length) ? it.links : []).map(linkRowHtml).join('');
  openDlg('#dlg-item');
}

function submitItem() {
  const f = $('#form-item');
  const name = f.name.value.trim();
  if (!name) { f.name.focus(); return false; }
  const links = $$('#item-links .link-row').map(r => ({
    label: r.querySelector('.link-label').value.trim(),
    url: r.querySelector('.link-url').value.trim(),
  })).filter(l => l.url);

  let it = editItemId ? state.items.find(x => x.id === editItemId) : null;
  const isNew = !it;
  if (!it) {
    it = { id: uid(), createdAt: now(), links: [] };
    state.items.push(it);
  }
  const wasResolved = !isNew && isResolved(it);
  Object.assign(it, {
    name,
    cat: f.cat.value,
    prio: f.prio.value,
    status: f.status.value,
    cond: f.cond.value,
    budget: parseMoney(f.budget.value),
    bestPrice: parseMoney(f.bestPrice.value),
    paidPrice: parseMoney(f.paidPrice.value),
    paidBy: f.paidBy.value.trim(),
    donor: f.donor.value.trim(),
    assigneeId: f.assigneeId.value,
    space: f.space.value.trim(),
    specs: f.specs.value.trim(),
    notes: f.notes.value.trim(),
    links,
  });
  touch(it);
  if (isNew) addLog('🛒', `adicionou o item "${it.name}"`);
  else if (!wasResolved && isResolved(it)) addLog(it.status === 'doado' ? '🎁' : '✅', `marcou "${it.name}" como ${it.status === 'doado' ? 'ganho' : 'comprado'}`);
  save(); render();
  toast(isNew ? 'Item adicionado 🛒' : 'Item salvo');
  return true;
}

/* ---------- Tarefa ---------- */

let editTaskId = null;

function openTaskEditor(id) {
  editTaskId = id || null;
  const f = $('#form-task');
  const t = id ? state.tasks.find(x => x.id === id) : null;
  $('#dlg-task-title').textContent = t ? 'Editar tarefa' : 'Nova tarefa';
  $('#task-delete').style.display = t ? '' : 'none';
  fillSelect($('#task-phase'), TASK_PHASES.map(p => ({ value: p.id, label: `${p.emoji} ${p.name}` })), t ? t.phase : 'antes');
  fillSelect($('#task-assignee'), peopleOptions(), t ? t.assigneeId : '');
  f.title.value = t ? t.title : '';
  f.due.value = t ? t.due : '';
  f.notes.value = t ? t.notes : '';
  openDlg('#dlg-task');
}

function submitTask() {
  const f = $('#form-task');
  const title = f.title.value.trim();
  if (!title) { f.title.focus(); return false; }
  let t = editTaskId ? state.tasks.find(x => x.id === editTaskId) : null;
  const isNew = !t;
  if (!t) {
    t = { id: uid(), createdAt: now(), done: false };
    state.tasks.push(t);
  }
  Object.assign(t, {
    title,
    phase: f.phase.value,
    due: f.due.value,
    assigneeId: f.assigneeId.value,
    notes: f.notes.value.trim(),
  });
  touch(t);
  if (isNew) addLog('📝', `criou a tarefa "${t.title}"`);
  save(); render();
  toast(isNew ? 'Tarefa criada 📝' : 'Tarefa salva');
  return true;
}

/* ---------- Caixa ---------- */

let editBoxId = null;

function openBoxEditor(id) {
  editBoxId = id || null;
  const f = $('#form-box');
  const b = id ? state.boxes.find(x => x.id === id) : null;
  $('#dlg-box-title').textContent = b ? `Caixa #${b.num}` : 'Nova caixa';
  $('#box-delete').style.display = b ? '' : 'none';
  const nextNum = alive(state.boxes).reduce((m, x) => Math.max(m, x.num || 0), 0) + 1;
  fillSelect($('#box-room'), catOptions(), b ? b.room : 'outros');
  f.num.value = b ? b.num : nextNum;
  f.contents.value = b ? b.contents : '';
  f.fragile.checked = !!(b && b.fragile);
  f.priority.checked = !!(b && b.priority);
  f.status.value = b ? b.status : 'aberta';
  openDlg('#dlg-box');
}

function submitBox() {
  const f = $('#form-box');
  const num = parseInt(f.num.value, 10);
  if (!num || num < 1) { f.num.focus(); return false; }
  let b = editBoxId ? state.boxes.find(x => x.id === editBoxId) : null;
  const isNew = !b;
  if (!b) {
    b = { id: uid(), createdAt: now() };
    state.boxes.push(b);
  }
  Object.assign(b, {
    num,
    room: f.room.value,
    contents: f.contents.value.trim(),
    fragile: f.fragile.checked,
    priority: f.priority.checked,
    status: f.status.value,
  });
  touch(b);
  if (isNew) addLog('📦', `criou a caixa #${b.num}`);
  save(); render();
  toast(isNew ? `Caixa #${b.num} criada 📦` : 'Caixa salva');
  return true;
}

/* ---------- Pessoa ---------- */

let editPersonId = null;
let pickedColor = PERSON_COLORS[0];

function renderColorPicker(sel) {
  $('#person-colors').innerHTML = PERSON_COLORS.map(c =>
    `<button type="button" class="color-dot ${c === sel ? 'on' : ''}" style="background:${c}" data-act="pick-color" data-color="${c}" aria-label="Cor"></button>`).join('');
}

function openPersonEditor(id) {
  editPersonId = id || null;
  const f = $('#form-person');
  const p = id ? state.people.find(x => x.id === id) : null;
  $('#dlg-person-title').textContent = p ? 'Editar pessoa' : 'Nova pessoa';
  $('#person-delete').style.display = p ? '' : 'none';
  f.name.value = p ? p.name : '';
  pickedColor = p ? (p.color || PERSON_COLORS[0]) : PERSON_COLORS[alive(state.people).length % PERSON_COLORS.length];
  renderColorPicker(pickedColor);
  openDlg('#dlg-person');
}

function submitPerson() {
  const f = $('#form-person');
  const name = f.name.value.trim();
  if (!name) { f.name.focus(); return false; }
  let p = editPersonId ? state.people.find(x => x.id === editPersonId) : null;
  const isNew = !p;
  if (!p) {
    p = { id: uid(), createdAt: now() };
    state.people.push(p);
  }
  Object.assign(p, { name, color: pickedColor });
  touch(p);
  if (isNew) addLog('👋', `adicionou ${name} à equipe`);
  save(); render();
  toast(isNew ? `${name} entrou na equipe 👋` : 'Salvo');
  return true;
}

/* ---------- Perfil ---------- */

function openProfileDlg() {
  const people = alive(state.people);
  $('#profile-people').innerHTML = people.map(p => `
    <button type="button" class="profile-person ${profile.personId === p.id ? 'on' : ''}" data-act="pick-profile" data-id="${p.id}">
      ${avatarHtml(p, 30)} <span>${esc(p.name)}</span>
    </button>`).join('');
  $('#form-profile').newName.value = '';
  openDlg('#dlg-profile');
}

function setProfilePerson(p) {
  profile.personId = p.id;
  profile.name = p.name;
  saveProfile();
  render();
  toast(`Oi, ${p.name.split(' ')[0]}! 👋`);
}

function submitProfile() {
  const name = $('#form-profile').newName.value.trim();
  if (!name) return true; // fechado sem nome novo — mantém escolha por clique
  const existing = alive(state.people).find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing) { setProfilePerson(existing); return true; }
  const p = { id: uid(), name, color: PERSON_COLORS[alive(state.people).length % PERSON_COLORS.length], createdAt: now() };
  state.people.push(p);
  profile.personId = p.id; profile.name = p.name;
  saveProfile();
  touch(p);
  addLog('👋', 'entrou na equipe');
  save(); render();
  toast(`Bem-vindo(a), ${name.split(' ')[0]}! 👋`);
  return true;
}

/* ---------- Kit enxoval ---------- */

function kitKey(name) { return name.trim().toLowerCase(); }

function renderKit() {
  const body = $('#kit-body');
  const keep = body.parentElement.scrollTop;
  const have = new Set(alive(state.items).map(i => kitKey(i.name)));
  const groups = new Map();
  KIT_ENXOVAL.forEach((k, ix) => {
    if (!groups.has(k.cat)) groups.set(k.cat, []);
    groups.get(k.cat).push([k, ix]);
  });
  let added = 0;
  body.innerHTML = Array.from(groups.entries()).map(([catId, entries]) => {
    const cat = catById(catId);
    const chips = entries.map(([k, ix]) => {
      const on = have.has(kitKey(k.name));
      if (on) added++;
      return `<button type="button" class="kit-item ${on ? 'added' : ''}" data-act="kit-add" data-idx="${ix}" ${on ? 'disabled' : ''}>${on ? '✓' : '+'} ${esc(k.name)}</button>`;
    }).join('');
    return `<div class="kit-cat-title">${cat.emoji} ${esc(cat.name)}</div><div class="kit-grid">${chips}</div>`;
  }).join('');
  $('#kit-count').textContent = added ? `${added} de ${KIT_ENXOVAL.length} já na sua lista.` : '';
  body.parentElement.scrollTop = keep;
}

/* ---------- Confirmação ---------- */

function confirmAsk(title, msg, okLabel) {
  return new Promise(resolve => {
    $('#confirm-title').textContent = title;
    $('#confirm-msg').textContent = msg;
    const ok = $('#confirm-ok');
    ok.textContent = okLabel || 'Confirmar';
    const dlg = $('#dlg-confirm');
    const onOk = () => { cleanup(); dlg.close(); resolve(true); };
    const onClose = () => { cleanup(); resolve(false); };
    function cleanup() {
      ok.removeEventListener('click', onOk);
      dlg.removeEventListener('close', onClose);
    }
    ok.addEventListener('click', onOk);
    dlg.addEventListener('close', onClose);
    dlg.showModal();
  });
}

/* ================= Planilha do Google ================= */
/* Importa (mão única) uma planilha pública do Google Sheets com as
   mesmas colunas da planilha original da mudança. Nunca apaga nada:
   células vazias não sobrescrevem, e "Comprado" só marca, não desmarca. */

const normTxt = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function parseGviz(text) {
  const m = text.match(/setResponse\(([\s\S]*)\)\s*;?\s*$/);
  if (!m) throw new Error('resposta inesperada');
  const data = JSON.parse(m[1]);
  const cols = (data.table.cols || []).map(c => c.label || '');
  const rows = (data.table.rows || []).map(r => (r.c || []).map(c => c == null ? '' : (c.f != null ? c.f : (c.v == null ? '' : c.v))));
  return { cols, rows };
}

function sheetHeaderKey(h) {
  const n = normTxt(h);
  if (n.startsWith('categoria')) return 'categoria';
  if (n.startsWith('item')) return 'item';
  if (n.startsWith('prioridade')) return 'prioridade';
  if (n.startsWith('especifica')) return 'specs';
  if (n.startsWith('medida')) return 'space';
  if (n.startsWith('condicao')) return 'cond';
  if (n.startsWith('orcamento')) return 'budget';
  if (n.startsWith('melhor')) return 'best';
  if (n.startsWith('pessoa') || n.startsWith('doador')) return 'donor';
  if (n.startsWith('link')) return 'links';
  if (n.startsWith('comprado')) return 'comprado';
  if (n.startsWith('observa')) return 'notes';
  return null;
}

function sheetRowsToObjects(headers, rows) {
  const keys = headers.map(sheetHeaderKey);
  return rows.map(r => {
    const o = {};
    keys.forEach((k, ix) => { if (k && o[k] == null) o[k] = r[ix]; });
    return o;
  }).filter(o => String(o.item || '').trim());
}

async function fetchSheetRows(url) {
  url = String(url || '').trim();
  if (!url) throw new Error('Cole o link da planilha primeiro.');
  if (/output=csv|\.csv(\?|#|$)/i.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = parseCSV(await res.text());
    while (rows.length && rows[0].every(c => !String(c).trim())) rows.shift();
    const headers = rows.shift() || [];
    return sheetRowsToObjects(headers, rows);
  }
  const m = url.match(/\/d\/([-\w]{20,})/);
  if (!m) throw new Error('Não reconheci esse link do Google.');
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:json&headers=1`);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  if (/<html|<!doctype/i.test(text)) throw new Error('sem-acesso');
  const { cols, rows } = parseGviz(text);
  let headers = cols;
  if (headers.filter(Boolean).length < 3 && rows.length) headers = rows.shift().map(String);
  return sheetRowsToObjects(headers, rows);
}

function parseBudgetCell(v, mode) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) && v >= 0 ? v : null;
  const direct = parseMoney(String(v));
  if (direct != null) return direct;
  const parts = String(v).split(/\s*(?:-|–|—|\bate\b|\baté\b|\ba\b)\s*/i).map(parseMoney).filter(x => x != null);
  if (!parts.length) return null;
  return mode === 'min' ? Math.min.apply(null, parts) : Math.max.apply(null, parts);
}

function parseLinksCell(v) {
  const out = [];
  for (const line of String(v || '').split(/\n+/)) {
    const urls = line.match(/https?:\/\/\S+/g);
    if (!urls) continue;
    const label = line.slice(0, line.indexOf(urls[0])).replace(/[\s:,;–-]+$/, '').trim();
    urls.forEach((u, ix) => out.push({ label: ix === 0 ? label : '', url: u.replace(/[),.;]+$/, '') }));
  }
  return out;
}

const SHEET_PRIO = { alta: 'alta', media: 'media', baixa: 'baixa' };
const SHEET_COND = { novo: 'novo', usado: 'usado', doacao: 'doacao' };

function applySheetImport(rows) {
  const stats = { created: 0, updated: 0 };
  const catByName = new Map(alive(state.cats).map(c => [normTxt(c.name), c.id]));
  const itemsByName = new Map();
  for (const i of alive(state.items)) if (!itemsByName.has(normTxt(i.name))) itemsByName.set(normTxt(i.name), i);

  for (const r of rows) {
    const name = String(r.item || '').trim();
    if (!name) continue;
    let it = itemsByName.get(normTxt(name));
    const isNew = !it;
    if (isNew) {
      it = {
        id: uid(), cat: 'outros', name, prio: 'media',
        status: 'pendente', cond: '', specs: '', space: '',
        budget: null, bestPrice: null, paidPrice: null, paidBy: '',
        donor: '', assigneeId: '', links: [], notes: '', createdAt: now(),
      };
      state.items.push(it);
      itemsByName.set(normTxt(name), it);
    }
    let changed = false;
    const setIf = (field, val) => {
      if (val == null || val === '') return;
      if (JSON.stringify(it[field]) !== JSON.stringify(val)) { it[field] = val; changed = true; }
    };
    setIf('cat', catByName.get(normTxt(r.categoria)) || null);
    setIf('prio', SHEET_PRIO[normTxt(r.prioridade)] || null);
    setIf('cond', SHEET_COND[normTxt(r.cond)] || null);
    setIf('specs', r.specs != null ? String(r.specs).trim() : null);
    setIf('space', r.space != null ? String(r.space).trim() : null);
    setIf('donor', r.donor != null ? String(r.donor).trim() : null);
    setIf('notes', r.notes != null ? String(r.notes).trim() : null);
    setIf('budget', parseBudgetCell(r.budget, 'max'));
    setIf('bestPrice', parseBudgetCell(r.best, 'min'));
    const links = parseLinksCell(r.links);
    if (links.length) setIf('links', links);
    if (/✓|✔|x|sim|ok/i.test(String(r.comprado || '').trim()) && !isResolved(it)) {
      it.status = isGift(it) ? 'doado' : 'comprado';
      changed = true;
    }
    if (changed) {
      it.updatedAt = now();
      it.updatedBy = 'Planilha 📄';
      if (!isNew) stats.updated++;
    }
    if (isNew) stats.created++;
  }
  if (stats.created || stats.updated) {
    addLog('📄', `puxou da planilha do Google: ${stats.created} novo(s), ${stats.updated} atualizado(s)`);
    save();
  }
  return stats;
}

async function sheetSync(silent) {
  const url = state.meta.sheetUrl;
  if (!url) { if (!silent) toast('Cole o link da planilha em Ajustes primeiro'); return; }
  if (!silent) toast('Buscando a planilha… 📄');
  try {
    const rows = await fetchSheetRows(url);
    if (!rows.length) throw new Error('Nenhuma linha com "Item" encontrada.');
    const st = applySheetImport(rows);
    prefs.sheetLastSync = now();
    savePrefs();
    render();
    if (st.created || st.updated) toast(`Planilha importada: ${st.created} novo(s), ${st.updated} atualizado(s) ✅`);
    else if (!silent) toast('Tudo já estava em dia com a planilha 👍');
  } catch (e) {
    console.warn('sheet sync', e);
    if (silent) return;
    if (e.message === 'sem-acesso') {
      toast('Sem acesso à planilha 🔒 Confira os requisitos em Ajustes');
    } else {
      toast('Não consegui ler a planilha 😕 Veja os requisitos em Ajustes');
    }
  }
}

/* ================= Sincronização automática ================= */
/* Um "canal" JSON gratuito (jsonblob.com) serve de caixa de correio:
   cada aparelho puxa, mescla (regras por item, mais recente vence) e
   empurra de volta. Sem conta, sem servidor próprio. O id do canal
   viaja dentro dos dados, então quem mescla o link entra no canal. */

const SYNC_API = 'https://jsonblob.com/api/jsonBlob';
let syncBusy = false;
let syncPushTimer = null;

function syncEnabled() { return !!(state && state.meta.syncId && prefs.syncOn !== false); }

async function syncFetch(url, opts) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    return await fetch(url, Object.assign({ signal: ctl.signal }, opts));
  } finally { clearTimeout(t); }
}

function scheduleSyncPush() {
  if (!syncEnabled()) return;
  clearTimeout(syncPushTimer);
  syncPushTimer = setTimeout(() => syncNow(false), 4000);
}

async function syncActivate() {
  toast('Criando o canal de sincronização…');
  try {
    const res = await syncFetch(SYNC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const loc = res.headers.get('Location') || res.headers.get('location') || '';
    const id = loc.split('/').pop();
    if (!id) throw new Error('sem id no retorno');
    state.meta.syncId = id;
    state.meta.updatedAt = now();
    prefs.syncOn = true;
    prefs.syncIntroShown = true;
    savePrefs(); save();
    await syncNow(false);
    renderSyncBlock();
    toast('Sincronização ativada! Reenvie o link com os dados para conectar os outros aparelhos 🔄');
  } catch (e) {
    console.warn('sync activate', e);
    toast('Não consegui ativar agora 😕 Confira a internet e tente de novo');
  }
}

async function syncNow(manual) {
  if (!state.meta.syncId || (!manual && prefs.syncOn === false)) return;
  if (syncBusy || !navigator.onLine) { if (manual) toast('Sem internet agora 📶'); return; }
  syncBusy = true;
  try {
    const url = SYNC_API + '/' + state.meta.syncId;
    const res = await syncFetch(url);
    let remote = null;
    if (res.ok) {
      try { remote = normalizeState(await res.json()); } catch (e) { remote = null; }
    } else if (res.status !== 404) {
      throw new Error('HTTP ' + res.status);
    }
    const before = JSON.stringify(state);
    if (remote) {
      const merged = mergeStates(state, remote);
      merged.meta.syncId = state.meta.syncId;
      if (JSON.stringify(merged) !== before) {
        state = merged;
        localStorage.setItem(DB_KEY, JSON.stringify(state));
        // não re-renderiza no meio de uma edição
        const editing = document.querySelector('dialog[open]') ||
          (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
        if (!editing) render();
        toast('Chegaram novidades do time 🔄');
      }
    }
    const payload = JSON.stringify(state);
    if (!remote || payload !== JSON.stringify(remote)) {
      const put = await syncFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      if (!put.ok && (put.status === 404 || put.status === 410)) {
        // canal expirou: recria e avisa para reenviar o link
        const re = await syncFetch(SYNC_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
        const id = ((re.headers.get('Location') || '').split('/').pop());
        if (re.ok && id) {
          state.meta.syncId = id;
          state.meta.updatedAt = now();
          localStorage.setItem(DB_KEY, JSON.stringify(state));
          toast('O canal tinha expirado — recriei. Reenvie o link para o time 🔁');
        }
      }
    }
    prefs.lastSync = now();
    savePrefs();
    renderSyncBlock();
    if (manual && JSON.stringify(state) === before) toast('Tudo em dia ✅');
  } catch (e) {
    console.warn('sync', e);
    if (manual) toast('Não consegui sincronizar agora 😕');
  } finally {
    syncBusy = false;
  }
}

function renderSyncBlock() {
  const el = $('#sync-block');
  if (!el) return;
  if (!state.meta.syncId) {
    el.innerHTML = `
      <h3>🔄 Sincronização automática</h3>
      <p class="muted">Ative para as mudanças de todo mundo se juntarem <b>sozinhas</b> pela internet — sem mandar link toda hora. Depois de ativar, envie o link com os dados <b>uma última vez</b> para conectar os outros celulares.</p>
      <button class="btn btn-primary" data-act="sync-activate">Ativar sincronização</button>
      <p class="muted small">Usa o serviço gratuito jsonblob.com. Os dados continuam salvos em cada aparelho; exporte um backup de vez em quando.</p>`;
  } else {
    const on = prefs.syncOn !== false;
    el.innerHTML = `
      <h3>🔄 Sincronização automática <span class="chip ${on ? 'green' : 'amber'}">${on ? 'ativa' : 'pausada aqui'}</span></h3>
      <p class="muted small">${prefs.lastSync ? `Última sincronização: há ${relTime(prefs.lastSync)}.` : 'Ainda não sincronizou neste aparelho.'} As novidades chegam ao abrir o app, ao voltar para ele e a cada minuto e meio.</p>
      <div class="btn-row">
        <button class="btn btn-primary" data-act="sync-now">Sincronizar agora</button>
        <button class="btn" data-act="sync-toggle">${on ? 'Pausar neste aparelho' : 'Reativar'}</button>
      </div>`;
  }
}

/* ================= Tour guiado ================= */

const TOUR_STEPS = [
  { tab: 'resumo', sel: '.hero', title: 'Boas-vindas ao Mudei! 🏠', text: 'Este app organiza sua mudança inteira: compras, doações, tarefas, malas e a galera que ajuda. Vou te mostrar o essencial em 1 minuto.' },
  { tab: 'resumo', sel: '.now-card', title: '🧭 Agora', text: 'O app olha sua situação e diz o que importa hoje: tarefas vencidas, passos da etapa atual e alertas de orçamento. Toque numa linha para ir direto ao ponto.' },
  { tab: 'resumo', sel: '.stage-card', title: '🗺️ Jornada da mudança', text: 'Sua mudança em 6 etapas calibradas pela data. Os passos se completam sozinhos conforme você usa o app — e a etapa da vez ganha o selo "é agora".' },
  { tab: 'compras', sel: '#list-region .item-card', title: '🛒 Compras', text: 'Toque no círculo para marcar como comprado (ou ganho 🎁). Toque no card para editar: preços, links de lojas, quem pagou (ex.: seus pais) e doações prometidas 🤝.', pre: () => { prefs.f = defaultFilters(); } },
  { tab: 'compras', sel: '[data-act=open-kit]', title: '💡 Kit enxoval', text: 'Sugestões de ~50 itens que todo mundo esquece (lixeira, rodo, extensão…). Um toque e o item entra na sua lista.' },
  { tab: 'compras', sel: '.selects-row', title: 'Filtros e lista pronta', text: 'Filtre por situação (inclusive 🤝 Doações), prioridade e cômodo. O botão 📋 copia a lista de pendências formatada para o WhatsApp.' },
  { tab: 'tarefas', sel: '.phase-card', title: '✅ Tarefas', text: 'O lado burocrático em 4 fases: planejamento, semana da mudança, dia D e primeiros dias. Dá para pôr prazo e responsável em cada tarefa.' },
  { tab: 'caixas', sel: '.fab', title: '📦 Caixas & malas', text: 'Registre malas, sacolas e caixas com número e conteúdo. Depois é só buscar "panela" para descobrir em qual volume ela está.' },
  { tab: 'equipe', sel: '.fab', title: '👥 Equipe', text: 'Cadastre quem está ajudando e atribua compras e tarefas. Cada alteração fica assinada com o nome de quem fez.' },
  { tab: null, sel: '[data-act=open-share]', title: '🔗 Compartilhar & sincronizar', text: 'Ative a sincronização automática e mande o link com os dados uma única vez para cada pessoa. Depois disso, o que cada um marcar aparece nos outros celulares sozinho, pela internet.' },
  { tab: 'resumo', sel: null, title: 'Pronto! 🎉', text: 'É isso! Comece pelo 🚀 Ponto de partida na Jornada. Para rever este tour, toque no "?" lá em cima ou vá em Ajustes.' },
];

let tourIx = -1;

function tourActive() { return tourIx >= 0; }

function tourStart() {
  $$('dialog[open]').forEach(d => d.close());
  tourIx = 0;
  $('#tour').hidden = false;
  tourShow();
}

function tourEnd(finished) {
  tourIx = -1;
  $('#tour').hidden = true;
  document.body.classList.remove('tour-lock');
  prefs.tourDone = true;
  prefs.tab = 'resumo';
  savePrefs();
  render();
  if (finished) toast('Tour concluído! Bora começar 🚀');
}

function tourShow(dir) {
  const step = TOUR_STEPS[tourIx];
  if (!step) return tourEnd(false);
  document.body.classList.remove('tour-lock');
  if (step.pre) step.pre();
  if (step.tab && prefs.tab !== step.tab) prefs.tab = step.tab;
  savePrefs();
  render();
  let target = step.sel ? document.querySelector(step.sel) : null;
  if (step.sel && !target) { // alvo não existe (ex.: lista vazia) — pula
    tourIx += dir === 'prev' ? -1 : 1;
    if (tourIx < 0 || tourIx >= TOUR_STEPS.length) return tourEnd(false);
    return tourShow(dir);
  }
  if (target) target.scrollIntoView({ block: 'center' });
  document.body.classList.add('tour-lock');
  requestAnimationFrame(() => tourPosition(target, step));
}

function tourPosition(target, step) {
  const hole = $('#tour-hole');
  const tip = $('#tour-tip');
  const pad = 6;
  if (target) {
    const r = target.getBoundingClientRect();
    hole.style.left = (r.left - pad) + 'px';
    hole.style.top = (r.top - pad) + 'px';
    hole.style.width = (r.width + 2 * pad) + 'px';
    hole.style.height = (r.height + 2 * pad) + 'px';
  } else {
    hole.style.left = '50%'; hole.style.top = '45%';
    hole.style.width = '0px'; hole.style.height = '0px';
  }
  $('#tour-title').textContent = step.title;
  $('#tour-text').textContent = step.text;
  $('#tour-dots').innerHTML = TOUR_STEPS.map((_, i) => `<span class="tour-dot ${i === tourIx ? 'on' : ''}"></span>`).join('');
  $('#tour-prev').style.visibility = tourIx > 0 ? 'visible' : 'hidden';
  $('#tour-next').textContent = tourIx === TOUR_STEPS.length - 1 ? 'Concluir 🎉' : 'Próximo →';

  tip.style.visibility = 'hidden';
  requestAnimationFrame(() => {
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const vw = innerWidth, vh = innerHeight;
    let x, y;
    if (target) {
      const r = target.getBoundingClientRect();
      x = Math.min(Math.max(12, r.left + r.width / 2 - tw / 2), vw - tw - 12);
      if (r.bottom + 14 + th < vh - 12) y = r.bottom + 14;
      else if (r.top - th - 14 > 12) y = r.top - th - 14;
      else y = Math.max(12, Math.min(vh - th - 12, vh / 2 - th / 2));
    } else {
      x = (vw - tw) / 2;
      y = (vh - th) / 2;
    }
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
    tip.style.visibility = 'visible';
  });
}

document.addEventListener('keydown', e => {
  if (!tourActive()) return;
  if (e.key === 'Escape') { e.preventDefault(); tourEnd(false); }
  if (e.key === 'ArrowRight') { e.preventDefault(); ACTIONS['tour-next'](); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); ACTIONS['tour-prev'](); }
});

window.addEventListener('resize', () => { if (tourActive()) tourShow(); });

/* ================= Compartilhamento ================= */

function b64urlEncode(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function encodeShare(obj) {
  const json = JSON.stringify(obj);
  const raw = new TextEncoder().encode(json);
  if (typeof CompressionStream !== 'undefined') {
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    return '1.' + b64urlEncode(buf);
  }
  return '0.' + b64urlEncode(raw);
}

async function decodeShare(str) {
  const dot = str.indexOf('.');
  const kind = str.slice(0, dot);
  const bytes = b64urlDecode(str.slice(dot + 1));
  if (kind === '1') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(new TextDecoder().decode(await new Response(stream).arrayBuffer()));
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) {}
    ta.remove();
    return ok;
  }
}

async function shareLink() {
  const data = await encodeShare(state);
  const url = location.origin + location.pathname + '#d=' + data;
  const title = state.meta.title || 'Minha Mudança';
  if (navigator.share) {
    try {
      await navigator.share({ title: `${title} — Mudei`, text: 'Abra para ver e atualizar a nossa mudança:', url });
      return;
    } catch (e) { if (e.name === 'AbortError') return; }
  }
  if (await copyText(url)) toast('Link copiado! Cole no WhatsApp 📲');
  else toast('Não consegui copiar 😕');
}

function pendingListText() {
  const items = alive(state.items).filter(i => !isResolved(i));
  const cats = alive(state.cats);
  let out = `🛒 *${state.meta.title || 'Mudança'} — lista de pendências*\n`;
  const prioMark = { alta: '🔴', media: '🟡', baixa: '⚪' };
  for (const c of cats) {
    const its = items.filter(i => i.cat === c.id);
    if (!its.length) continue;
    out += `\n${c.emoji} *${c.name}*\n`;
    for (const i of its) {
      const est = itemEstimate(i);
      out += `  ${prioMark[i.prio] || '•'} ${i.name}`;
      if (i.status === 'prometido') out += ` — 🤝 prometido${i.donor ? ` por ${i.donor}` : ''}`;
      else if (isGift(i)) out += ` (pedir doação${i.donor ? `: ${i.donor}` : ''})`;
      else if (est != null) out += ` — até ${fmtMoney(est)}`;
      out += '\n';
    }
  }
  const est = sum(items, i => isGift(i) ? null : itemEstimate(i));
  if (est) out += `\n💰 Estimativa total: *${fmtMoney(est)}*\n`;
  out += '\n— enviado pelo app Mudei 🏠';
  return out;
}

async function shareText() {
  const text = pendingListText();
  if (navigator.share) {
    try { await navigator.share({ text }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  if (await copyText(text)) toast('Lista copiada! 📋');
  else toast('Não consegui copiar 😕');
}

function downloadFile(content, name, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function exportJSON() {
  const d = new Date().toISOString().slice(0, 10);
  downloadFile(JSON.stringify(state, null, 2), `mudei-backup-${d}.json`, 'application/json');
  toast('Backup exportado 💾');
}

/* Exporta a lista de compras em CSV com as mesmas colunas da planilha
   original (mais as colunas novas do app), para importar de volta no
   Google Sheets: Arquivo → Importar → Substituir. */
function exportSheetCSV() {
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const moneyCell = v => v == null ? '' : String(v).replace('.', ',');
  const header = [
    'Categoria', 'Item', 'Prioridade', 'Especificações', 'Medidas do espaço',
    'Condição', 'Orçamento previsto', 'Melhor preço encontrado',
    'Pessoa que vai doar', 'Links', 'Comprado (✓)', 'Observações',
    'Situação', 'Preço pago', 'Quem pagou', 'Responsável',
  ];
  const catOrder = Object.fromEntries(alive(state.cats).map((c, ix) => [c.id, ix]));
  const items = alive(state.items).slice()
    .sort((x, y) => ((catOrder[x.cat] ?? 99) - (catOrder[y.cat] ?? 99)) || x.name.localeCompare(y.name, 'pt-BR'));
  const rows = items.map(i => {
    const p = personById(i.assigneeId);
    return [
      catById(i.cat).name, i.name, PRIO_LABEL[i.prio] || '',
      i.specs, i.space, COND_LABEL[i.cond] || '',
      moneyCell(i.budget), moneyCell(i.bestPrice),
      i.donor,
      (i.links || []).map(l => (l.label ? l.label + ': ' : '') + l.url).join('\n'),
      isResolved(i) ? '✓' : '',
      i.notes,
      (STATUS_META[i.status] || STATUS_META.pendente).label.replace(' ✓', ''),
      moneyCell(i.paidPrice), i.paidBy, p ? p.name : '',
    ].map(cell).join(',');
  });
  const d = new Date().toISOString().slice(0, 10);
  // BOM para acentos abrirem certos no Excel/Sheets
  downloadFile('\ufeff' + header.map(cell).join(',') + '\n' + rows.join('\n'), `mudei-planilha-${d}.csv`, 'text/csv;charset=utf-8');
  toast('Planilha CSV exportada 📄 Importe no Google Sheets');
}

function showIncoming(data) {
  incomingState = normalizeState(data);
  const n = {
    items: alive(incomingState.items).length,
    tasks: alive(incomingState.tasks).length,
    boxes: alive(incomingState.boxes).length,
    people: alive(incomingState.people).length,
  };
  const pl = (n2, s, p) => `${n2} ${n2 === 1 ? s : p}`;
  $('#incoming-summary').innerHTML =
    `<b>${esc(incomingState.meta.title || 'Mudança')}</b>: ${pl(n.items, 'item de compra', 'itens de compra')}, ${pl(n.tasks, 'tarefa', 'tarefas')}, ${pl(n.boxes, 'caixa', 'caixas')} e ${pl(n.people, 'pessoa', 'pessoas')}.`;
  openDlg('#dlg-incoming');
}

function applyIncoming(mode) {
  if (!incomingState) return;
  state = mode === 'merge' ? mergeStates(state, incomingState) : incomingState;
  incomingState = null;
  addLog('🔄', mode === 'merge' ? 'mesclou dados recebidos' : 'importou dados (substituição)');
  save(); render();
  toast(mode === 'merge' ? 'Dados mesclados 🔄' : 'Dados substituídos');
  // o link trouxe um canal de sincronização? conecta este aparelho
  if (state.meta.syncId && !prefs.syncIntroShown) {
    prefs.syncOn = true;
    prefs.syncIntroShown = true;
    savePrefs();
    setTimeout(() => {
      toast('Sincronização automática ativada neste aparelho 🔄');
      syncNow(false);
    }, 1200);
  }
}

async function handleHash() {
  const m = location.hash.match(/^#d=(.+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const data = await decodeShare(m[1]);
    showIncoming(data);
  } catch (e) {
    console.warn(e);
    toast('Link com dados inválido 😕');
  }
}

/* ================= Ações ================= */

function softDelete(coll, id, what, emoji) {
  const e = state[coll].find(x => x.id === id);
  if (!e) return;
  e.deleted = true;
  touch(e);
  addLog(emoji || '🗑', `excluiu ${what}`);
  save(); render();
  toast('Excluído', {
    undo: () => { delete e.deleted; touch(e); save(); render(); },
  });
}

const ACTIONS = {
  'go-resumo':  () => { prefs.tab = 'resumo';  savePrefs(); render(); },
  'go-tarefas': () => { prefs.tab = 'tarefas'; savePrefs(); render(); },
  'go-caixas':  () => { prefs.tab = 'caixas';  savePrefs(); render(); },
  'go-ajustes': () => { prefs.tab = 'ajustes'; savePrefs(); render(); },
  'go-equipe':  () => { prefs.tab = 'equipe';  savePrefs(); render(); },
  'go-compras': () => { prefs.f = defaultFilters(); prefs.tab = 'compras'; savePrefs(); render(); },
  'go-compras-alta': () => {
    prefs.f = Object.assign(defaultFilters(), { prio: 'alta', status: 'pendentes' });
    prefs.tab = 'compras'; savePrefs(); render();
  },
  'go-compras-pend': () => {
    prefs.f = Object.assign(defaultFilters(), { status: 'pendentes' });
    prefs.tab = 'compras'; savePrefs(); render();
  },
  'go-compras-doacao': () => {
    prefs.f = Object.assign(defaultFilters(), { status: 'doacoes' });
    prefs.tab = 'compras'; savePrefs(); render();
  },

  /* --- guia --- */
  'open-setup': () => {
    const f = $('#form-setup');
    f.date.value = state.meta.movingDate || '';
    f.budget.value = moneyInputValue(state.meta.budgetTotal);
    openDlg('#dlg-setup');
  },
  'toggle-stage': el => {
    const firstIncomplete = GUIDE_STAGES.find(s => !stageDone(s));
    const current = prefs.openStage === '__none' ? null
      : (prefs.openStage || (firstIncomplete ? firstIncomplete.id : null));
    prefs.openStage = current === el.dataset.id ? '__none' : el.dataset.id;
    savePrefs(); render();
  },
  'toggle-step': el => {
    const { stage, step } = findGuideStep(el.dataset.id);
    if (!step) return;
    const wasStageDone = stageDone(stage);
    const info = stepInfo(step);
    if (step.task && info.task) {
      info.task.done = !info.task.done;
      touch(info.task);
      if (info.task.done) addLog('✅', `concluiu "${info.task.title}"`);
    } else if (info.done && info.autoDone && !(guideSteps()[step.id] && guideSteps()[step.id].done)) {
      toast('Esse passo se completa sozinho conforme você usa o app ✨');
      return;
    } else {
      const cur = guideSteps()[step.id];
      state.guide.steps[step.id] = { done: !(cur && cur.done), updatedAt: now() };
      if (state.guide.steps[step.id].done) addLog('🗺️', `concluiu o passo "${step.title}"`);
    }
    save();
    if (!wasStageDone && stageDone(stage)) toast(`Etapa ${stage.emoji} ${stage.name} concluída! 🎉`);
    render();
  },

  'close-dlg': el => closeDlg(el),
  'open-share': () => { renderSyncBlock(); openDlg('#dlg-share'); },
  'sync-activate': () => syncActivate(),
  'sync-now': () => syncNow(true),
  'sync-toggle': () => {
    prefs.syncOn = prefs.syncOn === false;
    savePrefs();
    renderSyncBlock();
    if (prefs.syncOn) syncNow(false);
  },
  'open-profile': () => openProfileDlg(),

  /* --- tour --- */
  'tour-start': () => tourStart(),
  'tour-next': () => { if (tourIx >= TOUR_STEPS.length - 1) tourEnd(true); else { tourIx++; tourShow('next'); } },
  'tour-prev': () => { if (tourIx > 0) { tourIx--; tourShow('prev'); } },
  'tour-exit': () => tourEnd(false),
  'tour-hide': () => { prefs.tourHidden = true; savePrefs(); render(); },

  /* --- compras --- */
  'new-item': () => openItemEditor(null),
  'open-item': el => openItemEditor(el.dataset.id),
  'toggle-item': el => {
    const it = state.items.find(x => x.id === el.dataset.id);
    if (!it) return;
    if (isResolved(it)) {
      it.status = 'pendente';
      addLog('↩️', `reabriu "${it.name}"`);
    } else {
      it.status = isGift(it) ? 'doado' : 'comprado';
      if (it.status === 'comprado' && it.paidPrice == null && it.bestPrice != null) it.paidPrice = it.bestPrice;
      addLog(it.status === 'doado' ? '🎁' : '✅', `marcou "${it.name}" como ${it.status === 'doado' ? 'ganho' : 'comprado'}`);
    }
    touch(it); save(); render();
  },
  'delete-item': el => {
    const it = state.items.find(x => x.id === editItemId);
    closeDlg(el);
    if (it) softDelete('items', it.id, `o item "${it.name}"`);
  },
  'filter-cat': el => { prefs.f.cat = el.dataset.id; savePrefs(); render(); },
  'toggle-cat': el => {
    prefs.closedCats = prefs.closedCats || [];
    const id = el.dataset.id;
    const ix = prefs.closedCats.indexOf(id);
    if (ix >= 0) prefs.closedCats.splice(ix, 1); else prefs.closedCats.push(id);
    savePrefs(); render();
  },
  'add-link': () => { $('#item-links').insertAdjacentHTML('beforeend', linkRowHtml(null)); },
  'rm-link': el => el.closest('.link-row').remove(),
  'open-link-row': el => {
    let url = el.closest('.link-row').querySelector('.link-url').value.trim();
    if (!url) { toast('Cole o link da loja primeiro 🙂'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    window.open(url, '_blank', 'noopener');
  },
  'open-kit': () => { renderKit(); openDlg('#dlg-kit'); },
  'kit-add': el => {
    const k = KIT_ENXOVAL[Number(el.dataset.idx)];
    if (!k) return;
    if (alive(state.items).some(i => kitKey(i.name) === kitKey(k.name))) return;
    const it = {
      id: uid(), cat: k.cat, name: k.name, prio: k.prio,
      status: 'pendente', cond: '', specs: '', space: '',
      budget: null, bestPrice: null, paidPrice: null, paidBy: '',
      donor: '', assigneeId: '', links: [], notes: '',
      createdAt: now(),
    };
    touch(it);
    state.items.push(it);
    addLog('🛍️', `adicionou "${k.name}" do kit enxoval`);
    save();
    renderKit();
    render();
  },

  /* --- tarefas --- */
  'new-task': () => openTaskEditor(null),
  'open-task': el => openTaskEditor(el.dataset.id),
  'toggle-task': el => {
    const t = state.tasks.find(x => x.id === el.dataset.id);
    if (!t) return;
    t.done = !t.done;
    touch(t);
    if (t.done) addLog('✅', `concluiu "${t.title}"`);
    save(); render();
  },
  'delete-task': el => {
    const t = state.tasks.find(x => x.id === editTaskId);
    closeDlg(el);
    if (t) softDelete('tasks', t.id, `a tarefa "${t.title}"`);
  },
  'toggle-phase': el => {
    prefs.closedPhases = prefs.closedPhases || [];
    const id = el.dataset.id;
    const ix = prefs.closedPhases.indexOf(id);
    if (ix >= 0) prefs.closedPhases.splice(ix, 1); else prefs.closedPhases.push(id);
    savePrefs(); render();
  },
  'toggle-show-done': () => { prefs.showDoneTasks = !prefs.showDoneTasks; savePrefs(); render(); },

  /* --- caixas --- */
  'new-box': () => openBoxEditor(null),
  'open-box': el => openBoxEditor(el.dataset.id),
  'advance-box': el => {
    const b = state.boxes.find(x => x.id === el.dataset.id);
    if (!b) return;
    const next = (BOX_STATUS[b.status] || BOX_STATUS.aberta).next;
    if (!next) return;
    b.status = next;
    touch(b);
    const msgs = { fechada: `fechou a caixa #${b.num}`, destino: `caixa #${b.num} chegou no destino`, desfeita: `desfez a caixa #${b.num}` };
    addLog('📦', msgs[next] || `atualizou a caixa #${b.num}`);
    save(); render();
  },
  'delete-box': el => {
    const b = state.boxes.find(x => x.id === editBoxId);
    closeDlg(el);
    if (b) softDelete('boxes', b.id, `a caixa #${b.num}`);
  },

  /* --- equipe --- */
  'new-person': () => openPersonEditor(null),
  'open-person': el => openPersonEditor(el.dataset.id),
  'pick-color': el => { pickedColor = el.dataset.color; renderColorPicker(pickedColor); },
  'delete-person': async el => {
    const p = state.people.find(x => x.id === editPersonId);
    closeDlg(el);
    if (!p) return;
    for (const i of state.items) if (i.assigneeId === p.id) { i.assigneeId = ''; }
    for (const t of state.tasks) if (t.assigneeId === p.id) { t.assigneeId = ''; }
    if (profile.personId === p.id) { profile.personId = null; saveProfile(); }
    softDelete('people', p.id, p.name);
  },
  'pick-profile': el => {
    const p = state.people.find(x => x.id === el.dataset.id);
    if (p) { setProfilePerson(p); closeDlg(el); }
  },

  /* --- ajustes / categorias --- */
  'edit-cat': el => { editingCatId = el.dataset.id; render(); },
  'cancel-cat': () => { editingCatId = null; render(); },
  'save-cat': el => {
    const row = el.closest('.cat-row');
    const c = state.cats.find(x => x.id === el.dataset.id);
    if (!c) return;
    const name = row.querySelector('.cat-name-input').value.trim();
    const emoji = row.querySelector('.cat-emoji-input').value.trim() || '📦';
    if (name) { c.name = name; c.emoji = emoji; touch(c); }
    editingCatId = null;
    save(); render();
  },
  'new-cat': () => {
    const c = { id: 'c' + uid(), name: 'Nova categoria', emoji: '🏷️', createdAt: now() };
    state.cats.push(c);
    touch(c);
    editingCatId = c.id;
    save(); render();
  },
  'del-cat': async el => {
    const c = state.cats.find(x => x.id === el.dataset.id);
    if (!c) return;
    const used = alive(state.items).filter(i => i.cat === c.id).length;
    const ok = await confirmAsk('Excluir categoria', used
      ? `"${c.name}" tem ${used} item(ns) — eles vão para "Outros". Excluir mesmo assim?`
      : `Excluir a categoria "${c.name}"?`, 'Excluir');
    if (!ok) return;
    for (const i of state.items) if (i.cat === c.id) { i.cat = 'outros'; touch(i); }
    c.deleted = true;
    touch(c);
    save(); render();
  },

  /* --- dados --- */
  'sheet-sync': () => sheetSync(false),
  'share-link': () => shareLink(),
  'share-text': () => shareText(),
  'export-json': () => exportJSON(),
  'export-csv': () => exportSheetCSV(),
  'import-json': () => $('#import-file').click(),
  'reset-all': async () => {
    const ok = await confirmAsk('Zerar tudo', 'Isso apaga TODOS os dados deste aparelho e restaura a lista inicial importada da planilha. Não dá para desfazer (exporte um backup antes!). Continuar?', 'Apagar tudo');
    if (!ok) return;
    state = normalizeState(makeSeedState());
    profile.personId = null;
    saveProfile();
    save(); render();
    toast('Tudo zerado — recomeçando do início 🌱');
  },
  'install-app': async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    render();
  },
};

/* ================= Eventos ================= */

document.addEventListener('click', e => {
  const stopEl = e.target.closest('[data-stop]');
  const el = e.target.closest('[data-act]');
  if (!el) {
    // fechar dialog ao tocar no backdrop
    if (e.target instanceof HTMLDialogElement) e.target.close();
    return;
  }
  // clique num elemento marcado data-stop (link, check) que não é a própria
  // ação mais próxima: deixa o comportamento padrão e não abre o card pai
  if (stopEl && stopEl !== el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
}, false);

$$('.tab').forEach(t => t.addEventListener('click', () => {
  prefs.tab = t.dataset.tab;
  savePrefs();
  render();
}));

document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'search-items') { prefs.f.q = e.target.value; savePrefs(); $('#list-region').innerHTML = comprasListHtml(); }
  if (id === 'search-boxes') { prefs.boxQ = e.target.value; savePrefs(); $('#list-region').innerHTML = boxesListHtml(); }
  // autopreenchimento da descrição/preço ao colar um link de loja
  if (e.target.classList && e.target.classList.contains('link-url')) {
    const row = e.target.closest('.link-row');
    clearTimeout(linkFillTimer);
    linkFillTimer = setTimeout(() => autofillLinkRow(row), 700);
  }
  if (e.target.classList && e.target.classList.contains('link-label') && e.isTrusted) {
    e.target.dataset.auto = '0'; // o usuário escreveu: não sobrescrever mais
  }
});

document.addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'sel-status') { prefs.f.status = e.target.value; savePrefs(); render(); }
  if (id === 'sel-prio')   { prefs.f.prio = e.target.value; savePrefs(); render(); }
  if (id === 'sel-sort')   { prefs.f.sort = e.target.value; savePrefs(); render(); }
  if (id === 'sel-group')  { prefs.f.group = !!e.target.value; savePrefs(); render(); }
  if (id === 'set-theme')  { prefs.theme = e.target.value; savePrefs(); applyTheme(); }
  if (id === 'set-title')  { state.meta.title = e.target.value.trim() || 'Minha Mudança'; state.meta.updatedAt = now(); save(); renderTopbar(); }
  if (id === 'set-date')   { state.meta.movingDate = e.target.value; state.meta.updatedAt = now(); save(); renderTopbar(); }
  if (id === 'set-budget') { state.meta.budgetTotal = parseMoney(e.target.value); state.meta.updatedAt = now(); save(); }
  if (id === 'set-sheet') { state.meta.sheetUrl = e.target.value.trim(); state.meta.updatedAt = now(); save(); }
  if (id === 'set-sheet-auto') { state.meta.sheetAuto = e.target.checked; state.meta.updatedAt = now(); save(); }
});

/* formulários */
$('#form-item').addEventListener('submit', e => { if (!submitItem()) e.preventDefault(); });
$('#form-task').addEventListener('submit', e => { if (!submitTask()) e.preventDefault(); });
$('#form-box').addEventListener('submit', e => { if (!submitBox()) e.preventDefault(); });
$('#form-person').addEventListener('submit', e => { if (!submitPerson()) e.preventDefault(); });
$('#form-profile').addEventListener('submit', e => { if (!submitProfile()) e.preventDefault(); });
$('#form-setup').addEventListener('submit', () => {
  const f = $('#form-setup');
  state.meta.movingDate = f.date.value;
  state.meta.budgetTotal = parseMoney(f.budget.value);
  state.meta.updatedAt = now();
  save(); render();
  toast(f.date.value ? 'Guia calibrado pela sua data 📅' : 'Salvo');
});

$('#incoming-merge').addEventListener('click', () => { applyIncoming('merge'); $('#dlg-incoming').close(); });
$('#incoming-replace').addEventListener('click', async () => {
  $('#dlg-incoming').close();
  const ok = await confirmAsk('Substituir tudo', 'Os dados deste aparelho serão substituídos pelos recebidos. Alterações locais não mescladas serão perdidas. Continuar?', 'Substituir');
  if (ok) applyIncoming('replace');
});

$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    showIncoming(data);
  } catch (err) {
    toast('Arquivo inválido 😕');
  }
});

/* ================= Init ================= */

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  if (prefs.tab === 'ajustes') render();
});

function init() {
  prefs = loadJSON(PREFS_KEY, { tab: 'resumo', theme: 'auto', f: defaultFilters(), closedCats: [], closedPhases: [], showDoneTasks: false, boxQ: '' });
  prefs.f = Object.assign(defaultFilters(), prefs.f);
  profile = loadJSON(PROFILE_KEY, { personId: null, name: '' });
  state = loadState();
  // se o perfil aponta para pessoa excluída, limpa
  if (profile.personId && !personById(profile.personId)) { profile.personId = null; }
  applyTheme();
  render();
  handleHash().then(() => {
    if (!profile.personId && !$('#dlg-incoming').open) {
      setTimeout(() => { if (!$('#dlg-incoming').open) openProfileDlg(); }, 600);
    }
  });
  window.addEventListener('hashchange', handleHash);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (state.meta.sheetUrl && state.meta.sheetAuto && navigator.onLine) {
    setTimeout(() => sheetSync(true), 1500);
  }
  // sincronização automática: ao abrir, ao voltar para o app e periodicamente
  if (syncEnabled()) setTimeout(() => syncNow(false), 800);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && syncEnabled()) syncNow(false);
  });
  setInterval(() => {
    if (document.visibilityState === 'visible' && syncEnabled()) syncNow(false);
  }, 90000);
}

init();
