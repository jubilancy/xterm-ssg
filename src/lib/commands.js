import dayjs from 'dayjs';
import { Parser } from 'expr-eval';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import cfg from '../config.js';
import { ESC, reset, bold, dim, rgb, hex, rainbow, wrap, hsl } from './ansi.js';
import { render as figletRender, fontNames } from './figlets.js';
import { pickQuote, quotes } from './quotes.js';
import { fetchNowPlaying } from './nowplaying.js';
import { savedLocation, askLocation, fetchWeather, moonPhase } from './weather.js';
import { randomArt } from './art.js';
import { setTheme, currentTheme } from './chrome.js';

const A = '#e08a6f';
const c = (s) => hex(A, s);
const sleep = (ms, signal) => new Promise((res) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
});

// ---- tiny virtual filesystem ---------------------------------------------------
export function makeFs(getQuote) {
  return {
    'about.txt': () => cfg.about.join('\n'),
    'links.txt': () => cfg.links.map((l) => `${l.name.padEnd(10)} ${l.url}`).join('\n'),
    'now.txt': async () => {
      const n = await fetchNowPlaying();
      if (n.state === 'playing') return `now listening: ${n.artist ?? ''} - ${n.title ?? ''}`;
      return { idle: 'nothing playing right now', unset: 'now listening is not set up (src/config.js)', error: 'music service unreachable' }[n.state];
    },
    'quote.txt': () => { const q = getQuote(); return `"${q.quote}"\n  - ${q.author}, ${q.source}`; },
    projects: Object.fromEntries(cfg.links.filter((l) => !/bsky\.app|github\.com/.test(l.url)).map((l) => [`${l.name}.url`, () => l.url])),
    media: { 'README.txt': () => 'public-domain art from three museum APIs.\nrun `media` to open the scroll.' },
  };
}

export function resolvePath(cwd, input) {
  const parts = (input.startsWith('/') || input.startsWith('~') ? [] : [...cwd]);
  for (const seg of input.replace(/^~/, '').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop(); else parts.push(seg);
  }
  return parts;
}
export function nodeAt(fs, parts) {
  let n = fs;
  for (const p of parts) { if (n && typeof n === 'object' && p in n) n = n[p]; else return undefined; }
  return n;
}
const isDir = (n) => n && typeof n === 'object';

// ---- helpers -------------------------------------------------------------------
async function imageToAnsi(url, cols) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const rowsPx = Math.max(2, Math.round(cols * (img.naturalHeight / img.naturalWidth)));
  const cv = document.createElement('canvas');
  cv.width = cols; cv.height = rowsPx + (rowsPx % 2);
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, cv.width, cv.height);
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  const px = (x, y) => { const i = (y * cv.width + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const lines = [];
  for (let y = 0; y < cv.height; y += 2) {
    let line = '';
    for (let x = 0; x < cv.width; x++) {
      const [r, gg, b] = px(x, y), [r2, g2, b2] = px(x, y + 1);
      line += `${ESC}38;2;${r};${gg};${b}m${ESC}48;2;${r2};${g2};${b2}m▀`;
    }
    lines.push(line + reset);
  }
  return lines.join('\n');
}

function qrAnsi(text) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = modules.size, q = 2;
  const dark = (x, y) => x >= 0 && y >= 0 && x < n && y < n && modules.get(y, x);
  const lines = [];
  for (let y = -q; y < n + q; y += 2) {
    let line = '';
    for (let x = -q; x < n + q; x++) {
      const t = dark(x, y) ? 0 : 255, b = dark(x, y + 1) ? 0 : 255;
      line += `${ESC}38;2;${t};${t};${t}m${ESC}48;2;${b};${b};${b}m▀`;
    }
    lines.push(line + reset);
  }
  return lines.join('\n');
}

const hexOf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const u8ToB64 = (u8) => btoa(String.fromCharCode(...u8));

