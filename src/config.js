// Everything you are likely to edit lives here.
export default {
  name: 'el',
  tagline: 'student and indie web builder',

  // Shown by `about` and `cat about.txt`. Edit freely.
  about: [
    'el. student and indie web builder.',
    'builds small sites and tools, mostly in the browser.',
    'type `help` to see what this terminal can do.',
  ],

  // Shown by `links` and the `projects/` folder. Check these before you ship.
  links: [
    { name: 'glosse.me', url: 'https://glosse.me' },
    { name: 'stacks', url: 'https://stacks.glosse.me' },
    { name: 'eliana.lol', url: 'https://eliana.lol' },
    { name: 'feed', url: 'https://feed.eliana.lol' },
    { name: 'gallery', url: 'https://gallery.eliana.lol' },
    { name: 'obscura', url: 'https://obscura.eliana.lol' },
    { name: 'tools', url: 'https://tools.eliana.lol' },
    { name: 'bluesky', url: 'https://bsky.app/profile/basedgirl.bsky.social' },
    { name: 'github', url: 'https://github.com/jubilancy' },
  ],

  // Top-middle "now listening" bar.
  // provider: 'listenbrainz' (no key needed, just your username) or 'lastfm' (needs a free API key).
  // Leave user empty and the bar says it is not set up.
  nowPlaying: {
    provider: 'listenbrainz',
    user: '',
    lastfmApiKey: '',
    pollSeconds: 30,
  },

  // Weather widget. Leave null and the widget asks the visitor's browser for their own location
  // (kept only in their browser). Put numbers here only if you want a fixed location published in the page source.
  location: null, // e.g. { lat: 40.71, lon: -74.0, label: 'new york' }
};
