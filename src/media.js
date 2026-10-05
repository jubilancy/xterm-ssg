import '@fontsource/victor-mono/400.css';
import '@fontsource/victor-mono/700.css';
import './style.css';
import './media.css';
import Masonry from 'masonry-layout';
import imagesLoaded from 'imagesloaded';
import { initChrome } from './lib/chrome.js';
import { createFeed, SOURCES } from './lib/art.js';

initChrome();
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

const params = new URLSearchParams(location.search);
const state = {
  q: params.get('q') || '',
  sources: new Set((params.get('src') || 'aic,met,cma').split(',').filter((s) => SOURCES[s])),
  feed: null, items: [], loading: false, view: 'feed', gen: 0, viewerIdx: -1, viewerList: [],
  saved: (() => { try { return JSON.parse(localStorage.getItem('saved') || '{}'); } catch { return {}; } })(),
};
if (!state.sources.size) state.sources = new Set(Object.keys(SOURCES));

const grid = $('#grid');
const msnry = new Masonry(grid, { itemSelector: '.card', columnWidth: '.sizer', gutter: 14, percentPosition: true, transitionDuration: 0, initLayout: false });
msnry.layout();

const persistSaved = () => { try { localStorage.setItem('saved', JSON.stringify(state.saved)); } catch {} };
const syncUrl = () => {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.sources.size < 3) p.set('src', [...state.sources].join(','));
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
};

// ---------- cards ----------
function card(it) {
  const img = el('img', { alt: `${it.title}${it.artist ? ' by ' + it.artist : ''}`, loading: 'lazy', decoding: 'async', src: it.thumb });
  if (it.ratio) img.style.aspectRatio = `${1} / ${it.ratio}`;
  const open = el('button', { type: 'button', className: 'imgbtn', title: 'open viewer' }, img);
  open.onclick = () => openViewer(it);
  const tags = el('div', { className: 'tags' }, ...it.tags.map((t) => tagBtn(t)));
  const save = el('button', { type: 'button', className: 'save', title: 'save', textContent: state.saved[it.id] ? '♥' : '♡' });
  save.setAttribute('aria-pressed', String(!!state.saved[it.id]));
  save.onclick = () => toggleSave(it, save);
  const src = SOURCES[it.source];
  const node = el('article', { className: 'card' },
    open,
    el('div', { className: 'meta' },
      el('a', { className: 'title', href: it.url, target: '_blank', rel: 'noopener', textContent: it.title }),
      el('div', { className: 'by', textContent: [it.artist, it.date].filter(Boolean).join(' · ') }),
      el('div', { className: 'row' },
        el('a', { className: 'badge', href: src.site, target: '_blank', rel: 'noopener', title: src.label, textContent: src.short }),
        el('span', { className: 'dim', textContent: it.license }), save),
      tags));
  node.dataset.id = it.id;
  img.addEventListener('error', () => { node.remove(); msnry.reloadItems(); msnry.layout(); });
  return node;
}
function tagBtn(t) {
  return el('button', { type: 'button', textContent: `#${t.replace(/\s+/g, '-')}`, title: `search "${t}"`, onclick: () => { closeViewer(); setQuery(t); } });
}
function toggleSave(it, btn) {
  if (state.saved[it.id]) delete state.saved[it.id]; else state.saved[it.id] = it;
  persistSaved();
  const on = !!state.saved[it.id];
  if (btn) { btn.textContent = on ? '♥' : '♡'; btn.setAttribute('aria-pressed', String(on)); }
  document.querySelectorAll(`.card[data-id="${CSS.escape(it.id)}"] .save`).forEach((b) => { b.textContent = on ? '♥' : '♡'; b.setAttribute('aria-pressed', String(on)); });
  stats();
  if (state.view === 'saved' && !on) showSaved();
}

function append(items) {
  const nodes = items.map(card);
  grid.append(...nodes);
  msnry.appended(nodes);
  imagesLoaded(grid).on('progress', () => msnry.layout());
  tagsInView();
}

// ---------- loading ----------
async function loadMore() {
  if (state.loading || state.view !== 'feed' || !state.feed || state.feed.exhausted()) return;
  state.loading = true;
  const gen = state.gen;
  $('#msg').textContent = 'loading…';
  let batch = [];
  for (let tries = 0; tries < 3 && !batch.length && !state.feed.exhausted(); tries++) batch = await state.feed.next();
  if (gen !== state.gen) return;
  state.loading = false;
  state.items.push(...batch);
  append(batch);
  sourcesWidget(); stats();
  const msg = $('#msg');
  if (!batch.length) {
    const allErr = Object.values(state.feed.status).every((s) => s.err > 0 && s.ok === 0);
    msg.textContent = allErr ? 'could not reach any museum API (check your connection, then press shuffle)' : state.items.length ? 'end of the line. try another search.' : `nothing found for "${state.q}"`;
  } else msg.textContent = '';
}

function reset() {
  state.gen++;
  state.loading = false;
  state.view = 'feed';
  $('#savedbtn').setAttribute('aria-pressed', 'false');
  state.items = [];
  grid.querySelectorAll('.card').forEach((n) => n.remove());
  msnry.reloadItems(); msnry.layout();
  state.feed = createFeed({ q: state.q, sources: [...state.sources] });
  $('#q').value = state.q;
  $('#active-q').textContent = state.q ? `showing: "${state.q}"` : 'showing: random browse';
  document.title = `${state.q ? state.q + ' · ' : ''}media · el`;
  syncUrl(); sourcesWidget(); stats(); tagsInView();
  $('#msg').textContent = '';
  loadMore();
}
function setQuery(q) { state.q = q.trim(); window.scrollTo({ top: 0 }); reset(); }

