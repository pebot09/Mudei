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
  return makeSeedState();
}

function save() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(state)); }
  catch (e) { toast('⚠️ Não consegui salvar (armazenamento cheio?)'); }
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

function computeStats() {
  const items = alive(state.items);
  const resolved = items.filter(isResolved);
  const pending = items.filter(i => !isResolved(i));
  const spent = sum(items, i => i.status === 'comprado' ? (i.paidPrice != null ? i.paidPrice : i.bestPrice) : null);
  const toSpend = sum(pending, i => i.cond === 'doacao' ? null : itemEstimate(i));
  const budget = sum(items, i => i.budget);
  let saved = 0;
  for (const i of items) {
    if (i.status === 'comprado') {
      const paid = i.paidPrice != null ? i.paidPrice : i.bestPrice;
      if (i.budget != null && paid != null) saved += i.budget - paid;
    } else if (i.status === 'doado' && i.budget != null) {
      saved += i.budget;
    }
  }
  return { items, resolved, pending, spent, toSpend, budget, saved };
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

/* ================= VIEW: Resumo ================= */

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
    dateLine = `<div class="hero-days"><button class="btn btn-sm" style="background:rgba(255,255,255,.22);border-color:transparent;color:#fff" data-act="go-ajustes">📅 Definir a data da mudança</button></div>`;
  }

  const hero = `
    <section class="card hero">
      <h2>${esc(state.meta.title || 'Minha Mudança')}</h2>
      ${dateLine}
      ${progressBar(pct)}
      <div class="progress-label"><span>${done} de ${total} itens resolvidos</span><span>${pct}%</span></div>
    </section>`;

  const overBudget = state.meta.budgetTotal != null && st.spent + st.toSpend > state.meta.budgetTotal;
  const statCards = `
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">Orçamento previsto</div><div class="stat-value">${fmtMoney(st.budget)}</div><div class="stat-hint">soma dos itens</div></div>
      <div class="stat"><div class="stat-label">Gasto até agora</div><div class="stat-value">${fmtMoney(st.spent)}</div><div class="stat-hint">${(n => `${n} compra${n === 1 ? '' : 's'}`)(st.resolved.filter(i => i.status === 'comprado').length)}</div></div>
      <div class="stat ${overBudget ? 'bad' : ''}"><div class="stat-label">Ainda vai gastar</div><div class="stat-value">${fmtMoney(st.toSpend)}</div><div class="stat-hint">estimativa dos pendentes</div></div>
      <div class="stat ${st.saved > 0 ? 'good' : ''}"><div class="stat-label">Economia</div><div class="stat-value">${fmtMoney(st.saved)}</div><div class="stat-hint">vs. orçamento previsto</div></div>
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
          <span>Gasto: <b>${fmtMoney(st.spent)}</b></span>
          <span>Projeção final: <b style="color:${projected > state.meta.budgetTotal ? 'var(--red)' : 'var(--green)'}">${fmtMoney(projected)}</b></span>
        </div>
        ${projected > state.meta.budgetTotal ? `<p class="small" style="color:var(--red)">⚠️ A projeção passa do teto em ${fmtMoney(projected - state.meta.budgetTotal)}. Vale caçar preço melhor ou cortar itens.</p>` : ''}
      </section>`;
  }

  const urgent = st.pending.filter(i => i.prio === 'alta').slice(0, 6);
  const urgentCard = urgent.length ? `
    <section class="card">
      <h3>🔴 Prioridade alta pendente <span class="count">${st.pending.filter(i => i.prio === 'alta').length}</span></h3>
      ${urgent.map(i => `
        <button class="alert-item" data-act="open-item" data-id="${i.id}">
          <span>${catById(i.cat).emoji}</span>
          <span class="grow">${esc(i.name)}</span>
          <span class="muted small">${fmtMoney(itemEstimate(i))}</span>
        </button>`).join('')}
    </section>` : '';

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

  const tasks = alive(state.tasks);
  const tasksPend = tasks.filter(t => !t.done);
  const phaseOrder = Object.fromEntries(TASK_PHASES.map((p, i) => [p.id, i]));
  const nextTasks = tasksPend
    .slice()
    .sort((a, b) => (a.due && b.due ? a.due.localeCompare(b.due) : a.due ? -1 : b.due ? 1 : (phaseOrder[a.phase] || 0) - (phaseOrder[b.phase] || 0)))
    .slice(0, 5);
  const tasksCard = `
    <section class="card">
      <h3>✅ Próximas tarefas <span class="count">${tasksPend.length} pendentes</span></h3>
      ${nextTasks.length ? nextTasks.map(t => taskRowHtml(t)).join('') : '<p class="muted">Tudo feito por aqui 🎉</p>'}
      <button class="btn btn-ghost btn-sm" data-act="go-tarefas">Ver todas →</button>
    </section>`;

  const boxes = alive(state.boxes);
  const boxesCard = boxes.length ? `
    <section class="card">
      <h3>📦 Caixas <span class="count">${boxes.length}</span></h3>
      <div class="btn-row">
        <span class="chip">📭 ${boxes.filter(b => b.status === 'aberta').length} empacotando</span>
        <span class="chip amber">📦 ${boxes.filter(b => b.status === 'fechada').length} fechadas</span>
        <span class="chip blue">🚚 ${boxes.filter(b => b.status === 'destino').length} no destino</span>
        <span class="chip green">✅ ${boxes.filter(b => b.status === 'desfeita').length} desfeitas</span>
      </div>
      <button class="btn btn-ghost btn-sm" data-act="go-caixas" style="margin-top:8px">Ver caixas →</button>
    </section>` : '';

  const logCard = state.log.length ? `
    <section class="card">
      <h3>🕓 Atividade recente</h3>
      ${state.log.slice(0, 8).map(l => `
        <div class="log-row"><span>${l.emoji || '•'}</span><span><b>${esc(l.who)}</b> ${esc(l.text)}</span><span class="when">${relTime(l.ts)}</span></div>`).join('')}
    </section>` : '';

  const collabHint = alive(state.people).length < 2 ? `
    <section class="card" style="background:var(--accent-soft);border-color:transparent">
      <h3>👋 Mudança em equipe</h3>
      <p class="small" style="color:var(--accent-text)">Tem gente ajudando? Toque em <b>compartilhar</b> (ícone no topo) e mande o link com os dados. Cada pessoa marca o que fez e vocês mesclam tudo de volta.</p>
      <button class="btn btn-sm btn-primary" data-act="open-share">Compartilhar agora</button>
    </section>` : '';

  return `
    <h1 class="view-title">Resumo</h1>
    <p class="view-sub">Visão geral da sua mudança</p>
    ${hero}
    ${statCards}
    ${budgetCard}
    <div class="dash-cols">
      <div>
        ${urgentCard}
        <section class="card"><h3>🗂️ Por categoria</h3>${catRows || '<p class="muted">Sem itens ainda.</p>'}</section>
      </div>
      <div>
        ${tasksCard}
        ${boxesCard}
        ${collabHint}
        ${logCard}
      </div>
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
      q ? 'Procure por outra palavra — a busca olha o conteúdo de cada caixa.' : 'Numere as caixas e liste o conteúdo: achar as coisas depois fica mole.');
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
      <h3>🤝 Como colaborar</h3>
      <p class="small" style="color:var(--accent-text)">1. Adicione cada pessoa aqui e atribua itens/tarefas.<br>
      2. Mande o <b>link com os dados</b> (botão compartilhar, no topo) para elas abrirem no celular.<br>
      3. Quando alguém atualizar algo, é só mandar o link de volta e <b>mesclar</b> — o app junta tudo sem perder nada.</p>
      <button class="btn btn-sm btn-primary" data-act="open-share">Compartilhar dados</button>
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
      <input class="link-url" placeholder="https://…" inputmode="url" value="${esc(l && l.url || '')}">
      <button type="button" class="iconbtn" data-act="rm-link" aria-label="Remover link" style="width:32px;height:32px">✕</button>
    </div>`;
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
      if (est != null) out += ` — até ${fmtMoney(est)}`;
      if (i.donor) out += ` (doação: ${i.donor})`;
      out += '\n';
    }
  }
  const est = sum(items, i => i.cond === 'doacao' ? null : itemEstimate(i));
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

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date().toISOString().slice(0, 10);
  a.download = `mudei-backup-${d}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast('Backup exportado 💾');
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

  'close-dlg': el => closeDlg(el),
  'open-share': () => openDlg('#dlg-share'),
  'open-profile': () => openProfileDlg(),

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
      it.status = it.cond === 'doacao' || it.donor ? 'doado' : 'comprado';
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
  'share-link': () => shareLink(),
  'share-text': () => shareText(),
  'export-json': () => exportJSON(),
  'import-json': () => $('#import-file').click(),
  'reset-all': async () => {
    const ok = await confirmAsk('Zerar tudo', 'Isso apaga TODOS os dados deste aparelho e restaura a lista inicial importada da planilha. Não dá para desfazer (exporte um backup antes!). Continuar?', 'Apagar tudo');
    if (!ok) return;
    state = makeSeedState();
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
});

/* formulários */
$('#form-item').addEventListener('submit', e => { if (!submitItem()) e.preventDefault(); });
$('#form-task').addEventListener('submit', e => { if (!submitTask()) e.preventDefault(); });
$('#form-box').addEventListener('submit', e => { if (!submitBox()) e.preventDefault(); });
$('#form-person').addEventListener('submit', e => { if (!submitPerson()) e.preventDefault(); });
$('#form-profile').addEventListener('submit', e => { if (!submitProfile()) e.preventDefault(); });

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
}

init();
