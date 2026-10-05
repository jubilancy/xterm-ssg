// Public-domain / CC0 art from three museum APIs, normalised to one shape.
//   { id, source, title, artist, date, img, thumb, ratio, url, tags[], license }

const SEEDS = ['landscape', 'portrait', 'flowers', 'ship', 'cat', 'garden', 'sea', 'bird', 'horse', 'mountain', 'night', 'river', 'woman', 'tree', 'city', 'still life', 'moon', 'winter'];
export const SOURCES = {
  aic: { label: 'Art Institute of Chicago', short: 'aic', site: 'https://www.artic.edu', license: 'public domain' },
  met: { label: 'The Met', short: 'met', site: 'https://www.metmuseum.org', license: 'public domain' },
  cma: { label: 'Cleveland Museum of Art', short: 'cma', site: 'https://www.clevelandart.org', license: 'CC0' },
};

const clean = (arr) => [...new Set((arr || []).filter(Boolean).map((t) => String(t).toLowerCase().trim()))].filter((t) => t.length > 1 && t.length < 32);
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

// ---- Art Institute of Chicago -------------------------------------------------
const AIC_FIELDS = 'id,title,artist_title,date_display,image_id,thumbnail,term_titles,subject_titles,style_titles,classification_titles';

async function aic(state, q, size) {
  const p = new URLSearchParams({ limit: String(size), fields: AIC_FIELDS });
  if (q) p.set('q', q);
  p.set('query[term][is_public_domain]', 'true');
  if (state.page == null) state.page = q ? 1 : 1 + rnd(300);
  p.set('page', String(state.page++));
  const j = await getJson(`https://api.artic.edu/api/v1/artworks/search?${p}`);
  const iiif = j.config?.iiif_url || 'https://www.artic.edu/iiif/2';
  state.done = !j.data.length;
  return j.data
    .filter((d) => d.image_id)
    .map((d) => ({
      id: `aic-${d.id}`, source: 'aic', title: d.title || 'Untitled', artist: d.artist_title || '', date: d.date_display || '',
      img: `${iiif}/${d.image_id}/full/843,/0/default.jpg`,
      thumb: `${iiif}/${d.image_id}/full/400,/0/default.jpg`,
      ratio: d.thumbnail?.width && d.thumbnail?.height ? d.thumbnail.height / d.thumbnail.width : null,
      url: `https://www.artic.edu/artworks/${d.id}`,
      tags: clean([...(d.subject_titles || []), ...(d.style_titles || []), ...(d.classification_titles || []), ...(d.term_titles || [])]).slice(0, 5),
      license: SOURCES.aic.license,
    }));
}

// ---- The Met (v1.1 search is paginated; /v1/search retires 2026-10-01) ----------
async function met(state, q, size) {
  if (!state.term) state.term = q || pick(SEEDS);
  if (state.offset == null) state.offset = q ? 0 : rnd(600);
  const p = new URLSearchParams({ hasImages: 'true', q: state.term, offset: String(state.offset), limit: String(size) });
  const s = await getJson(`https://collectionapi.metmuseum.org/public/collection/v1.1/search?${p}`);
  const ids = s.objectIDs || [];
  state.offset += size;
  state.done = !ids.length || state.offset >= Math.min(s.total ?? 0, 10000);
  const objs = await Promise.all(ids.map((id) => getJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`).catch(() => null)));
  return objs
    .filter((o) => o && o.isPublicDomain && o.primaryImageSmall)
    .map((o) => ({
      id: `met-${o.objectID}`, source: 'met', title: o.title || 'Untitled', artist: o.artistDisplayName || o.culture || '',
      date: o.objectDate || '', img: o.primaryImageSmall, thumb: o.primaryImageSmall, ratio: null,
      url: o.objectURL || `https://www.metmuseum.org/art/collection/search/${o.objectID}`,
      tags: clean([...(o.tags || []).map((t) => t.term), o.classification, o.department, o.culture]).slice(0, 5),
      license: SOURCES.met.license,
    }));
}

// ---- Cleveland Museum of Art Open Access (CC0) ---------------------------------
async function cma(state, q, size) {
  if (state.skip == null) state.skip = q ? 0 : rnd(8000);
  const p = new URLSearchParams({
    has_image: '1', limit: String(size), skip: String(state.skip),
    fields: 'id,title,creators,creation_date,images,url,type,department,technique,culture,share_license_status',
  });
  if (q) p.set('q', q);
  state.skip += size;
  const j = await getJson(`https://openaccess-api.clevelandart.org/api/artworks/?cc0&${p}`);
  state.done = !j.data.length;
  return j.data
    .filter((d) => d.images?.web?.url)
    .map((d) => ({
      id: `cma-${d.id}`, source: 'cma', title: d.title || 'Untitled', artist: d.creators?.[0]?.description || '',
      date: d.creation_date || '', img: d.images.web.url, thumb: d.images.web.url,
      ratio: d.images.web.width && d.images.web.height ? Number(d.images.web.height) / Number(d.images.web.width) : null,
      url: d.url || `https://clevelandart.org/art/${d.id}`,
      tags: clean([d.type, d.department, ...(Array.isArray(d.culture) ? d.culture.map((c) => c.split(',')[0]) : []), d.technique?.split(';')[0]]).slice(0, 5),
      license: SOURCES.cma.license,
    }));
}

const LOADERS = { aic, met, cma };

export function createFeed({ q = '', sources = Object.keys(LOADERS), size = 12 } = {}) {
  const states = Object.fromEntries(sources.map((s) => [s, {}]));
  const status = Object.fromEntries(sources.map((s) => [s, { ok: 0, err: 0, last: '' }]));
  return {
    status,
    exhausted: () => sources.every((s) => states[s].done),
    async next() {
      const live = sources.filter((s) => !states[s].done);
      const batches = await Promise.all(
        live.map((s) =>
          LOADERS[s](states[s], q, size)
            .then((items) => { status[s].ok += items.length; status[s].last = ''; return items; })
            .catch((e) => { status[s].err += 1; status[s].last = e.message; states[s].fails = (states[s].fails || 0) + 1; if (states[s].fails >= 3) states[s].done = true; return []; }),
        ),
      );
      // interleave round-robin, then shuffle lightly so sources are mixed
      const out = [];
      const max = Math.max(0, ...batches.map((b) => b.length));
      for (let i = 0; i < max; i++) for (const b of batches) if (b[i]) out.push(b[i]);
      return out.sort(() => Math.random() - 0.5);
    },
  };
}

// One deterministic "art of the day" from the Art Institute (public-domain filter).
export async function artOfTheDay() {
  const day = Math.floor(Date.now() / 86400000);
  const p = new URLSearchParams({ limit: '1', page: String(1 + (day % 400)), fields: AIC_FIELDS });
  p.set('query[term][is_public_domain]', 'true');
  const j = await getJson(`https://api.artic.edu/api/v1/artworks/search?${p}`);
  const iiif = j.config?.iiif_url || 'https://www.artic.edu/iiif/2';
  const d = j.data.find((x) => x.image_id);
  if (!d) throw new Error('no image');
  return { title: d.title, artist: d.artist_title || '', date: d.date_display || '', url: `https://www.artic.edu/artworks/${d.id}`, thumb: `${iiif}/${d.image_id}/full/400,/0/default.jpg`, img: `${iiif}/${d.image_id}/full/843,/0/default.jpg` };
}

export async function randomArt() {
  const feed = createFeed({ sources: ['aic'], size: 10 });
  const items = await feed.next();
  if (!items.length) throw new Error('no artwork returned');
  return pick(items);
}
