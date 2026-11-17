// The look editor and recipe book: a local site for the looks in looks/<slug>/.
//   node tools/editor/server.mjs            starts it on http://127.0.0.1:4747/ and opens Chrome
//   node tools/editor/server.mjs --no-open  starts it without opening a browser
// Pages:  /                     the recipe book (every look, New / Rename / Delete)
//         /look/<slug>/edit     the editor for one look
//         /look/<slug>/         that look's sample page (add ?clean to hide the "Style:" labels)
// No dependencies. Binds to 127.0.0.1 only. Fournée is read from ../fournee (or FOURNEE_HOME), never changed.
import { createServer } from 'node:http';
import { readFile, writeFile, copyFile, rename, stat, readdir, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { join, dirname, resolve, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPACING_FIELDS, cleanSpacing } from './spacing.mjs';
import { buildLook, readSpacing, LOOKS, project } from '../build-look.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fournee = resolve(process.env.FOURNEE_HOME || join(project, '..', 'fournee'));
const DELETED = join(LOOKS, '_deleted');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 4747;

// The same scripts tools/check.mjs loads, in the same order; emit.js and the font files for the live preview;
// Fournée's default stylesheets for the recipe book page.
const FOURNEE_FILES = ['frosting/dist/tokens.js', 'frosting/src/readability.js', 'frosting/src/gallery.js', 'fontdant/dist/type-tokens.js',
  'fontdant/dist/library.js', 'fontdant/src/fontface.js', 'fontdant/src/typecheck.js', 'kitchen/src/store.js', 'kitchen/src/recipe.js',
  'kitchen/src/standards.js', 'kitchen/src/pass.js', 'fontdant/src/emit.js', 'frosting/dist/frosting.css', 'fontdant/dist/fontdant.css'];

if (!existsSync(join(fournee, 'kitchen', 'src', 'pass.js'))) {
  console.error(`Fournée not found at ${fournee}. Set FOURNEE_HOME to its folder.`); process.exit(1);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

// a path inside base, or null (no climbing out with ../)
function inside(base, rel) {
  const p = normalize(join(base, decodeURIComponent(rel)));
  return p === base || p.startsWith(base + sep) ? p : null;
}
async function sendFile(res, file) {
  try {
    const s = await stat(file); if (!s.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch { send(res, 404, 'Not found'); }
}
function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8');
function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((ok, fail) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { fail(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8'))); req.on('error', fail);
  });
}

// ── looks ─────────────────────────────────────────────────────────────────
const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/;
const slugify = (name) => String(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'look';
const cleanName = (n) => (typeof n === 'string' ? n.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 60) : '');
function lookDir(slug) { return SLUG.test(slug || '') && existsSync(join(LOOKS, slug, 'recipe.json')) ? join(LOOKS, slug) : null; }
// a look not built with Fournée: its own pages plus look.json { name, standalone: true, online, preview, fonts, colors }
function standaloneDir(slug) { return SLUG.test(slug || '') && !existsSync(join(LOOKS, slug, 'recipe.json')) && existsSync(join(LOOKS, slug, 'look.json')) ? join(LOOKS, slug) : null; }
// Fournée's font library, for display names (e.g. jetbrains-mono → JetBrains Mono)
const LIB = (() => { try { const sb = { window: {} }; sb.window = sb; vm.createContext(sb); vm.runInContext(readFileSync(join(fournee, 'fontdant', 'dist', 'library.js'), 'utf8'), sb); return sb.FontdantLibrary.fonts; } catch { return {}; } })();
const readJson = async (f, fb) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return fb; } };

async function listLooks() {
  const out = [];
  for (const slug of (await readdir(LOOKS)).sort()) {
    const sdir = standaloneDir(slug);
    if (sdir) {
      const j = await readJson(join(sdir, 'look.json'), null); if (!j) continue;
      out.push({ slug, standalone: true, name: cleanName(j.name) || slug, online: /^https:\/\//.test(j.online || '') ? j.online : null,
        preview: typeof j.preview === 'string' ? j.preview : 'index.html', fonts: j.fonts || {}, colors: j.colors || {},
        updated: (await stat(join(sdir, 'look.json'))).mtimeMs });
      continue;
    }
    const dir = lookDir(slug); if (!dir) continue;
    const r = await readJson(join(dir, 'recipe.json'), null); if (!r) continue;
    const fonts = (r.fontdant && r.fontdant.fonts) || {}, faces = (r.fontdant && r.fontdant.faces) || {};
    const fam = (id) => (fonts[id] && fonts[id].family) || (LIB[id] && LIB[id].family) || (id || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    out.push({ slug, name: r.name || slug, colors: (r.frosting && r.frosting.colors) || {},
      faces: { display: fam(faces.display), text: fam(faces.text), mono: fam(faces.mono) },
      updated: (await stat(join(dir, 'recipe.json'))).mtimeMs });
  }
  return out;
}
async function freeSlug(name) {
  const base = slugify(name); let s = base, n = 2;
  while (existsSync(join(LOOKS, s))) s = `${base}-${n++}`;
  return s;
}
function build(dir) {
  try { return { ok: true, log: buildLook(dir, fournee) }; }
  catch (e) { return { ok: false, log: String((e.stdout || '') + (e.stderr || '') || e.message) }; }
}
function validRecipe(r) {
  return r && typeof r === 'object' && r.frosting && typeof r.frosting.colors === 'object' && r.fontdant && typeof r.fontdant === 'object';
}
async function lookState(dir) {
  return { recipe: await readJson(join(dir, 'recipe.json'), null), spacing: readSpacing(dir), spacingFields: SPACING_FIELDS,
    hasPrev: existsSync(join(dir, 'recipe.prev.json')), accepted: await readJson(join(dir, 'accepted.json'), []) };
}

let busy = false;
async function exclusive(res, fn) {
  if (busy) return json(res, 409, { error: 'Still working on the last change, try again in a moment.' });
  busy = true; try { return await fn(); } finally { busy = false; }
}

const server = createServer(async (req, res) => {
  // only this machine, by this server's own name (blocks other sites' pages and DNS tricks)
  const okHost = [`${HOST}:${PORT}`, `localhost:${PORT}`];
  if (!okHost.includes(req.headers.host)) return send(res, 403, 'Forbidden');
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    if (origin && !okHost.map((h) => 'http://' + h).includes(origin)) return send(res, 403, 'Forbidden');
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  let path = url.pathname;
  // Addresses from before the recipe book (an editor tab left open from then) go to Plum Crumb
  if (/^\/api\/(save|revert|accepted)$/.test(path)) path = '/api/look/plum-crumb/' + path.slice(5);
  else if (path === '/api/recipe') path = '/api/look/plum-crumb';
  else if (path.startsWith('/site/')) path = '/look/plum-crumb/' + path.slice(6);
  try {
    if (req.method === 'GET') {
      if (path === '/' || path === '/index.html') return sendFile(res, join(here, 'book.html'));
      if (['/editor.js', '/editor.css', '/book.js'].includes(path)) return sendFile(res, join(here, path.slice(1)));
      if (path.startsWith('/fournee/')) {
        const rel = path.slice('/fournee/'.length);
        if (FOURNEE_FILES.includes(rel)) return sendFile(res, join(fournee, rel));
        if (rel.startsWith('fontdant/fonts/')) { const f = inside(join(fournee, 'fontdant', 'fonts'), rel.slice('fontdant/fonts/'.length)); return f ? sendFile(res, f) : send(res, 404, 'Not found'); }
        return send(res, 404, 'Not found');
      }
      if (path === '/api/looks') return json(res, 200, { looks: await listLooks() });
      let m = /^\/api\/look\/([^/]+)$/.exec(path);
      if (m) { const dir = lookDir(m[1]); return dir ? json(res, 200, await lookState(dir)) : json(res, 404, { error: 'No such look.' }); }
      m = /^\/look\/([^/]+)(\/.*)?$/.exec(path);
      if (m && standaloneDir(m[1])) {
        const rest = m[2] || '';
        if (rest === '') { res.writeHead(302, { Location: `/look/${m[1]}/` + url.search }); return res.end(); }
        const f = inside(standaloneDir(m[1]), rest === '/' ? 'index.html' : rest.slice(1));
        return f && extname(f) !== '.json' ? sendFile(res, f) : send(res, 404, 'Not found');
      }
      if (m) {
        const dir = lookDir(m[1]); if (!dir) return send(res, 404, 'No such look');
        const rest = m[2] || '';
        if (rest === '') { res.writeHead(302, { Location: `/look/${m[1]}/` + url.search }); return res.end(); }
        if (rest === '/' || rest === '/index.html') return sendFile(res, join(project, 'index.html'));
        if (rest === '/edit') return sendFile(res, join(here, 'editor.html'));
        if (rest.startsWith('/src/')) { const f = inside(join(dir, 'src'), rest.slice('/src/'.length)); return f ? sendFile(res, f) : send(res, 404, 'Not found'); }
        if (rest.startsWith('/assets/')) { const f = inside(join(dir, 'assets'), rest.slice('/assets/'.length)); return f ? sendFile(res, f) : send(res, 404, 'Not found'); }
      }
      return send(res, 404, 'Not found');
    }
    if (req.method !== 'POST') return send(res, 405, 'Method not allowed');
    const body = JSON.parse((await readBody(req)) || '{}');

    // recipe book actions
    if (path === '/api/looks/new') return await exclusive(res, async () => {
      const from = lookDir(body.from), name = cleanName(body.name);
      if (!from) return json(res, 400, { error: 'Pick a look to start from.' });
      if (!name) return json(res, 400, { error: 'Give the new look a name.' });
      const slug = await freeSlug(name), dir = join(LOOKS, slug);
      await mkdir(dir);
      for (const f of ['recipe.json', 'spacing.json', 'accepted.json']) if (existsSync(join(from, f))) await copyFile(join(from, f), join(dir, f));
      const r = await readJson(join(dir, 'recipe.json'), {}); r.name = name;
      await writeFile(join(dir, 'recipe.json'), JSON.stringify(r, null, 2) + '\n');
      const b = build(dir);
      console.log(`${new Date().toLocaleTimeString()} new look ${slug} from ${body.from}; build ${b.ok ? 'ok' : 'FAILED'}`);
      return json(res, b.ok ? 200 : 500, { ok: b.ok, slug, log: b.log, error: b.ok ? undefined : 'The new look was made but its build failed.' });
    });
    if (path === '/api/looks/rename') return await exclusive(res, async () => {
      const dir = lookDir(body.slug), name = cleanName(body.name);
      if (!dir) return json(res, 404, { error: 'No such look.' });
      if (!name) return json(res, 400, { error: 'Give the look a name.' });
      for (const f of ['recipe.json', 'recipe.prev.json']) {
        const p = join(dir, f); if (!existsSync(p)) continue;
        const r = await readJson(p, null); if (r) { r.name = name; await writeFile(p, JSON.stringify(r, null, 2) + '\n'); }
      }
      let slug = body.slug;
      if (slugify(name) !== slug) { slug = await freeSlug(name); await rename(dir, join(LOOKS, slug)); }
      const b = build(join(LOOKS, slug));
      console.log(`${new Date().toLocaleTimeString()} renamed ${body.slug} → ${slug}`);
      return json(res, 200, { ok: b.ok, slug });
    });
    if (path === '/api/looks/delete') return await exclusive(res, async () => {
      const dir = lookDir(body.slug);
      if (!dir) return json(res, 404, { error: 'No such look.' });
      await mkdir(DELETED, { recursive: true });
      const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;   // local time
      await rename(dir, join(DELETED, `${body.slug}-${stamp}`));
      console.log(`${new Date().toLocaleTimeString()} moved ${body.slug} to looks/_deleted/`);
      return json(res, 200, { ok: true });
    });

    // one look: save, revert, accepted warnings
    const m = /^\/api\/look\/([^/]+)\/(save|revert|accepted)$/.exec(path);
    const dir = m && lookDir(m[1]);
    if (!dir) return json(res, 404, { error: 'No such look.' });
    const RECIPE = join(dir, 'recipe.json'), PREV = join(dir, 'recipe.prev.json'), SP = join(dir, 'spacing.json'), SP_PREV = join(dir, 'spacing.prev.json');
    if (m[2] === 'accepted') {
      if (!Array.isArray(body) || !body.every((x) => typeof x === 'string' && x.length < 120)) return json(res, 400, { error: 'bad list' });
      await writeFile(join(dir, 'accepted.json'), JSON.stringify(body, null, 2) + '\n');
      return json(res, 200, { ok: true });
    }
    return await exclusive(res, async () => {
      if (m[2] === 'save') {
        const recipe = body && body.recipe;
        if (!validRecipe(recipe)) return json(res, 400, { error: 'That doesn’t look like a recipe.' });
        const current = await readJson(RECIPE, {});
        recipe.name = current.name || recipe.name;                      // the name is changed only by Rename in the recipe book
        await copyFile(RECIPE, PREV);                                    // one level of undo
        await writeFile(RECIPE, JSON.stringify(recipe, null, 2) + '\n');
        await writeFile(SP_PREV, JSON.stringify(readSpacing(dir), null, 2) + '\n');
        if (body.spacing) await writeFile(SP, JSON.stringify(cleanSpacing(body.spacing), null, 2) + '\n');
      } else {
        if (!existsSync(PREV)) return json(res, 400, { error: 'There is no previous version to go back to.' });
        const tmp = RECIPE + '.swap';                                    // swap, so Revert can itself be undone
        await rename(RECIPE, tmp); await rename(PREV, RECIPE); await rename(tmp, PREV);
        if (existsSync(SP_PREV)) { const now = readSpacing(dir); await rename(SP_PREV, SP); await writeFile(SP_PREV, JSON.stringify(now, null, 2) + '\n'); }
      }
      const b = build(dir);
      console.log(`${new Date().toLocaleTimeString()} ${m[1]} ${m[2] === 'save' ? 'saved' : 'reverted'}; build ${b.ok ? 'ok' : 'FAILED'}`);
      return json(res, b.ok ? 200 : 500, Object.assign({ ok: b.ok, log: b.log, error: b.ok ? undefined : 'The build failed. Details are below.' }, await lookState(dir)));
    });
  } catch (e) {
    console.error(e); json(res, 500, { error: String(e.message || e) });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is busy. Is the editor already running? Or start it with PORT=4748 node tools/editor/server.mjs`);
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`;
  console.log(`Recipe book: ${url}  (Ctrl+C to stop)`);
  // Opens in Google Chrome; falls back to the default browser if Chrome isn't installed.
  if (!process.argv.includes('--no-open') && process.platform === 'darwin') {
    spawn('open', ['-a', 'Google Chrome', url], { stdio: 'ignore' })
      .on('exit', (code) => { if (code) spawn('open', [url], { stdio: 'ignore', detached: true }).unref(); });
  }
});
