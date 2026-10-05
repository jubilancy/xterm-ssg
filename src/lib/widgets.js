import dayjs from 'dayjs';
import cfg from '../config.js';
import { savedLocation, askLocation, fetchWeather, moonPhase } from './weather.js';
import { artOfTheDay } from './art.js';

const $ = (id) => document.querySelector(`#${id} .body`);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};
const meter = (frac, n = 14) => '█'.repeat(Math.round(frac * n)) + '░'.repeat(n - Math.round(frac * n));

export function initWidgets(started) {
  clockWidget(); weatherWidget(); moonWidget(); progressWidget(); artWidget(); linksWidget(); sysWidget(started);
}

function clockWidget() {
  const b = $('w-clock');
  const big = el('div', { className: 'big-time' }), sub = el('div', { className: 'dim' });
  b.replaceChildren(big, sub);
  const tick = () => { const n = dayjs(); big.textContent = n.format('HH:mm'); sub.textContent = n.format('dddd, MMMM D') + ' · ' + Intl.DateTimeFormat().resolvedOptions().timeZone; };
  tick(); setInterval(tick, 1000 * 15);
}

async function weatherWidget() {
  const b = $('w-weather');
  const show = async (loc) => {
    try {
      const w = await fetchWeather(loc);
      b.replaceChildren(el('div', { className: 'big-time', textContent: `${w.temp}°F` }), el('div', { className: 'dim', textContent: w.desc + (loc.label ? ` · ${loc.label}` : '') }));
    } catch (e) { b.textContent = `weather unavailable (${e.message})`; }
  };
  const loc = savedLocation();
  if (loc) return show(loc);
  const btn = el('button', { type: 'button', textContent: 'use my location' });
  btn.onclick = async () => { try { show(await askLocation()); } catch (e) { b.textContent = e.message; } };
  b.replaceChildren(el('div', { className: 'dim', textContent: 'stays in your browser. ' }), btn);
}

function moonWidget() {
  const m = moonPhase();
  $('w-moon').replaceChildren(el('span', { className: 'moon-glyph', textContent: m.glyph }), el('div', { textContent: m.name }), el('div', { className: 'dim', textContent: `age ${m.age} days · ~${m.lit}% lit` }));
}

function progressWidget() {
  const b = $('w-progress');
  const draw = () => {
    const n = dayjs();
    const rows = [
      ['day', (n.diff(n.startOf('day')) / 86400000)],
      ['week', (n.diff(n.startOf('week')) / (7 * 86400000))],
      ['year', (n.diff(n.startOf('year')) / n.endOf('year').diff(n.startOf('year')))],
    ];
    b.replaceChildren(...rows.map(([k, f]) => el('div', { className: 'bar-row' },
      el('span', { className: 'dim', textContent: k }), el('span', { className: 'meter', textContent: meter(f) }), el('span', { textContent: `${Math.round(f * 100)}%` }))));
  };
  draw(); setInterval(draw, 60_000);
}

async function artWidget() {
  const b = $('w-art');
  try {
    const a = await artOfTheDay();
    const img = el('img', { src: a.thumb, alt: `${a.title}${a.artist ? ' by ' + a.artist : ''}`, loading: 'lazy' });
    b.replaceChildren(img, el('a', { className: 't', href: a.url, target: '_blank', rel: 'noopener', textContent: a.title }),
      el('div', { className: 'dim', textContent: [a.artist, a.date].filter(Boolean).join(' · ') }),
      el('div', { className: 'dim' }, 'Art Institute of Chicago · ', el('a', { href: '/media', textContent: 'more →' })));
  } catch (e) { b.textContent = `art unavailable (${e.message})`; }
}

function linksWidget() {
  $('w-links').replaceChildren(el('ul', {}, ...cfg.links.map((l) => el('li', {}, el('a', { href: l.url, target: '_blank', rel: 'noopener', textContent: l.name })))));
}

async function sysWidget(started) {
  const b = $('w-sys');
  let visits = 1;
  try { visits = (Number(localStorage.getItem('visits')) || 0) + 1; localStorage.setItem('visits', String(visits)); } catch {}
  const rows = {
    'visits (you)': String(visits),
    cores: String(navigator.hardwareConcurrency ?? '?'),
    memory: navigator.deviceMemory ? `${navigator.deviceMemory} GB+` : 'n/a',
    screen: `${screen.width}x${screen.height}`,
    network: navigator.connection?.effectiveType || 'n/a',
    battery: 'n/a',
    session: '0s',
  };
  const dl = el('dl', { className: 'kv' });
  const dd = {};
  for (const [k, v] of Object.entries(rows)) { dl.append(el('dt', { textContent: k })); dd[k] = el('dd', { textContent: v }); dl.append(dd[k]); }
  b.replaceChildren(dl);
  setInterval(() => { dd.session.textContent = `${dayjs().diff(started, 'second')}s`; }, 1000);
  try {
    const bat = await navigator.getBattery?.();
    if (bat) { const f = () => { dd.battery.textContent = `${Math.round(bat.level * 100)}%${bat.charging ? ' ⚡' : ''}`; }; f(); bat.addEventListener('levelchange', f); bat.addEventListener('chargingchange', f); }
  } catch {}
}
