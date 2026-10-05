import '@fontsource/victor-mono/400.css';
import '@fontsource/victor-mono/700.css';
import '@xterm/xterm/css/xterm.css';
import './style.css';
import './landing.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import cfg from './config.js';
import { initChrome } from './lib/chrome.js';
import { initWidgets } from './lib/widgets.js';
import { pickQuote } from './lib/quotes.js';
import { fitBanner } from './lib/figlets.js';
import { rainbow, hex, ESC, reset, dim, wrap, stripAnsi } from './lib/ansi.js';
import { makeFs, createCommands, resolvePath, nodeAt } from './lib/commands.js';

initChrome();
const started = new Date();
initWidgets(started);

const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const termTheme = () => ({
  background: cssVar('--panel'), foreground: cssVar('--fg'), cursor: cssVar('--accent'), cursorAccent: cssVar('--panel'),
  selectionBackground: cssVar('--line'),
});

async function main() {
  await Promise.race([document.fonts.load('15px "Victor Mono"'), new Promise((r) => setTimeout(r, 1500))]);
  const term = new Terminal({
    fontFamily: '"Victor Mono", ui-monospace, Menlo, Consolas, monospace', fontSize: 15, lineHeight: 1.15,
    cursorBlink: true, convertEol: true, scrollback: 3000, theme: termTheme(), allowProposedApi: true,
    screenReaderMode: false,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());
  term.open(document.getElementById('term'));
  const refit = () => { try { fit.fit(); } catch {} };
  refit();
  new ResizeObserver(refit).observe(document.getElementById('term'));
  window.addEventListener('themechange', () => { term.options.theme = termTheme(); });

  const quote = pickQuote();
  const state = { cwd: [] };
  const ctx = {
    term, state, started, history: [], abort: new AbortController(),
    fs: null,
    out: (s = '') => term.write(String(s).replace(/\r?\n/g, '\r\n') + '\r\n'),
  };
  ctx.fs = makeFs(() => quote);
  const cmds = createCommands(ctx);

  const path = () => (state.cwd.length ? '~/' + state.cwd.join('/') : '~');
  const prompt = () => `${hex('#e08a6f', cfg.name)}${dim('@')}${hex('#b5624c', 'web')} ${hex('#9ab8e8', path())} ${hex('#e8c46a', '$')} `;
  const plen = () => stripAnsi(prompt()).length;

  // ---- boot: the quote as colourful ascii, typed out ----
  let skip = false, booting = true, busy = false;
  const typeOut = async (s, chunk = 28, ms = 10) => {
    let i = 0;
    for (; i < s.length && !skip; i += chunk) {
      term.write(s.slice(i, i + chunk));
      await new Promise((r) => setTimeout(r, ms));
    }
    if (i < s.length) term.write(s.slice(i));
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const banner = fitBanner(quote.quote, term.cols, Math.max(6, Math.floor(term.rows * 0.55)));
  const hue = Math.floor(Math.random() * 360);
  term.write(`${ESC}?25l`);
  if (banner) {
    const art = rainbow(banner.out, hue).replace(/\n/g, '\r\n');
    if (reduce) term.write(art); else await typeOut(art);
  } else {
    const plain = rainbow(wrap(`"${quote.quote}"`, term.cols - 4).join('\n'), hue).replace(/\n/g, '\r\n');
    if (reduce) term.write(plain); else await typeOut(plain, 3, 14);
  }
  term.write(`\r\n${dim('  - ' + quote.author + (quote.source ? ', ' + quote.source : ''))}\r\n\r\n`);
  term.write(`${hex('#e08a6f', 'welcome.')} type ${hex('#e8c46a', 'help')} to see what this terminal can do, or ${hex('#e8c46a', 'media')} for the art scroll.\r\n\r\n`);
  term.write(`${ESC}?25h`);
  booting = false;

  // ---- line editor ----
  let buf = '', pos = 0, hist = -1, draft = '';
  const redraw = () => {
    term.write(`\r${ESC}2K${prompt()}${buf}`);
    const back = buf.length - pos;
    if (back > 0) term.write(`${ESC}${back}D`);
  };
  const showPrompt = () => { buf = ''; pos = 0; hist = -1; term.write(prompt()); };

  const complete = () => {
    const before = buf.slice(0, pos), parts = before.split(/\s+/);
    const last = parts[parts.length - 1];
    let pool;
    if (parts.length === 1) pool = Object.keys(cmds);
    else {
      const dirPart = last.includes('/') ? last.slice(0, last.lastIndexOf('/') + 1) : '';
      const dir = nodeAt(ctx.fs, resolvePath(state.cwd, dirPart || '.'));
      pool = dir && typeof dir === 'object' ? Object.entries(dir).map(([k, v]) => dirPart + k + (typeof v === 'object' ? '/' : '')) : [];
      if (['open', 'links'].includes(parts[0])) pool = pool.concat(cfg.links.map((l) => l.name));
    }
    const hits = pool.filter((p) => p.startsWith(last));
    if (!hits.length) return;
    if (hits.length === 1) { buf = buf.slice(0, pos - last.length) + hits[0] + (hits[0].endsWith('/') ? '' : ' ') + buf.slice(pos); pos = pos - last.length + hits[0].length + (hits[0].endsWith('/') ? 0 : 1); redraw(); return; }
    term.write(`\r\n${hits.join('   ')}\r\n`); redraw();
  };

  const run = async (line) => {
    const text = line.trim();
    if (!text) return;
    ctx.history.push(text);
    const args = text.match(/"[^"]*"|'[^']*'|\S+/g).map((a) => a.replace(/^["']|["']$/g, ''));
    const name = args.shift().toLowerCase();
    const cmd = cmds[name];
    if (!cmd) { ctx.out(`${name}: command not found. try ${hex('#e8c46a', 'help')}`); return; }
    ctx.abort = new AbortController();
    busy = true;
    try { await cmd.fn(args); } catch (e) { ctx.out(`${hex('#e87a7a', name + ': ' + (e?.message || e))}`); }
    busy = false;
  };

  term.onData(async (d) => {
    if (booting) { skip = true; return; }
    if (busy) { if (d === '\x03' || d === '\x1b' || d === 'q') ctx.abort.abort(); else if (d.length && ctx.abort) ctx.abort.abort(); return; }
    if (d === '\r') {
      term.write('\r\n');
      const line = buf;
      await run(line);
      showPrompt();
    } else if (d === '\x7f') { if (pos > 0) { buf = buf.slice(0, pos - 1) + buf.slice(pos); pos--; redraw(); } }
    else if (d === '\x03') { term.write('^C\r\n'); showPrompt(); }
    else if (d === '\x0c') { term.clear(); redraw(); }
    else if (d === '\x15') { buf = buf.slice(pos); pos = 0; redraw(); }
    else if (d === '\x01' || d === `${ESC}H`) { pos = 0; redraw(); }
    else if (d === '\x05' || d === `${ESC}F`) { pos = buf.length; redraw(); }
    else if (d === `${ESC}D`) { if (pos > 0) { pos--; redraw(); } }
    else if (d === `${ESC}C`) { if (pos < buf.length) { pos++; redraw(); } }
    else if (d === `${ESC}A`) { if (hist < ctx.history.length - 1) { if (hist === -1) draft = buf; hist++; buf = ctx.history[ctx.history.length - 1 - hist]; pos = buf.length; redraw(); } }
    else if (d === `${ESC}B`) { if (hist >= 0) { hist--; buf = hist === -1 ? draft : ctx.history[ctx.history.length - 1 - hist]; pos = buf.length; redraw(); } }
    else if (d === `${ESC}3~`) { if (pos < buf.length) { buf = buf.slice(0, pos) + buf.slice(pos + 1); redraw(); } }
    else if (d === '\t') complete();
    else if (d >= ' ' && !d.startsWith(ESC)) { buf = buf.slice(0, pos) + d + buf.slice(pos); pos += d.length; redraw(); }
  });

  showPrompt();
  term.focus();
  document.getElementById('term').addEventListener('click', () => term.focus());
  document.getElementById('foot-r').textContent = `${cfg.name}`;
  window.__term = term; // handy for debugging in devtools
}

main().catch((e) => {
  document.getElementById('term').textContent = `terminal failed to start: ${e.message}`;
});
