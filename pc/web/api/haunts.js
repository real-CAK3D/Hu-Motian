// Shared haunts: a ghost one hunter finds is saved here, so anyone else who walks into its area meets the
// same ghost. Stored in Vercel Blob, one small file per ghost, grouped into ~1 km map squares so a phone only
// lists the squares around it. The file name carries the ghost's position, so the list alone says which ones
// are close; only those get read. A catch is a second, tiny file next to it.
//
//   GET  /api/haunts?lat=..&lon=..              ghosts within 500 m, and which ones in the area were caught
//   POST /api/haunts {ghost, hunter}             share a ghost you found
//   POST /api/haunts {caught: id, lat, lon, hunter}   you caught a shared ghost; it's gone for everyone
import { list, put } from '@vercel/blob';

const TYPES = ['residual', 'orbs', 'mist', 'shadow', 'wanderer', 'child', 'guide', 'bride', 'poltergeist', 'stalker', 'hatman',
  'wraith', 'revenant', 'banshee', 'hound', 'trickster', 'doppel', 'inhuman'];
const RADIUS = 500, MAX_PER_SQUARE = 60, MAX_RETURNED = 30;
const ID = /^[a-z0-9]{6,24}$/;

const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const square = (lat, lon, dy = 0, dx = 0) => `${Math.floor(lat * 100) + dy}_${Math.floor(lon * 100) + dx}`;
const dir = sq => `haunts/v1/${sq}/`;
function metres(la1, lo1, la2, lo2) {
  const R = 6371000, r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
// g_<lat>_<lon>_<id>.json is a ghost; x_<id>.json says it was caught
function parse(pathname) {
  const f = pathname.split('/').pop().replace(/\.json$/, '').split('_');
  if (f[0] === 'g' && f.length === 4) return { kind: 'g', lat: +f[1], lon: +f[2], id: f[3] };
  if (f[0] === 'x' && f.length === 2) return { kind: 'x', id: f[1] };
  return null;
}
async function listSquare(store, sq) {
  const out = []; let cursor;
  do { const r = await store.list({ prefix: dir(sq), limit: 1000, cursor }); out.push(...r.blobs); cursor = r.hasMore ? r.cursor : null; } while (cursor && out.length < 3000);
  return out;
}
// what gets stored and handed out: the ghost as found, nothing about the finder but the name they chose
function clean(g, hunter) {
  const lat = num(g?.home?.lat, -90, 90), lon = num(g?.home?.lon, -180, 180);
  if (!g || !ID.test(g.id || '') || !TYPES.includes(g.type) || lat == null || lon == null) return null;
  const level = num(g.level, 1, 10), anger = num(g.anger, 0, 100), hp = num(g.hp, .1, 20);
  return { id: g.id, type: g.type, name: text(g.name, 40) || 'Unknown entity', story: text(g.story, 200), level: level ?? 1, anger: anger ?? 20,
    hp: hp ?? 1, home: { lat: +lat.toFixed(6), lon: +lon.toFixed(6), r: num(g.home.r, 5, 25) ?? 12 }, finder: text(hunter, 24) || 'a hunter', foundAt: Date.now() };
}

export function makeHandler(store) {
  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');  // the GitHub Pages copy of the app uses this too
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    try {
      if (req.method === 'GET') {
        const lat = num(req.query.lat, -90, 90), lon = num(req.query.lon, -180, 180);
        if (lat == null || lon == null) return res.status(400).json({ error: 'lat and lon are required' });
        const sqs = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sqs.push(square(lat, lon, dy, dx));
        const blobs = (await Promise.all(sqs.map(sq => listSquare(store, sq)))).flat();
        const caught = new Map(), near = [];
        for (const b of blobs) { const p = parse(b.pathname); if (!p) continue; if (p.kind === 'x') caught.set(p.id, b); else { const d = metres(lat, lon, p.lat, p.lon); if (d <= RADIUS) near.push({ ...p, d, url: b.url }) } }
        const pick = near.filter(p => !caught.has(p.id)).sort((a, b) => a.d - b.d).slice(0, MAX_RETURNED);
        const read = async url => { try { const r = await fetch(url); return r.ok ? await r.json() : null } catch { return null } };
        const haunts = (await Promise.all(pick.map(p => read(p.url)))).filter(Boolean);
        const gone = await Promise.all([...caught.values()].slice(0, 60).map(async b => ({ id: parse(b.pathname).id, ...(await read(b.url) || {}) })));
        return res.status(200).json({ haunts, caught: gone.map(c => ({ id: c.id, by: text(c.by, 24) || 'another hunter', at: c.at || null })) });
      }
      if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
        if (JSON.stringify(body).length > 4000) return res.status(413).json({ error: 'too big' });
        if (body.caught) {
          const id = String(body.caught), lat = num(body.lat, -90, 90), lon = num(body.lon, -180, 180);
          if (!ID.test(id) || lat == null || lon == null) return res.status(400).json({ error: 'bad catch' });
          const sq = square(lat, lon), here = (await listSquare(store, sq)).some(b => { const p = parse(b.pathname); return p && p.kind === 'g' && p.id === id });
          if (!here) return res.status(404).json({ error: 'no such shared ghost there' });
          await store.put(`${dir(sq)}x_${id}.json`, JSON.stringify({ by: text(body.hunter, 24) || 'a hunter', at: Date.now() }),
            { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 });
          return res.status(200).json({ ok: true });
        }
        const g = clean(body.ghost, body.hunter);
        if (!g) return res.status(400).json({ error: 'bad ghost' });
        const sq = square(g.home.lat, g.home.lon), have = await listSquare(store, sq);
        if (have.some(b => { const p = parse(b.pathname); return p && p.id === g.id })) return res.status(200).json({ ok: true, already: true });
        if (have.filter(b => parse(b.pathname)?.kind === 'g').length >= MAX_PER_SQUARE) return res.status(429).json({ error: 'this area is full of ghosts already' });
        await store.put(`${dir(sq)}g_${g.home.lat.toFixed(5)}_${g.home.lon.toFixed(5)}_${g.id}.json`, JSON.stringify(g),
          { access: 'public', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json', cacheControlMaxAge: 3600 });
        return res.status(200).json({ ok: true });
      }
      return res.status(405).json({ error: 'GET or POST' });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'storage error' });
    }
  };
}
export default makeHandler({ list, put });
