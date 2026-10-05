import cfg from '../config.js';

const LB = 'https://api.listenbrainz.org/1/user';
const get = (url) => fetch(url, { signal: AbortSignal.timeout(8000) }).then((r) => {
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
});
const fromListen = (l) => {
  const m = l?.track_metadata || {};
  return { title: m.track_name, artist: m.artist_name, album: m.release_name };
};

// Returns { state: 'playing'|'last'|'idle'|'unset'|'error', title, artist, album }.
export async function fetchNowPlaying() {
  const np = cfg.nowPlaying;
  try {
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
        title: t.name, artist: t.artist?.['#text'], album: t.album?.['#text'],
      };
    }
    return { state: 'unset' };
  } catch (e) {
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
      label.textContent = `${s.artist ? s.artist + ' — ' : ''}${s.title ?? ''}`;
      el.title = [s.title, s.artist, s.album].filter(Boolean).join(' / ');
    } else {
      label.textContent = {
        idle: 'nothing playing right now',
        unset: 'not set up yet (see src/config.js)',
        error: 'could not reach the music service',
      }[s.state];
      el.title = s.error || '';
    }
  };
  const tick = () => fetchNowPlaying().then(render).catch(() => render({ state: 'error' }));
  tick();
  return setInterval(tick, Math.max(10, cfg.nowPlaying.pollSeconds) * 1000);
}