function jsonColor(v, ind = 0) {
  const pad = '  '.repeat(ind), pad2 = '  '.repeat(ind + 1);
  if (v === null) return dim('null');
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => pad2 + jsonColor(x, ind + 1)).join(',\n')}\n${pad}]` : '[]';
  if (typeof v === 'object') {
    const ks = Object.keys(v);
    return ks.length ? `{\n${ks.map((k) => `${pad2}${c(JSON.stringify(k))}: ${jsonColor(v[k], ind + 1)}`).join(',\n')}\n${pad}}` : '{}';
  }
  if (typeof v === 'string') return hex('#9bc59a', JSON.stringify(v));
  return hex('#e8c46a', String(v));
}

const COW = (msg) => {
  const lines = wrap(msg, 34).filter((l) => l !== '' || true);
  const w = Math.max(...lines.map((l) => l.length));
  const top = ' ' + '_'.repeat(w + 2), bot = ' ' + '-'.repeat(w + 2);
  const body = lines.map((l, i) => {
    const [a, b] = lines.length === 1 ? ['<', '>'] : i === 0 ? ['/', '\\'] : i === lines.length - 1 ? ['\\', '/'] : ['|', '|'];
    return `${a} ${l.padEnd(w)} ${b}`;
  });
  return [top, ...body, bot, '        \\   ^__^', '         \\  (oo)\\_______', '            (__)\\       )\\/\\', '                ||----w |', '                ||     ||'].join('\n');
};

// ---- the command table -----------------------------------------------------------
export function createCommands(ctx) {
  const { out, term, fs, state } = ctx;
  const cmds = {};
  const add = (name, desc, fn) => { cmds[name] = { desc, fn }; };

  add('help', 'list commands', () => {
    const rows = Object.entries(cmds).filter(([k]) => !cmds[k].hidden).map(([k, v]) => `  ${c(k.padEnd(10))} ${dim(v.desc)}`);
    out(`${bold('commands')}\n${rows.join('\n')}`);
  });
  add('about', 'who is this', () => out(cfg.about.join('\n')));
  add('links', 'where to find things', () => out(cfg.links.map((l) => `  ${c(l.name.padEnd(10))} ${l.url}`).join('\n')));
  add('pwd', 'print working directory', () => out('/' + state.cwd.join('/')));
  add('ls', 'list files', async (args) => {
    const target = resolvePath(state.cwd, args[0] || '.');
    const n = nodeAt(fs, target);
    if (n === undefined) return out(`ls: ${args[0]}: no such file or directory`);
    if (!isDir(n)) return out(args[0]);
    out(Object.entries(n).map(([k, v]) => (isDir(v) ? hex('#9ab8e8', k + '/') : k)).join('   '));
  });
  add('cd', 'change directory', (args) => {
    if (!args[0] || args[0] === '~') { state.cwd = []; return; }
    const p = resolvePath(state.cwd, args[0]);
    const n = nodeAt(fs, p);
    if (!isDir(n)) return out(`cd: ${args[0]}: not a directory`);
    state.cwd = p;
  });
  add('cat', 'show a file', async (args) => {
    if (!args[0]) return out('usage: cat <file>');
    const n = nodeAt(fs, resolvePath(state.cwd, args[0]));
    if (n === undefined) return out(`cat: ${args[0]}: no such file`);
    if (isDir(n)) return out(`cat: ${args[0]}: is a directory`);
    out(await n());
  });
  add('tree', 'show the file tree', () => {
    const walk = (n, pre = '') => Object.entries(n).flatMap(([k, v], i, a) => {
      const last = i === a.length - 1;
      const line = `${pre}${last ? '└── ' : '├── '}${isDir(v) ? hex('#9ab8e8', k) : k}`;
      return isDir(v) ? [line, ...walk(v, pre + (last ? '    ' : '│   '))] : [line];
    });
    out(['.', ...walk(fs)].join('\n'));
  });
  add('open', 'open a link or .url file', async (args) => {
    let target = args[0];
    if (!target) return out('usage: open <url | name.url | link name>');
    const n = nodeAt(fs, resolvePath(state.cwd, target));
    if (typeof n === 'function') target = (await n()).trim();
    else { const l = cfg.links.find((x) => x.name === target); if (l) target = l.url; }
    if (!/^https?:\/\//.test(target)) return out(`open: not a link: ${target}`);
    window.open(target, '_blank', 'noopener');
    out(`opening ${target}`);
  });
  add('media', 'open the public-domain art scroll', () => { out('loading /media ...'); setTimeout(() => (location.href = '/media'), 250); });

  add('quote', 'a quote, as ascii art', () => {
    const q = pickQuote();
    out(rainbow(figletRender(q.quote, 'Mini', Math.max(30, term.cols - 2)), Math.random() * 360) + `\n${dim('  - ' + q.author + (q.source ? ', ' + q.source : ''))}`);
  });
  add('figlet', 'figlet [-f font] text', (args) => {
    let font = 'Standard';
    if (args[0] === '-f') { font = args[1]; args = args.slice(2); }
    if (args[0] === '--fonts') return out(fontNames.join(', '));
    if (!args.length) return out(`usage: figlet [-f font] text   (fonts: ${fontNames.join(', ')})`);
    if (!fontNames.includes(font)) return out(`figlet: unknown font ${font}. try: ${fontNames.join(', ')}`);
    out(rainbow(figletRender(args.join(' '), font, term.cols - 2), Math.random() * 360));
  });
  add('lolcat', 'lolcat text', (args) => out(rainbow(args.join(' ') || 'lolcat: give me some text', Math.random() * 360)));
  add('cowsay', 'cowsay text', (args) => out(COW(args.join(' ') || 'moo')));
  add('echo', 'print text', (args) => out(args.join(' ')));

  add('date', 'current date and time', () => out(dayjs().format('dddd, MMMM D YYYY, h:mm:ss A') + dim('  ' + Intl.DateTimeFormat().resolvedOptions().timeZone)));
  add('cal', 'calendar for this month', () => {
    const now = dayjs(), first = now.startOf('month'), days = now.daysInMonth();
    const title = now.format('MMMM YYYY');
    let s = ' '.repeat(Math.max(0, Math.floor((20 - title.length) / 2))) + bold(title) + '\n' + dim('Su Mo Tu We Th Fr Sa') + '\n' + '   '.repeat(first.day());
    for (let d = 1; d <= days; d++) {
      const cell = String(d).padStart(2);
      s += d === now.date() ? `${ESC}7m${cell}${reset} ` : cell + ' ';
      if ((first.day() + d) % 7 === 0) s += '\n';
    }
    out(s);
  });
  add('weather', 'current weather (asks your browser for location)', async () => {
    let loc = savedLocation();
    if (!loc) { out(dim('asking your browser for a location (stays in your browser)...')); loc = await askLocation(); }
    const w = await fetchWeather(loc);
    out(`${c(w.temp + '°F')}  ${w.desc}${loc.label ? dim('  ' + loc.label) : ''}`);
  });
  add('moon', 'moon phase (approximate)', () => {
    const m = moonPhase();
    out(`${m.glyph}  ${m.name}  ${dim(`age ${m.age} days, about ${m.lit}% lit`)}`);
  });
  add('now', 'what is playing right now', async () => {
    const n = await fetchNowPlaying();
    out(n.state === 'playing' ? `${c('♫')} ${n.artist ?? ''} — ${n.title ?? ''}${n.album ? dim('  [' + n.album + ']') : ''}` : { idle: 'nothing playing right now', unset: 'not set up yet: edit nowPlaying in src/config.js', error: `music service unreachable (${n.error})` }[n.state]);
  });
  add('art', 'random public-domain artwork, as color ascii', async () => {
    out(dim('fetching from the Art Institute of Chicago public-domain set...'));
    const a = await randomArt();
    const cols = Math.min(term.cols - 2, 90);
    out(await imageToAnsi(a.thumb, cols));
    out(`${bold(a.title)}${a.artist ? ' — ' + a.artist : ''}${a.date ? dim('  ' + a.date) : ''}\n${a.url}`);
  });

  add('calc', 'calc 2*(3+4)^2', (args) => {
    if (!args.length) return out('usage: calc <expression>   e.g. calc sqrt(144) + 3^2');
    out(c(String(new Parser().evaluate(args.join(' ')))));
  });
  add('qr', 'qr <text or url>', (args) => {
    if (!args.length) return out('usage: qr <text>');
    out(qrAnsi(args.join(' ')));
  });
  add('hash', 'hash [sha-1|sha-256|sha-384|sha-512] text', async (args) => {
    let alg = 'SHA-256';
    if (/^sha-?(1|256|384|512)$/i.test(args[0] || '')) alg = args.shift().toUpperCase().replace(/^SHA(?=\d)/, 'SHA-');
    if (!args.length) return out('usage: hash [alg] <text>');
    out(hexOf(await crypto.subtle.digest(alg, new TextEncoder().encode(args.join(' ')))));
  });
  add('b64', 'b64 enc|dec text', (args) => {
    const mode = args.shift();
    if (!['enc', 'dec'].includes(mode) || !args.length) return out('usage: b64 enc|dec <text>');
    const text = args.join(' ');
    out(mode === 'enc' ? u8ToB64(new TextEncoder().encode(text)) : new TextDecoder().decode(Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0))));
  });
  add('uuid', 'new random UUID', () => out(crypto.randomUUID()));
  add('json', 'json <text> (pretty-print)', (args) => out(jsonColor(JSON.parse(args.join(' ')))));
  add('dice', 'dice 2d6', (args) => {
    const m = /^(\d{1,2})d(\d{1,3})$/.exec(args[0] || '1d6');
    if (!m) return out('usage: dice NdM   e.g. dice 2d6');
    const rolls = Array.from({ length: +m[1] }, () => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % +m[2]));
    out(`${rolls.join(' + ')} = ${c(String(rolls.reduce((a, b) => a + b, 0)))}`);
  });

  add('neofetch', 'about this browser', () => {
    const nav = navigator, conn = nav.connection;
    const rows = [
      ['host', location.host], ['agent', (nav.userAgentData?.brands?.find((b) => !/not/i.test(b.brand))?.brand) || nav.userAgent.split(' ').slice(-1)[0]],
      ['platform', nav.userAgentData?.platform || nav.platform || '?'], ['cpu cores', nav.hardwareConcurrency ?? '?'],
      ['memory', nav.deviceMemory ? `${nav.deviceMemory} GB+` : 'n/a'], ['screen', `${screen.width}x${screen.height} @${devicePixelRatio}x`],
      ['language', nav.language], ['network', conn?.effectiveType || 'n/a'], ['theme', currentTheme()], ['terminal', `${term.cols}x${term.rows}`],
    ];
    const art = rainbow(figletRender(cfg.name, 'Small', 40), 20).split('\n');
    const lines = rows.map(([k, v]) => `${c(k.padEnd(10))} ${v}`);
    const n = Math.max(art.length, lines.length);
    out(Array.from({ length: n }, (_, i) => `${art[i] || ''}${art[i] ? '  ' : ''}${lines[i] || ''}`).join('\n'));
  });
  add('uptime', 'time since this tab loaded', () => out(`up ${dayjs().diff(ctx.started, 'second')}s`));
  add('whoami', 'who are you', () => out('guest'));
  add('history', 'command history', () => out(ctx.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`).join('\n')));
  add('theme', 'theme dark|light', (args) => {
    const t = args[0] || (currentTheme() === 'dark' ? 'light' : 'dark');
    if (!['dark', 'light'].includes(t)) return out('usage: theme dark|light');
    setTheme(t); out(`theme: ${t}`);
  });
  add('clear', 'clear the screen', () => term.clear());
  add('confetti', 'party', () => { confetti({ particleCount: 140, spread: 80, origin: { y: 0.7 }, colors: ['#e08a6f', '#b5624c', '#e8c46a', '#9bc59a', '#9ab8e8'] }); out('\u{1F389}'); });
  add('matrix', 'digital rain (any key stops)', async () => {
    const { signal } = ctx.abort;
    term.write(`${ESC}?1049h${ESC}?25l`);
    const cols = term.cols, rows = term.rows, drops = Array.from({ length: cols }, () => Math.floor(Math.random() * rows));
    const glyphs = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ0123456789';
    while (!signal.aborted) {
      let frame = '';
      for (let x = 0; x < cols; x += 1) {
        if (Math.random() < 0.55) continue;
        const y = drops[x];
        if (y > 0) frame += `${ESC}${y};${x + 1}H${hex('#7a4636', glyphs[Math.floor(Math.random() * glyphs.length)])}`;
        frame += `${ESC}${y + 1};${x + 1}H${hex('#ffd9c9', glyphs[Math.floor(Math.random() * glyphs.length)])}`;
        drops[x] = y + 1 >= rows || Math.random() > 0.975 ? 0 : y + 1;
      }
      term.write(frame);
      await sleep(70, signal);
    }
    term.write(`${ESC}?25h${ESC}?1049l`);
  });
  add('sudo', 'nice try', () => out('guest is not in the sudoers file. this incident will be reported to no one.'));
  add('exit', 'leave', () => out('there is nowhere to go. try `media`.'));
  cmds.sudo.hidden = true; cmds.exit.hidden = true;
  return cmds;
}