function showSaved() {
  state.gen++;
  state.view = 'saved';
  $('#savedbtn').setAttribute('aria-pressed', 'true');
  grid.querySelectorAll('.card').forEach((n) => n.remove());
  const items = Object.values(state.saved);
  state.items = items;
  $('#active-q').textContent = `showing: saved (${items.length})`;
  $('#msg').textContent = items.length ? '' : 'nothing saved yet. press the heart on any card.';
  msnry.reloadItems(); msnry.layout();
  append(items);
  stats();
}

// ---------- viewer ----------
const dlg = $('#viewer');
function openViewer(it) {
  state.viewerList = state.items;
  state.viewerIdx = state.viewerList.findIndex((x) => x.id === it.id);
  paintViewer(it);
  if (!dlg.open) dlg.showModal();
}
function paintViewer(it) {
  $('#v-img').src = it.img; $('#v-img').alt = it.title;
  const t = $('#v-title'); t.textContent = it.title; t.href = it.url;
  $('#v-by').textContent = [it.artist, it.date].filter(Boolean).join(' · ');
  const s = $('#v-src'); s.textContent = SOURCES[it.source].label; s.href = SOURCES[it.source].site;
  $('#v-lic').textContent = it.license;
  $('#v-count').textContent = `${state.viewerIdx + 1} / ${state.viewerList.length}`;
  $('#v-tags').replaceChildren(...it.tags.map(tagBtn));
  const sv = $('#v-save'); sv.textContent = state.saved[it.id] ? 'saved ♥' : 'save ♡';
  sv.onclick = () => { toggleSave(it); sv.textContent = state.saved[it.id] ? 'saved ♥' : 'save ♡'; };
  $('#v-copy').onclick = async () => { try { await navigator.clipboard.writeText(it.url); $('#v-copy').textContent = 'copied'; setTimeout(() => ($('#v-copy').textContent = 'copy link'), 1200); } catch { $('#v-copy').textContent = it.url; } };
}
function step(d) {
  const n = state.viewerIdx + d;
  if (n < 0 || n >= state.viewerList.length) return;
  state.viewerIdx = n; paintViewer(state.viewerList[n]);
}
function closeViewer() { if (dlg.open) dlg.close(); }
$('#v-close').onclick = closeViewer;
dlg.addEventListener('click', (e) => { if (e.target === dlg) closeViewer(); });

// ---------- widgets ----------
function sourcesWidget() {
  const rows = Object.entries(SOURCES).map(([k, s]) => {
    const on = state.sources.has(k), st = state.feed?.status[k] || { ok: 0, err: 0, last: '' };
    return el('div', { className: 'srcrow', title: st.last ? `last error: ${st.last}` : s.label },
      el('span', { className: `dot ${!on ? '' : st.err && !st.ok ? 'err' : st.ok ? 'ok' : ''}` }),
      el('a', { href: s.site, target: '_blank', rel: 'noopener', textContent: s.label }),
      el('span', { className: 'dim', textContent: on ? `${st.ok}${st.err ? ` · ${st.err} err` : ''}` : 'off' }));
  });
  $('#w-sources .body').replaceChildren(...rows);
}
function stats() {
  $('#savedn').textContent = Object.keys(state.saved).length;
  const b = $('#w-stats .body');
  const kv = [['loaded', state.items.length], ['saved', Object.keys(state.saved).length], ['query', state.q || '(random)']];
  b.replaceChildren(...kv.map(([k, v]) => el('div', { className: 'srcrow' }, el('span'), el('span', { className: 'dim', textContent: k }), el('span', { textContent: String(v) }))));
}
function tagsInView() {
  const counts = new Map();
  for (const it of state.items) for (const t of it.tags) counts.set(t, (counts.get(t) || 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 24);
  $('#w-tags .body').replaceChildren(top.length ? el('div', { className: 'tags' }, ...top.map(([t, n]) => el('button', { type: 'button', textContent: `${t} ${n}`, onclick: () => setQuery(t) }))) : el('span', { className: 'dim', textContent: 'none yet' }));
}

// ---------- wiring ----------
$('#search').addEventListener('submit', (e) => { e.preventDefault(); setQuery($('#q').value); });
$('#shuffle').onclick = () => { window.scrollTo({ top: 0 }); reset(); };
$('#savedbtn').onclick = () => (state.view === 'saved' ? reset() : showSaved());
document.querySelectorAll('.srcs [data-src]').forEach((b) => {
  b.setAttribute('aria-pressed', String(state.sources.has(b.dataset.src)));
  b.onclick = () => {
    const k = b.dataset.src;
    if (state.sources.has(k)) { if (state.sources.size === 1) return; state.sources.delete(k); } else state.sources.add(k);
    b.setAttribute('aria-pressed', String(state.sources.has(k)));
    reset();
  };
});
document.addEventListener('keydown', (e) => {
  if (dlg.open) { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); return; }
  if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { if (e.key === 'Escape') document.activeElement.blur(); return; }
  if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
  if (e.key === 'r') $('#shuffle').click();
  if (e.key === 's') $('#savedbtn').click();
});
new IntersectionObserver((es) => { if (es[0].isIntersecting) loadMore(); }, { rootMargin: '1400px 0px' }).observe($('#sentinel'));

reset();
