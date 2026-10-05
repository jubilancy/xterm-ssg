import cfg from '../config.js';

// Returns { state: 'playing'|'idle'|'unset'|'error', title, artist, album }.
export async function fetchNowPlaying() {
  const np = cfg.nowPlaying;
  try {
    if (np.provider === 'listenbrainz' && np.user) {
      const r = await fetch(`https://api.listenbrainz.org/1/user/${encodeURIComponent(np.user)}/playing-now`);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const listen = j?.payload?.listens?.[0];
      if (!listen) return { state: 'idle' };
      const m = listen.track_metadata || {};
      return { state: 'playing', title: m.track_name, artist: m.artist_name, album: m.release_name };
    }
    if (np.provider === 'lastfm' && np.user && np.lastfmApiKey) {
      const u = new URL('https://ws.audioscrobbler.com/2.0/');
      u.search = new URLSearchParams({
        method: 'user.getrecenttracks', user: np.user, api_key: np.lastfmApiKey, format: 'json', limit: '1',
      });
      const r = await fetch(u);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const raw = j?.recenttracks?.track;
      const t = Array.isArray(raw) ? raw[0] : raw;
      if (!t) return { state: 'idle' };
      const playing = t['@attr']?.nowplaying === 'true';
      return {
        state: playing ? 'playing' : 'idle',
        title: t.name, artist: t.artist?.['#text'], album: t.album?.['#text'],
      };
    }
    return { state: 'unset' };
  } catch (e) {
    return { state: 'error', error: e.message };
  }
}

export function startNowPlaying(el) {
  const render = (s) => {
    el.dataset.state = s.state;
    const label = el.querySelector('.np-text');
    if (s.state === 'playing') {
      label.textContent = `${s.artist ? s.artist + ' — ' : ''}${s.title ?? ''}`;
      el.title = [s.title, s.artist, s.album].filter(Boolean).join(' / ');
    } else {
      label.textContent = {
        idle: 'nothing playing right now',
        unset: 'not set up yet (see src/config.js)',
        error: 'could not reach the music service',
      }[s.state];
      el.title = '';
    }
  };
  const tick = () => fetchNowPlaying().then(render);
  tick();
  return setInterval(tick, Math.max(10, cfg.nowPlaying.pollSeconds) * 1000);
}
