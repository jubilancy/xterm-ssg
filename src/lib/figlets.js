import figlet from 'figlet';
import Standard from 'figlet/importable-fonts/Standard.js';
import Small from 'figlet/importable-fonts/Small.js';
import Straight from 'figlet/importable-fonts/Straight.js';
import Mini from 'figlet/importable-fonts/Mini.js';
import Big from 'figlet/importable-fonts/Big.js';
import Slant from 'figlet/importable-fonts/Slant.js';
import Rounded from 'figlet/importable-fonts/Rounded.js';
import Bloody from 'figlet/importable-fonts/Bloody.js';
import Ogre from 'figlet/importable-fonts/Ogre.js';
import Rectangles from 'figlet/importable-fonts/Rectangles.js';
import AnsiShadow from 'figlet/importable-fonts/ANSI Shadow.js';

const FONTS = { Standard, Small, Straight, Mini, Big, Slant, Rounded, Bloody, Ogre, Rectangles, 'ANSI Shadow': AnsiShadow };
for (const [name, data] of Object.entries(FONTS)) figlet.parseFont(name, data);

export const fontNames = Object.keys(FONTS);

export function render(text, font = 'Standard', width = 80) {
  return figlet.textSync(text, { font, width, whitespaceBreak: true }).replace(/\s+$/g, '');
}

// Largest font (from big to small) whose wrapped output fits in maxRows.
export function fitBanner(text, cols, maxRows) {
  for (const font of ['Standard', 'Small', 'Straight', 'Mini']) {
    const out = render(text, font, cols - 2);
    const rows = out.split('\n').length;
    if (rows <= maxRows) return { font, out };
  }
  return null;
}
