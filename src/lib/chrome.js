import dayjs from 'dayjs';
import { startNowPlaying } from './nowplaying.js';

// Wires the shared tmux-style top bar: clock + now listening.
export function initChrome() {
  const theme = (() => { try { return localStorage.getItem('theme'); } catch { return null; } })();
  if (theme) document.documentElement.dataset.theme = theme;

  const clock = document.getElementById('clock');
  const tick = () => { if (clock) clock.textContent = dayjs().format('ddd D MMM  HH:mm:ss'); };
  tick();
  setInterval(tick, 1000);

  const np = document.getElementById('np');
  if (np) startNowPlaying(np);
}

export function setTheme(name) {
  document.documentElement.dataset.theme = name;
  try { localStorage.setItem('theme', name); } catch {}
  window.dispatchEvent(new CustomEvent('themechange', { detail: name }));
}
export const currentTheme = () => document.documentElement.dataset.theme || 'dark';
