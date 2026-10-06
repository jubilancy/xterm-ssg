import cfg from '../config.js';

const LB = 'https://api.listenbrainz.org/1/user';
const CACHE_KEY = 'np';

// GET json with a timeout and one retry (ListenBrainz has had load problems).
async function get(url, tries = 2) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(String(r.status));
      return await r.json();
    } catch (e) {
      err = e;
      if (i < tries - 1) await new Promise((res) => setTimeout(res, 1500));
    }
  }
  throw err;
}

const fromListen = (l) => {
  const m = l?.track_metadata || {};
  return { title: m.track_name, artist: m.artist_name, album: m.release_name, at: l?.listened_at };
};
const ago = (t) => {
  if (!t) return '';
  const m = Math.max(0, Math.round((Date.now() / 1000 - t) / 60));
  if (m < 2) return ' · just now';
  if (m < 60) return ` · ${m}m ago`;
  if (m < 1440) return ` · ${Math.round(m / 60)}h ago`;
  return ` · ${Math.round(m / 1440)}d ago`;
};

// Last good track is kept in this browser so a service hiccup still shows something.
const saveCache = (s) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...s, saved: Math.floor(Date.now() / 1000) })); } catch {} };
const loadCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; } };

async function fetchFresh(np) {
  if (np.provider === 'listenbrainz' && np.user) {
    const user = encodeURIComponent(np.user);
    const now = (await get(`${LB}/${user}/playing-now`))?.payload?.listens?.[0];
    if (now) return { state: 'playing', ...fromListen(now) };
    // Nothing is being "played now": fall back to the most recent listen.
    const last = (await get(`${LB}/${user}/listens?count=1`))?.payload?.listens?.[0];
    if (last) return { state: 'last', ...fromListen(last) };
    return { state: 'idle' };
  }
  if (np.provider === 'lastfm' && np.user && np.lastfmApiKey) {
    const u = new URL('https://ws.audioscrobbler.com/2.0/');
    u.search = new URLSearchParams({
      method: 'user.getrecenttracks', user: np.user, api_key: np.lastfmApiKey, format: 'json', limit: '1',
    });
    const raw = (await get(u))?.recenttracks?.track;
    const t = Array.isArray(raw) ? raw[0] : raw;
    if (!t) return { state: 'idle' };
    const playing = t['@attr']?.nowplaying === 'true';
    return {
      state: playing ? 'playing' : 'last',
      title: t.name, artist: t.artist?.['#text'], album: t.album?.['#text'], at: Number(t.date?.uts) || undefined,
    };
  }
  return { state: 'unset' };
}

// Returns { state: 'playing'|'last'|'idle'|'unset'|'error', title, artist, album, at, stale }.
export async function fetchNowPlaying() {
  const np = cfg.nowPlaying;
  try {
    const s = await fetchFresh(np);
    if (s.state === 'playing' || s.state === 'last') saveCache(s);
    return s;
  } catch (e) {
    const c = loadCache();
    // Service down: show the last track we saw, marked stale, instead of an error.
    if (c && (c.title || c.artist)) return { ...c, state: 'last', at: c.at || c.saved, stale: true };
    return { state: 'error', error: e.message };
  }
}

export function startNowPlaying(el) {
  const label = el.querySelector('.np-text');
  const lead = label.previousElementSibling; // the "now listening:" span
  const render = (s) => {
    el.dataset.state = s.state === 'last' ? 'idle' : s.state;
    if (lead) lead.textContent = s.state === 'last' ? 'last played:' : 'now listening:';
    if (s.state === 'playing' || s.state === 'last') {
      label.textContent = `${s.artist ? s.artist + ' — ' : ''}${s.title ?? ''}${s.state === 'last' ? ago(s.at) : ''}`;
      el.title = [s.title, s.artist, s.album].filter(Boolean).join(' / ') + (s.stale ? ' (ListenBrainz unreachable, showing last known)' : '');
    } else {
      label.textContent = {
        idle: 'nothing playing right now',
        unset: 'not set up yet (see src/config.js)',
        error: 'music service is busy, retrying...',
      }[s.state];
      el.title = s.error || '';
    }
  };
  const tick = () => fetchNowPlaying().then(render).catch(() => render({ state: 'error' }));
  tick();
  return setInterval(tick, Math.max(10, cfg.nowPlaying.pollSeconds) * 1000);
}
