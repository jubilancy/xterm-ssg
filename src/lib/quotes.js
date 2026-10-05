import quotes from '../data/quotes.json';

// A different quote on each load: pick at random, but never the one shown last time.
export function pickQuote() {
  let last = -1;
  try { last = Number(localStorage.getItem('lastQuote')); } catch {}
  let i;
  do { i = Math.floor(Math.random() * quotes.length); } while (quotes.length > 1 && i === last);
  try { localStorage.setItem('lastQuote', String(i)); } catch {}
  return quotes[i];
}
export { quotes };
