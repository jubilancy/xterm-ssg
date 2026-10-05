// Tiny ANSI helpers (24-bit colour) used by the terminal.
export const ESC = '\x1b[';
export const reset = `${ESC}0m`;
export const bold = (s) => `${ESC}1m${s}${reset}`;
export const dim = (s) => `${ESC}2m${s}${reset}`;
export const rgb = (r, g, b, s) => `${ESC}38;2;${r};${g};${b}m${s}${reset}`;
export const hex = (h, s) => {
  const n = parseInt(h.replace('#', ''), 16);
  return rgb((n >> 16) & 255, (n >> 8) & 255, n & 255, s);
};

export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// Colour a block of text with a diagonal rainbow. `shift` rotates the hue.
export function rainbow(text, shift = 0, sat = 72, light = 66) {
  return text
    .split('\n')
    .map((line, row) =>
      [...line]
        .map((ch, col) => {
          if (ch === ' ') return ch;
          const [r, g, b] = hsl(shift + col * 5 + row * 14, sat, light);
          return `${ESC}38;2;${r};${g};${b}m${ch}`;
        })
        .join('') + reset,
    )
    .join('\n');
}

export const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
export const visLen = (s) => [...stripAnsi(s)].length;

export function wrap(text, width) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if ((line + ' ' + word).trim().length > width) { out.push(line); line = word; }
      else line = (line + ' ' + word).trim();
    }
    out.push(line);
  }
  return out;
}
