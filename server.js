'use strict';

/**
 * Pilates-Studio Website + Adminbereich
 * Zero-dependency Node.js app (nur Boardmittel: http, crypto, fs, node:sqlite).
 * Läuft auf Node 22+ (eingebautes node:sqlite).
 *
 * ENV:
 *   PORT            - Port (Railway setzt das automatisch)
 *   ADMIN_PASSWORD  - Passwort für den Adminbereich (Default: "admin" -> bitte ändern!)
 *   SESSION_SECRET  - Secret für Session-Cookies
 *   DATA_DIR        - Ordner für die SQLite-Datei (Default: ./data). Auf Railway ein Volume mounten!
 *   SITE_TITLE      - Optionaler Default-Seitentitel beim ersten Start
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(16).toString('hex');
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

if (ADMIN_PASSWORD === 'admin') {
  console.warn('[WARN] ADMIN_PASSWORD ist nicht gesetzt – Default "admin" wird verwendet. Bitte in Railway setzen!');
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'site.db');
const db = new DatabaseSync(DB_PATH);
try { db.exec('PRAGMA journal_mode = WAL;'); } catch (e) { console.warn('[WARN] WAL nicht verfügbar, nutze Default-Journal.'); }

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS pages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  nav_label   TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  in_nav      INTEGER NOT NULL DEFAULT 1,
  published   INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sections (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id   INTEGER NOT NULL,
  type      TEXT NOT NULL DEFAULT 'text',
  heading   TEXT,
  subheading TEXT,
  body      TEXT,
  image_id  INTEGER,
  image_url TEXT,
  position  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS termine (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  day         TEXT,
  time        TEXT,
  level       TEXT,
  description TEXT,
  position    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS media (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mime       TEXT,
  data       BLOB,
  created_at TEXT
);
`);

// ---------------------------------------------------------------------------
// Settings helper
// ---------------------------------------------------------------------------
function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value == null ? '' : value));
}

// ---------------------------------------------------------------------------
// Seed (nur beim allerersten Start)
// ---------------------------------------------------------------------------
function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM pages').get().c;
  if (count > 0) return;
  console.log('[seed] Lege Demo-Inhalte an …');

  setSetting('site_title', process.env.SITE_TITLE || 'shine studio');
  setSetting('site_subtitle', 'Reformer Pilates');
  setSetting('accent', '#a8876b');
  setSetting('accent2', '#8a9a82');
  setSetting('instagram', 'https://instagram.com');
  setSetting('email', 'hallo@shinestudio.example');
  setSetting('phone', '+41 00 000 00 00');
  setSetting('address', 'Musterstrasse 1, 5610 Wohlen AG');
  setSetting('footer_text', '© ' + new Date().getFullYear() + ' shine studio · Reformer Pilates');

  const insPage = db.prepare('INSERT INTO pages(slug, title, nav_label, position, in_nav, published) VALUES(?,?,?,?,?,?)');
  const insSec = db.prepare('INSERT INTO sections(page_id, type, heading, subheading, body, image_url, position) VALUES(?,?,?,?,?,?,?)');

  // HOME
  const home = insPage.run('home', 'Home', 'Home', 0, 1, 1).lastInsertRowid;
  insSec.run(home, 'hero', 'shine studio',
    'Reformer Pilates · Dein Raum für Stärke, Ruhe & innere Balance',
    'Kleine Gruppen · Persönliche Begleitung · Zeit nur für dich',
    'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1600&q=80', 0);
  insSec.run(home, 'text', 'Was ist Reformer Pilates?', '',
    'Reformer Pilates verbindet effektives Ganzkörpertraining mit kontrollierten, gelenkschonenden Bewegungen. Es stärkt die Tiefenmuskulatur, verbessert die Haltung und fördert Balance, Kraft und Beweglichkeit – für einen starken Körper und einen klaren Kopf.\n\nBei uns geht es dabei nicht nur um Bewegung, sondern auch um bewusste Me-Time – eine Auszeit nur für dich und deinen Körper.',
    'https://images.unsplash.com/photo-1599447421416-3414500d18a5?auto=format&fit=crop&w=1200&q=80', 1);
  insSec.run(home, 'features', 'Warum bei uns trainieren?', '',
    'Kleine Gruppen|In Gruppen von max. 6 Personen bekommst du echte, persönliche Aufmerksamkeit.\nPersönliche Begleitung|Jede Übung wird auf dein Niveau und deine Ziele abgestimmt.\nBewusste Stärke|Wir verbinden Kraft und Achtsamkeit – für Körper und Kopf.',
    '', 2);

  // TERMINE
  const termine = insPage.run('termine', 'Termine', 'Termine', 1, 1, 1).lastInsertRowid;
  insSec.run(termine, 'text', 'Termine & Kurse', '',
    'Hier findest du unser aktuelles Kursangebot. Melde dich gerne über das Kontaktformular oder per Nachricht für deinen Wunschtermin an.', '', 0);
  insSec.run(termine, 'termine', '', '', '', '', 1);

  const insT = db.prepare('INSERT INTO termine(title, day, time, level, description, position) VALUES(?,?,?,?,?,?)');
  insT.run('Reformer Flow', 'Montag', '09:00 – 10:00', 'Alle Level', 'Fliessendes Ganzkörpertraining für einen energievollen Wochenstart.', 0);
  insT.run('Reformer Basics', 'Dienstag', '18:30 – 19:30', 'Einsteiger', 'Die Grundlagen der Shine Method – ideal für den Einstieg.', 1);
  insT.run('Core & Balance', 'Donnerstag', '07:00 – 08:00', 'Fortgeschritten', 'Fokus auf Tiefenmuskulatur, Stabilität und Balance.', 2);
  insT.run('Slow Flow', 'Samstag', '10:00 – 11:00', 'Alle Level', 'Bewusste, ruhige Bewegungen – Zeit nur für dich.', 3);

  // ÜBER MICH
  const ueber = insPage.run('ueber-mich', 'Über mich', 'Über mich', 2, 1, 1).lastInsertRowid;
  insSec.run(ueber, 'text', 'Über mich', 'By Lorena',
    'Ich bin zertifizierte Reformer-Pilates-Trainerin und habe mein Studio aus einer einfachen Überzeugung gegründet: Bewegung darf sich gut anfühlen.\n\nIn meinen Stunden verbinde ich präzise Technik mit einer warmen, persönlichen Atmosphäre. Mir ist wichtig, dass du dich gesehen fühlst – und dass du nach jeder Stunde stärker und klarer gehst, als du gekommen bist.',
    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1200&q=80', 0);

  // KONTAKT
  const kontakt = insPage.run('kontakt', 'Kontakt', 'Kontakt', 3, 1, 1).lastInsertRowid;
  insSec.run(kontakt, 'text', 'Kontakt', '',
    'Du hast Fragen oder möchtest dich für eine Stunde anmelden? Schreib mir – ich freue mich auf dich.', '', 0);
  insSec.run(kontakt, 'contact', '', '', '', '', 1);
}
seed();

// ---------------------------------------------------------------------------
// Sessions (in-memory) + CSRF
// ---------------------------------------------------------------------------
const sessions = new Map(); // sid -> { authed: bool, csrf: string, flash: string }

function newSid() { return crypto.randomBytes(24).toString('hex'); }
function signCookie(sid) {
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(sid).digest('hex').slice(0, 24);
  return sid + '.' + sig;
}
function verifyCookie(value) {
  if (!value || value.indexOf('.') < 0) return null;
  const [sid, sig] = value.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(sid).digest('hex').slice(0, 24);
  if (sig && expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return sid;
  return null;
}
function getSession(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  let sid = verifyCookie(cookies.sid);
  if (!sid || !sessions.has(sid)) {
    sid = newSid();
    sessions.set(sid, { authed: false, csrf: crypto.randomBytes(16).toString('hex'), flash: '' });
    const secure = (req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';
    res.setHeader('Set-Cookie', `sid=${signCookie(sid)}; HttpOnly; SameSite=Lax; Path=/${secure}`);
  }
  return sessions.get(sid);
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
function parseCookies(str) {
  const out = {};
  str.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
function paragraphs(s) {
  return String(s || '').split(/\n\s*\n/).map(p => `<p>${nl2br(p)}</p>`).join('\n');
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => { size += c.length; if (size < 25 * 1024 * 1024) chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}
function parseUrlencoded(buf) {
  const out = {};
  const params = new URLSearchParams(buf.toString('utf8'));
  for (const [k, v] of params) out[k] = v;
  return out;
}
// Minimaler multipart/form-data Parser: liefert { fields:{}, files:{name:{filename,mime,data}} }
function parseMultipart(buf, boundary) {
  const fields = {}, files = {};
  const bnd = Buffer.from('--' + boundary);
  let start = buf.indexOf(bnd);
  if (start < 0) return { fields, files };
  start += bnd.length;
  while (true) {
    if (buf.slice(start, start + 2).toString() === '--') break; // closing boundary
    start += 2; // CRLF after boundary
    const headerEnd = buf.indexOf('\r\n\r\n', start);
    if (headerEnd < 0) break;
    const header = buf.slice(start, headerEnd).toString('utf8');
    const dataStart = headerEnd + 4;
    const next = buf.indexOf(bnd, dataStart);
    if (next < 0) break;
    let data = buf.slice(dataStart, next - 2); // strip trailing CRLF
    const nameM = /name="([^"]*)"/i.exec(header);
    const fileM = /filename="([^"]*)"/i.exec(header);
    const typeM = /Content-Type:\s*([^\r\n]+)/i.exec(header);
    const name = nameM ? nameM[1] : null;
    if (name) {
      if (fileM && fileM[1]) {
        files[name] = { filename: fileM[1], mime: typeM ? typeM[1].trim() : 'application/octet-stream', data };
      } else {
        fields[name] = data.toString('utf8');
      }
    }
    start = next + bnd.length;
  }
  return { fields, files };
}
async function parseRequest(req) {
  const buf = await readBody(req);
  const ct = req.headers['content-type'] || '';
  if (ct.indexOf('multipart/form-data') === 0 || ct.indexOf('multipart/form-data') > -1) {
    const m = /boundary=(.+)$/i.exec(ct);
    if (m) return parseMultipart(buf, m[1].trim().replace(/^"|"$/g, ''));
    return { fields: {}, files: {} };
  }
  return { fields: parseUrlencoded(buf), files: {} };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, headers));
  res.end(body);
}
function redirect(res, location) { res.writeHead(302, { Location: location }); res.end(); }

function saveMedia(file) {
  if (!file || !file.data || !file.data.length) return null;
  if (!/^image\//.test(file.mime)) return null;
  const r = db.prepare('INSERT INTO media(mime, data, created_at) VALUES(?,?,?)')
    .run(file.mime, file.data, new Date().toISOString());
  return r.lastInsertRowid;
}
function imageSrc(section) {
  if (section.image_id) return '/media/' + section.image_id;
  if (section.image_url) return section.image_url;
  return '';
}

// Statische Dateien aus ./public: Cookie-Banner (FS Consent) + lokal gehostete Schriften
const PUBLIC_DIR = path.join(__dirname, 'public');
const STATIC_TYPES = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2' };
function serveStatic(p, res) {
  if (p !== '/fs-consent.js' && p !== '/fs-consent.css' && !p.startsWith('/fonts/')) return false;
  const file = path.join(PUBLIC_DIR, p);
  const type = STATIC_TYPES[path.extname(file)];
  if (!type || !file.startsWith(PUBLIC_DIR + path.sep)) return false;
  let data;
  try { data = fs.readFileSync(file); } catch (e) { return false; }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' });
  res.end(data);
  return true;
}

// ---------------------------------------------------------------------------
// Daten-Helfer
// ---------------------------------------------------------------------------
const Q = {
  navPages: () => db.prepare('SELECT * FROM pages WHERE published=1 AND in_nav=1 ORDER BY position, id').all(),
  allPages: () => db.prepare('SELECT * FROM pages ORDER BY position, id').all(),
  pageBySlug: (s) => db.prepare('SELECT * FROM pages WHERE slug=?').get(s),
  pageById: (id) => db.prepare('SELECT * FROM pages WHERE id=?').get(id),
  sections: (pid) => db.prepare('SELECT * FROM sections WHERE page_id=? ORDER BY position, id').all(pid),
  section: (id) => db.prepare('SELECT * FROM sections WHERE id=?').get(id),
  termine: () => db.prepare('SELECT * FROM termine ORDER BY position, id').all(),
  termin: (id) => db.prepare('SELECT * FROM termine WHERE id=?').get(id),
};

// ===========================================================================
// FRONTEND-RENDERING
// ===========================================================================
function publicLayout(title, content, activeSlug) {
  const accent = getSetting('accent', '#a8876b');
  const accent2 = getSetting('accent2', '#8a9a82');
  const siteTitle = getSetting('site_title', 'shine studio');
  const nav = Q.navPages().map(p =>
    `<a href="/${p.slug === 'home' ? '' : p.slug}" class="${p.slug === activeSlug ? 'active' : ''}">${esc(p.nav_label)}</a>`
  ).join('');
  const footer = esc(getSetting('footer_text', '© ' + new Date().getFullYear()));
  const ig = getSetting('instagram', '');
  // Cookie-Banner (FS Consent): Info-Modus, Datenschutz/Impressum nur verlinken, wenn die Seiten existieren
  const legal = (slugs) => { const pg = slugs.map(Q.pageBySlug).find(x => x && x.published); return pg ? '/' + pg.slug : false; };
  const consentConfig = {
    privacyUrl: legal(['datenschutz', 'datenschutzerklaerung']),
    imprintUrl: legal(['impressum']),
    tone: 'du',
    position: 'bottom-left',
    categories: {},
    texts: { infoText: 'Diese Website verwendet ausschließlich technisch notwendige Cookies bzw. lokalen Speicher. Es werden keine Daten zu Werbe- oder Analysezwecken erhoben.' }
  };
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(siteTitle)}</title>
<meta name="description" content="Reformer Pilates – Kleine Gruppen, persönliche Betreuung und bewusste Stärke.">
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/fs-consent.css">
<script type="application/json" id="fs-consent-config">${JSON.stringify(consentConfig).replace(/</g, '\\u003c')}</script>
<style>
:root{--accent:${accent};--accent2:${accent2};--bg:#faf7f2;--bg2:#f1ebe2;--ink:#3b3631;--muted:#7a726a;}
/* Cookie-Banner (FS Consent) im Design der Seite */
:root{--fsc-bg:#faf7f2;--fsc-fg:#3b3631;--fsc-muted:#544c45;--fsc-accent:color-mix(in srgb,var(--accent) 75%,#000);--fsc-accent-fg:#fff;
  --fsc-border:#ece4d8;--fsc-radius:6px;--fsc-btn-radius:0;--fsc-font:'Jost',system-ui,sans-serif;--fsc-heading-font:'Cormorant Garamond',serif;
  --fsc-heading-weight:500;--fsc-btn-transform:uppercase;--fsc-btn-spacing:.16em;--fsc-btn-weight:400;--fsc-shadow:0 18px 50px rgba(60,50,40,.18)}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:'Jost',system-ui,sans-serif;color:var(--ink);background:var(--bg);line-height:1.7;font-weight:300}
h1,h2,h3{font-family:'Cormorant Garamond',serif;font-weight:500;line-height:1.15;letter-spacing:.01em}
a{color:inherit;text-decoration:none}
img{max-width:100%;display:block}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
/* header */
header{position:sticky;top:0;z-index:50;background:rgba(250,247,242,.92);backdrop-filter:blur(8px);border-bottom:1px solid #ece4d8}
.bar{display:flex;align-items:center;justify-content:space-between;height:74px}
.brand{font-family:'Cormorant Garamond',serif;font-size:26px;letter-spacing:.12em;text-transform:lowercase;color:var(--ink)}
nav{display:flex;gap:30px}
nav a{font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);transition:color .2s}
nav a:hover,nav a.active{color:var(--accent)}
.menu-btn{display:none;background:none;border:0;font-size:26px;cursor:pointer;color:var(--ink)}
/* hero */
.hero{position:relative;min-height:78vh;display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;overflow:hidden}
.hero .bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:brightness(.62)}
.hero .inner{position:relative;z-index:2;max-width:760px;padding:40px 24px}
.hero h1{font-size:clamp(48px,9vw,104px);color:#fff;margin-bottom:14px}
.hero .sub{font-size:clamp(16px,2.4vw,22px);font-weight:300;letter-spacing:.02em;margin-bottom:10px}
.hero .meta{font-size:14px;letter-spacing:.18em;text-transform:uppercase;opacity:.9}
.btn{display:inline-block;margin-top:26px;padding:14px 34px;border:1px solid #fff;color:#fff;font-size:13px;letter-spacing:.16em;text-transform:uppercase;transition:.25s}
.btn:hover{background:#fff;color:var(--ink)}
.btn-dark{border-color:var(--accent);background:var(--accent);color:#fff}
.btn-dark:hover{background:transparent;color:var(--accent)}
/* sections */
section.block{padding:90px 0}
section.block:nth-child(even){background:var(--bg2)}
.eyebrow{font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin-bottom:14px}
h2.title{font-size:clamp(30px,5vw,46px);margin-bottom:26px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center}
.split img{border-radius:4px;box-shadow:0 18px 50px rgba(60,50,40,.14);aspect-ratio:4/3;object-fit:cover;width:100%}
.prose p{margin-bottom:16px;color:#544c45}
.prose p:last-child{margin-bottom:0}
/* features */
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:10px}
.card{background:var(--bg);border:1px solid #ece4d8;border-radius:6px;padding:34px 28px;text-align:center}
section.block:nth-child(even) .card{background:#fff}
.card h3{font-size:26px;margin-bottom:12px;color:var(--accent)}
.card p{color:#6b635b;font-size:15px}
/* termine */
.termine{display:flex;flex-direction:column;gap:16px;max-width:820px;margin:0 auto}
.termin{display:grid;grid-template-columns:150px 1fr auto;gap:20px;align-items:center;background:#fff;border:1px solid #ece4d8;border-radius:6px;padding:22px 26px}
.termin .day{font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--accent)}
.termin .time{font-size:14px;color:var(--muted);letter-spacing:.05em}
.termin h3{font-size:24px;margin-bottom:4px}
.termin .desc{font-size:14px;color:#6b635b}
.termin .level{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent2);white-space:nowrap}
/* contact */
.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px}
.contact-info p{margin-bottom:10px;color:#544c45}
.contact-info strong{font-weight:500}
form.contact label{display:block;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:14px 0 6px}
form.contact input,form.contact textarea{width:100%;padding:12px 14px;border:1px solid #d8cfc2;border-radius:5px;background:#fff;font:inherit;color:var(--ink)}
form.contact textarea{min-height:130px;resize:vertical}
.note{font-size:13px;color:var(--muted);margin-top:10px}
.center{text-align:center}
.lead{max-width:760px;margin:0 auto;text-align:center;font-size:18px;color:#544c45}
/* footer */
footer{background:#33302b;color:#cfc6ba;padding:54px 0;text-align:center}
footer .brand{color:#fff;display:block;margin-bottom:14px}
footer a{color:var(--accent);letter-spacing:.06em}
footer .small{font-size:13px;opacity:.8;margin-top:14px}
@media(max-width:820px){
  .split,.contact-grid{grid-template-columns:1fr;gap:30px}
  .cards{grid-template-columns:1fr}
  .termin{grid-template-columns:1fr;gap:6px;text-align:left}
  nav{position:fixed;inset:74px 0 auto 0;background:var(--bg);flex-direction:column;gap:0;border-bottom:1px solid #ece4d8;display:none}
  nav.open{display:flex}
  nav a{padding:16px 24px;border-top:1px solid #ece4d8}
  .menu-btn{display:block}
}
</style>
</head>
<body>
<header><div class="wrap bar">
  <a href="/" class="brand">${esc(siteTitle)}</a>
  <button class="menu-btn" aria-label="Menü" onclick="document.getElementById('nav').classList.toggle('open')">☰</button>
  <nav id="nav">${nav}</nav>
</div></header>
${content}
<footer><div class="wrap">
  <a href="/" class="brand">${esc(siteTitle)}</a>
  ${ig ? `<a href="${esc(ig)}" target="_blank" rel="noopener">Instagram</a> &nbsp;·&nbsp; ` : ''}<a href="#cookie-einstellungen">Cookie-Einstellungen</a>
  <div class="small">${footer}</div>
</div></footer>
<script src="/fs-consent.js" defer></script>
</body></html>`;
}

function renderSection(sec) {
  if (sec.type === 'hero') {
    const src = imageSrc(sec);
    return `<div class="hero">
      <div class="bg" style="background-image:url('${esc(src)}')"></div>
      <div class="inner">
        ${sec.heading ? `<h1>${esc(sec.heading)}</h1>` : ''}
        ${sec.subheading ? `<div class="sub">${esc(sec.subheading)}</div>` : ''}
        ${sec.body ? `<div class="meta">${esc(sec.body)}</div>` : ''}
        <a href="/termine" class="btn">Termine ansehen</a>
      </div>
    </div>`;
  }
  if (sec.type === 'features') {
    const cards = String(sec.body || '').split('\n').filter(Boolean).map(line => {
      const [t, d] = line.split('|');
      return `<div class="card"><h3>${esc(t || '')}</h3><p>${esc(d || '')}</p></div>`;
    }).join('');
    return `<section class="block"><div class="wrap center">
      ${sec.heading ? `<h2 class="title">${esc(sec.heading)}</h2>` : ''}
      <div class="cards">${cards}</div>
    </div></section>`;
  }
  if (sec.type === 'termine') {
    const items = Q.termine().map(t => `<div class="termin">
      <div><div class="day">${esc(t.day || '')}</div><div class="time">${esc(t.time || '')}</div></div>
      <div><h3>${esc(t.title)}</h3><div class="desc">${esc(t.description || '')}</div></div>
      <div class="level">${esc(t.level || '')}</div>
    </div>`).join('');
    return `<section class="block"><div class="wrap"><div class="termine">${items || '<p class="center">Aktuell sind keine Termine eingetragen.</p>'}</div></div></section>`;
  }
  if (sec.type === 'contact') {
    const email = getSetting('email', ''), phone = getSetting('phone', ''), address = getSetting('address', ''), ig = getSetting('instagram', '');
    return `<section class="block"><div class="wrap"><div class="contact-grid">
      <div class="contact-info">
        <h2 class="title">Schreib mir</h2>
        ${email ? `<p><strong>E-Mail:</strong> <a href="mailto:${esc(email)}">${esc(email)}</a></p>` : ''}
        ${phone ? `<p><strong>Telefon:</strong> ${esc(phone)}</p>` : ''}
        ${address ? `<p><strong>Studio:</strong> ${esc(address)}</p>` : ''}
        ${ig ? `<p><strong>Instagram:</strong> <a href="${esc(ig)}" target="_blank" rel="noopener">@shinestudio</a></p>` : ''}
      </div>
      <div>
        <form class="contact" method="post" action="/kontakt-senden">
          <label>Name</label><input name="name" required>
          <label>E-Mail</label><input type="email" name="email" required>
          <label>Nachricht</label><textarea name="message" required></textarea>
          <button class="btn btn-dark" type="submit" style="margin-top:22px;border:0;cursor:pointer">Senden</button>
          <div class="note">Das Formular ist eine Demo – Nachrichten werden aktuell nicht verschickt.</div>
        </form>
      </div>
    </div></div></section>`;
  }
  // default: text (optionally with image -> split)
  const src = imageSrc(sec);
  if (src) {
    return `<section class="block"><div class="wrap"><div class="split">
      <div>
        ${sec.subheading ? `<div class="eyebrow">${esc(sec.subheading)}</div>` : ''}
        ${sec.heading ? `<h2 class="title">${esc(sec.heading)}</h2>` : ''}
        <div class="prose">${paragraphs(sec.body)}</div>
      </div>
      <img src="${esc(src)}" alt="${esc(sec.heading || '')}">
    </div></div></section>`;
  }
  return `<section class="block"><div class="wrap center">
    ${sec.subheading ? `<div class="eyebrow">${esc(sec.subheading)}</div>` : ''}
    ${sec.heading ? `<h2 class="title">${esc(sec.heading)}</h2>` : ''}
    <div class="prose lead">${paragraphs(sec.body)}</div>
  </div></section>`;
}

function renderPage(page) {
  const secs = Q.sections(page.id);
  return publicLayout(page.title, secs.map(renderSection).join('\n'), page.slug);
}

// ===========================================================================
// ADMIN-RENDERING
// ===========================================================================
function adminLayout(title, body, sess) {
  const flash = sess.flash; sess.flash = '';
  return `<!DOCTYPE html><html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin · ${esc(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#f4f2ee;color:#2c2925;line-height:1.5}
a{color:#a8765a}
.top{background:#33302b;color:#fff;padding:0 24px;height:58px;display:flex;align-items:center;justify-content:space-between}
.top .l{display:flex;gap:22px;align-items:center}
.top a{color:#e9e1d6;font-size:14px}.top a:hover{color:#fff}
.top .brand{font-weight:600;letter-spacing:.04em}
.wrap{max-width:920px;margin:30px auto;padding:0 24px}
h1{font-size:24px;margin-bottom:6px}h2{font-size:18px;margin:26px 0 12px}
.card{background:#fff;border:1px solid #e4ddd2;border-radius:8px;padding:20px 22px;margin-bottom:16px}
.muted{color:#857c72;font-size:14px}
label{display:block;font-size:13px;font-weight:600;margin:14px 0 5px;color:#4a443d}
input[type=text],input[type=email],input[type=password],input[type=number],textarea,select{
  width:100%;padding:10px 12px;border:1px solid #cfc6b9;border-radius:6px;font:inherit;background:#fff}
textarea{min-height:120px;resize:vertical}
.row{display:flex;gap:14px;flex-wrap:wrap}.row>div{flex:1;min-width:160px}
.btn{display:inline-block;padding:9px 18px;border-radius:6px;border:0;background:#a8765a;color:#fff;font:inherit;font-size:14px;cursor:pointer;text-decoration:none}
.btn:hover{background:#90634b}
.btn-sec{background:#e7e0d5;color:#3a352f}.btn-sec:hover{background:#d8cfc1}
.btn-danger{background:#b5524a}.btn-danger:hover{background:#9c453e}
.btn-sm{padding:5px 12px;font-size:13px}
.list-item{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-top:1px solid #eee5d8;gap:12px}
.list-item:first-child{border-top:0}
.list-item .info{min-width:0}
.list-item .info b{display:block}
.tag{display:inline-block;font-size:11px;background:#efe8db;color:#7a6f5f;padding:2px 8px;border-radius:20px;margin-left:6px}
.actions{display:flex;gap:8px;flex-shrink:0}
.flash{background:#dff0d8;border:1px solid #bcd9af;color:#3c662c;padding:11px 16px;border-radius:6px;margin-bottom:18px}
.thumb{width:64px;height:48px;object-fit:cover;border-radius:4px;border:1px solid #ddd}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.inline{display:inline}
hr{border:0;border-top:1px solid #ece4d8;margin:18px 0}
.help{font-size:12px;color:#9a9085;margin-top:4px}
@media(max-width:640px){.grid2{grid-template-columns:1fr}}
</style></head><body>
<div class="top">
  <div class="l"><span class="brand">⚙ Admin</span>
    <a href="/admin">Übersicht</a><a href="/admin/settings">Einstellungen</a>
    <a href="/admin/termine">Termine</a><a href="/" target="_blank">↗ Website</a></div>
  <a href="/admin/logout">Abmelden</a>
</div>
<div class="wrap">
${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
${body}
</div></body></html>`;
}

function csrfField(sess) { return `<input type="hidden" name="_csrf" value="${sess.csrf}">`; }

function adminLogin(sess, error) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Admin Login</title>
<style>body{font-family:system-ui,sans-serif;background:#33302b;color:#2c2925;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.box{background:#fff;padding:38px 34px;border-radius:10px;width:330px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
h1{font-family:Georgia,serif;font-size:24px;margin:0 0 6px}.m{color:#857c72;font-size:14px;margin-bottom:20px}
label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
input{width:100%;padding:11px 12px;border:1px solid #cfc6b9;border-radius:6px;font:inherit;box-sizing:border-box}
.btn{margin-top:18px;width:100%;padding:11px;border:0;border-radius:6px;background:#a8765a;color:#fff;font:inherit;font-size:15px;cursor:pointer}
.err{background:#f7e0de;color:#a23b32;padding:10px;border-radius:6px;font-size:14px;margin-bottom:14px}</style></head>
<body><form class="box" method="post" action="/admin/login">
<h1>shine studio</h1><div class="m">Adminbereich – bitte anmelden</div>
${error ? `<div class="err">${esc(error)}</div>` : ''}
${csrfField(sess)}
<label>Passwort</label><input type="password" name="password" autofocus required>
<button class="btn">Anmelden</button></form></body></html>`;
}

function adminDashboard(sess) {
  const pages = Q.allPages();
  const list = pages.map(p => `<div class="list-item">
    <div class="info"><b>${esc(p.title)} ${p.published ? '' : '<span class="tag">versteckt</span>'}${p.in_nav ? '' : '<span class="tag">nicht im Menü</span>'}</b>
      <span class="muted">/${esc(p.slug)} · ${Q.sections(p.id).length} Abschnitt(e)</span></div>
    <div class="actions">
      <a class="btn btn-sm" href="/admin/page/${p.id}">Bearbeiten</a>
    </div></div>`).join('');
  return adminLayout('Übersicht', `
  <h1>Seiten</h1>
  <p class="muted">Verwalte deine Seiten, Überschriften, Texte und Bilder.</p>
  <div class="card">${list}</div>
  <form method="post" action="/admin/page/new" class="card">
    ${csrfField(sess)}
    <h2 style="margin-top:0">Neue Seite</h2>
    <div class="row">
      <div><label>Titel</label><input type="text" name="title" required placeholder="z.B. Angebote"></div>
      <div><label>Menü-Bezeichnung</label><input type="text" name="nav_label" placeholder="Angebote"></div>
    </div>
    <button class="btn" style="margin-top:14px">Seite anlegen</button>
  </form>`, sess);
}

function adminPageEdit(sess, page) {
  const secs = Q.sections(page.id);
  const secList = secs.map((s, i) => `<div class="list-item">
    <div class="info" style="display:flex;gap:12px;align-items:center">
      ${imageSrc(s) ? `<img class="thumb" src="${esc(imageSrc(s))}">` : ''}
      <div><b>${esc(s.heading || '(ohne Überschrift)')} <span class="tag">${esc(s.type)}</span></b>
      <span class="muted">${esc((s.body || '').slice(0, 60))}</span></div>
    </div>
    <div class="actions">
      ${i > 0 ? `<form class="inline" method="post" action="/admin/section/${s.id}/move"><input type="hidden" name="dir" value="up">${csrfField(sess)}<button class="btn btn-sm btn-sec">↑</button></form>` : ''}
      ${i < secs.length - 1 ? `<form class="inline" method="post" action="/admin/section/${s.id}/move"><input type="hidden" name="dir" value="down">${csrfField(sess)}<button class="btn btn-sm btn-sec">↓</button></form>` : ''}
      <a class="btn btn-sm" href="/admin/section/${s.id}">Bearbeiten</a>
      <form class="inline" method="post" action="/admin/section/${s.id}/delete" onsubmit="return confirm('Abschnitt löschen?')">${csrfField(sess)}<button class="btn btn-sm btn-danger">×</button></form>
    </div></div>`).join('');

  return adminLayout('Seite: ' + page.title, `
  <p><a href="/admin">← Übersicht</a></p>
  <h1>${esc(page.title)}</h1>
  <form method="post" action="/admin/page/${page.id}" class="card">
    ${csrfField(sess)}
    <div class="grid2">
      <div><label>Titel</label><input type="text" name="title" value="${esc(page.title)}" required></div>
      <div><label>Menü-Bezeichnung</label><input type="text" name="nav_label" value="${esc(page.nav_label)}"></div>
      <div><label>URL-Pfad (slug)</label><input type="text" name="slug" value="${esc(page.slug)}" ${page.slug === 'home' ? 'readonly' : ''}></div>
      <div><label>Reihenfolge</label><input type="number" name="position" value="${page.position}"></div>
    </div>
    <div style="margin-top:12px">
      <label class="inline"><input type="checkbox" name="published" ${page.published ? 'checked' : ''}> veröffentlicht</label>
      &nbsp;&nbsp;
      <label class="inline"><input type="checkbox" name="in_nav" ${page.in_nav ? 'checked' : ''}> im Menü anzeigen</label>
    </div>
    <div style="margin-top:14px;display:flex;gap:10px">
      <button class="btn">Speichern</button>
      ${page.slug !== 'home' ? `<button class="btn btn-danger" formaction="/admin/page/${page.id}/delete" formnovalidate onclick="return confirm('Ganze Seite löschen?')">Seite löschen</button>` : ''}
    </div>
  </form>

  <h2>Abschnitte</h2>
  <div class="card">${secList || '<p class="muted">Noch keine Abschnitte.</p>'}</div>

  <form method="post" action="/admin/page/${page.id}/section/new" class="card">
    ${csrfField(sess)}
    <h2 style="margin-top:0">Neuer Abschnitt</h2>
    <label>Typ</label>
    <select name="type">
      <option value="text">Text (+ optionales Bild)</option>
      <option value="hero">Hero (grosses Titelbild)</option>
      <option value="features">Feature-Karten</option>
      <option value="termine">Termine-Liste</option>
      <option value="contact">Kontakt-Block</option>
    </select>
    <button class="btn" style="margin-top:14px">Abschnitt hinzufügen</button>
  </form>`, sess);
}

function adminSectionEdit(sess, sec) {
  const page = Q.pageById(sec.page_id);
  let typeHelp = '';
  if (sec.type === 'features') typeHelp = 'Eine Karte pro Zeile im Format: <code>Titel|Beschreibung</code>';
  if (sec.type === 'hero') typeHelp = 'Überschrift = grosser Titel, Unterüberschrift = Slogan, Text = kleine Zeile darunter. Bild = Hintergrund.';
  if (sec.type === 'termine') typeHelp = 'Dieser Abschnitt zeigt automatisch alle Termine (oben im Menü „Termine“ verwaltbar).';
  if (sec.type === 'contact') typeHelp = 'Zeigt Kontaktdaten (aus Einstellungen) + Kontaktformular.';

  const showText = sec.type !== 'termine' && sec.type !== 'contact';
  const showImage = sec.type === 'hero' || sec.type === 'text';

  return adminLayout('Abschnitt bearbeiten', `
  <p><a href="/admin/page/${page.id}">← ${esc(page.title)}</a></p>
  <h1>Abschnitt bearbeiten <span class="tag">${esc(sec.type)}</span></h1>
  ${typeHelp ? `<p class="muted">${typeHelp}</p>` : ''}
  <form method="post" action="/admin/section/${sec.id}" enctype="multipart/form-data" class="card">
    ${csrfField(sess)}
    ${showText ? `
    <label>Überschrift</label><input type="text" name="heading" value="${esc(sec.heading)}">
    <label>Unterüberschrift / Eyebrow</label><input type="text" name="subheading" value="${esc(sec.subheading)}">
    <label>Text</label><textarea name="body">${esc(sec.body)}</textarea>
    <div class="help">Absätze durch Leerzeile trennen.</div>` : '<p class="muted">Dieser Abschnitt-Typ benötigt keine Texteingabe.</p>'}
    ${showImage ? `
    <hr>
    <label>Bild</label>
    ${imageSrc(sec) ? `<img class="thumb" style="width:160px;height:110px;margin-bottom:8px" src="${esc(imageSrc(sec))}">` : ''}
    <input type="file" name="image" accept="image/*">
    <div class="help">Oder Bild-URL verwenden:</div>
    <input type="text" name="image_url" value="${esc(sec.image_url)}" placeholder="https://…">
    <div style="margin-top:6px"><label class="inline"><input type="checkbox" name="remove_image"> aktuelles Bild entfernen</label></div>
    ` : ''}
    <div style="margin-top:16px"><button class="btn">Speichern</button></div>
  </form>`, sess);
}

function adminTermine(sess) {
  const ts = Q.termine();
  const list = ts.map((t, i) => `<div class="list-item">
    <div class="info"><b>${esc(t.title)} <span class="tag">${esc(t.level || '')}</span></b>
      <span class="muted">${esc(t.day || '')} · ${esc(t.time || '')}</span></div>
    <div class="actions">
      ${i > 0 ? `<form class="inline" method="post" action="/admin/termin/${t.id}/move"><input type="hidden" name="dir" value="up">${csrfField(sess)}<button class="btn btn-sm btn-sec">↑</button></form>` : ''}
      ${i < ts.length - 1 ? `<form class="inline" method="post" action="/admin/termin/${t.id}/move"><input type="hidden" name="dir" value="down">${csrfField(sess)}<button class="btn btn-sm btn-sec">↓</button></form>` : ''}
      <a class="btn btn-sm" href="/admin/termin/${t.id}">Bearbeiten</a>
      <form class="inline" method="post" action="/admin/termin/${t.id}/delete" onsubmit="return confirm('Termin löschen?')">${csrfField(sess)}<button class="btn btn-sm btn-danger">×</button></form>
    </div></div>`).join('');
  return adminLayout('Termine', `
  <h1>Termine & Kurse</h1>
  <div class="card">${list || '<p class="muted">Noch keine Termine.</p>'}</div>
  <form method="post" action="/admin/termin/new" class="card">
    ${csrfField(sess)}
    <h2 style="margin-top:0">Neuer Termin</h2>
    <div class="grid2">
      <div><label>Titel</label><input type="text" name="title" required></div>
      <div><label>Level</label><input type="text" name="level" placeholder="Alle Level"></div>
      <div><label>Tag</label><input type="text" name="day" placeholder="Montag"></div>
      <div><label>Zeit</label><input type="text" name="time" placeholder="09:00 – 10:00"></div>
    </div>
    <label>Beschreibung</label><textarea name="description"></textarea>
    <button class="btn" style="margin-top:12px">Termin anlegen</button>
  </form>`, sess);
}

function adminTerminEdit(sess, t) {
  return adminLayout('Termin bearbeiten', `
  <p><a href="/admin/termine">← Termine</a></p>
  <h1>Termin bearbeiten</h1>
  <form method="post" action="/admin/termin/${t.id}" class="card">
    ${csrfField(sess)}
    <div class="grid2">
      <div><label>Titel</label><input type="text" name="title" value="${esc(t.title)}" required></div>
      <div><label>Level</label><input type="text" name="level" value="${esc(t.level)}"></div>
      <div><label>Tag</label><input type="text" name="day" value="${esc(t.day)}"></div>
      <div><label>Zeit</label><input type="text" name="time" value="${esc(t.time)}"></div>
    </div>
    <label>Beschreibung</label><textarea name="description">${esc(t.description)}</textarea>
    <button class="btn" style="margin-top:12px">Speichern</button>
  </form>`, sess);
}

function adminSettings(sess) {
  const keys = [
    ['site_title', 'Studio-Name (Logo)'],
    ['site_subtitle', 'Untertitel'],
    ['email', 'E-Mail'],
    ['phone', 'Telefon'],
    ['address', 'Adresse'],
    ['instagram', 'Instagram-Link'],
    ['accent', 'Akzentfarbe (z.B. #a8876b)'],
    ['accent2', 'Akzentfarbe 2'],
    ['footer_text', 'Footer-Text'],
  ];
  const fields = keys.map(([k, label]) =>
    `<div><label>${esc(label)}</label><input type="text" name="${k}" value="${esc(getSetting(k))}"></div>`
  ).join('');
  return adminLayout('Einstellungen', `
  <h1>Einstellungen</h1>
  <form method="post" action="/admin/settings" class="card">
    ${csrfField(sess)}
    <div class="grid2">${fields}</div>
    <button class="btn" style="margin-top:16px">Speichern</button>
  </form>`, sess);
}

// ===========================================================================
// ROUTING
// ===========================================================================
function requireAuth(sess, res) {
  if (!sess.authed) { send(res, 200, adminLogin(sess)); return false; }
  return true;
}
function checkCsrf(sess, fields) { return fields && fields._csrf && fields._csrf === sess.csrf; }

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const p = u.pathname.replace(/\/+$/, '') || '/';
    const sess = getSession(req, res);
    const method = req.method;

    // ----- Media -----
    if (p.startsWith('/media/')) {
      const id = parseInt(p.split('/')[2], 10);
      const m = id ? db.prepare('SELECT mime, data FROM media WHERE id=?').get(id) : null;
      if (!m) return send(res, 404, 'Not found');
      res.writeHead(200, { 'Content-Type': m.mime, 'Cache-Control': 'public, max-age=86400' });
      return res.end(Buffer.from(m.data));
    }
    if (p === '/health') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
    if ((method === 'GET' || method === 'HEAD') && serveStatic(p, res)) return;

    // ===================== ADMIN =====================
    if (p === '/admin/login') {
      if (method === 'POST') {
        const { fields } = await parseRequest(req);
        if (!checkCsrf(sess, fields)) return send(res, 200, adminLogin(sess, 'Sitzung abgelaufen, bitte erneut versuchen.'));
        const ok = fields.password && fields.password.length === ADMIN_PASSWORD.length &&
          crypto.timingSafeEqual(Buffer.from(fields.password), Buffer.from(ADMIN_PASSWORD));
        if (ok) { sess.authed = true; return redirect(res, '/admin'); }
        return send(res, 200, adminLogin(sess, 'Falsches Passwort.'));
      }
      if (sess.authed) return redirect(res, '/admin');
      return send(res, 200, adminLogin(sess));
    }
    if (p === '/admin/logout') { sess.authed = false; return redirect(res, '/admin/login'); }

    if (p === '/admin' || p.startsWith('/admin/')) {
      if (!requireAuth(sess, res)) return;

      if (p === '/admin') return send(res, 200, adminDashboard(sess));

      if (p === '/admin/settings') {
        if (method === 'POST') {
          const { fields } = await parseRequest(req);
          if (!checkCsrf(sess, fields)) return forbidden(res);
          ['site_title','site_subtitle','email','phone','address','instagram','accent','accent2','footer_text']
            .forEach(k => { if (k in fields) setSetting(k, fields[k]); });
          sess.flash = 'Einstellungen gespeichert.';
          return redirect(res, '/admin/settings');
        }
        return send(res, 200, adminSettings(sess));
      }

      // Termine
      if (p === '/admin/termine') return send(res, 200, adminTermine(sess));
      if (p === '/admin/termin/new' && method === 'POST') {
        const { fields } = await parseRequest(req);
        if (!checkCsrf(sess, fields)) return forbidden(res);
        const pos = (db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS n FROM termine').get().n) || 0;
        db.prepare('INSERT INTO termine(title,day,time,level,description,position) VALUES(?,?,?,?,?,?)')
          .run(fields.title || 'Neuer Termin', fields.day || '', fields.time || '', fields.level || '', fields.description || '', pos);
        sess.flash = 'Termin angelegt.';
        return redirect(res, '/admin/termine');
      }
      let m;
      if ((m = p.match(/^\/admin\/termin\/(\d+)$/)) && method === 'POST') {
        const { fields } = await parseRequest(req);
        if (!checkCsrf(sess, fields)) return forbidden(res);
        db.prepare('UPDATE termine SET title=?,day=?,time=?,level=?,description=? WHERE id=?')
          .run(fields.title || '', fields.day || '', fields.time || '', fields.level || '', fields.description || '', +m[1]);
        sess.flash = 'Termin gespeichert.';
        return redirect(res, '/admin/termine');
      }
      if ((m = p.match(/^\/admin\/termin\/(\d+)$/))) {
        const t = Q.termin(+m[1]); if (!t) return redirect(res, '/admin/termine');
        return send(res, 200, adminTerminEdit(sess, t));
      }
      if ((m = p.match(/^\/admin\/termin\/(\d+)\/delete$/)) && method === 'POST') {
        const { fields } = await parseRequest(req); if (!checkCsrf(sess, fields)) return forbidden(res);
        db.prepare('DELETE FROM termine WHERE id=?').run(+m[1]); sess.flash = 'Termin gelöscht.';
        return redirect(res, '/admin/termine');
      }
      if ((m = p.match(/^\/admin\/termin\/(\d+)\/move$/)) && method === 'POST') {
        const { fields } = await parseRequest(req); if (!checkCsrf(sess, fields)) return forbidden(res);
        moveRow('termine', +m[1], fields.dir); return redirect(res, '/admin/termine');
      }

      // Pages
      if (p === '/admin/page/new' && method === 'POST') {
        const { fields } = await parseRequest(req);
        if (!checkCsrf(sess, fields)) return forbidden(res);
        const title = (fields.title || 'Neue Seite').trim();
        let slug = slugify(fields.nav_label || title);
        let base = slug, n = 1;
        while (Q.pageBySlug(slug)) slug = base + '-' + (++n);
        const pos = (db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS n FROM pages').get().n) || 0;
        const id = db.prepare('INSERT INTO pages(slug,title,nav_label,position,in_nav,published) VALUES(?,?,?,?,1,1)')
          .run(slug, title, fields.nav_label || title, pos).lastInsertRowid;
        sess.flash = 'Seite angelegt.';
        return redirect(res, '/admin/page/' + id);
      }
      if ((m = p.match(/^\/admin\/page\/(\d+)$/)) && method === 'POST') {
        const { fields } = await parseRequest(req);
        if (!checkCsrf(sess, fields)) return forbidden(res);
        const page = Q.pageById(+m[1]); if (!page) return redirect(res, '/admin');
        let slug = page.slug;
        if (page.slug !== 'home' && fields.slug) {
          let s = slugify(fields.slug);
          if (s && (s === page.slug || !Q.pageBySlug(s))) slug = s;
        }
        db.prepare('UPDATE pages SET title=?,nav_label=?,slug=?,position=?,published=?,in_nav=? WHERE id=?')
          .run(fields.title || page.title, fields.nav_label || page.nav_label, slug,
            parseInt(fields.position, 10) || 0, fields.published ? 1 : 0, fields.in_nav ? 1 : 0, page.id);
        sess.flash = 'Seite gespeichert.';
        return redirect(res, '/admin/page/' + page.id);
      }
      if ((m = p.match(/^\/admin\/page\/(\d+)\/delete$/)) && method === 'POST') {
        const { fields } = await parseRequest(req); if (!checkCsrf(sess, fields)) return forbidden(res);
        const page = Q.pageById(+m[1]);
        if (page && page.slug !== 'home') {
          db.prepare('DELETE FROM sections WHERE page_id=?').run(page.id);
          db.prepare('DELETE FROM pages WHERE id=?').run(page.id);
          sess.flash = 'Seite gelöscht.';
        }
        return redirect(res, '/admin');
      }
      if ((m = p.match(/^\/admin\/page\/(\d+)$/))) {
        const page = Q.pageById(+m[1]); if (!page) return redirect(res, '/admin');
        return send(res, 200, adminPageEdit(sess, page));
      }
      if ((m = p.match(/^\/admin\/page\/(\d+)\/section\/new$/)) && method === 'POST') {
        const { fields } = await parseRequest(req); if (!checkCsrf(sess, fields)) return forbidden(res);
        const page = Q.pageById(+m[1]); if (!page) return redirect(res, '/admin');
        const pos = (db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS n FROM sections WHERE page_id=?').get(page.id).n) || 0;
        const id = db.prepare('INSERT INTO sections(page_id,type,heading,body,position) VALUES(?,?,?,?,?)')
          .run(page.id, fields.type || 'text', '', '', pos).lastInsertRowid;
        sess.flash = 'Abschnitt hinzugefügt.';
        return redirect(res, '/admin/section/' + id);
      }

      // Sections
      if ((m = p.match(/^\/admin\/section\/(\d+)$/)) && method === 'POST') {
        const { fields, files } = await parseRequest(req);
        if (!checkCsrf(sess, fields)) return forbidden(res);
        const sec = Q.section(+m[1]); if (!sec) return redirect(res, '/admin');
        let imageId = sec.image_id;
        if (fields.remove_image) imageId = null;
        const newImg = saveMedia(files && files.image);
        if (newImg) imageId = newImg;
        db.prepare('UPDATE sections SET heading=?,subheading=?,body=?,image_id=?,image_url=? WHERE id=?')
          .run(fields.heading || '', fields.subheading || '', fields.body || '',
            imageId, fields.remove_image ? '' : (fields.image_url || ''), sec.id);
        sess.flash = 'Abschnitt gespeichert.';
        return redirect(res, '/admin/page/' + sec.page_id);
      }
      if ((m = p.match(/^\/admin\/section\/(\d+)\/delete$/)) && method === 'POST') {
        const { fields } = await parseRequest(req); if (!checkCsrf(sess, fields)) return forbidden(res);
        const sec = Q.section(+m[1]);
        if (sec) { db.prepare('DELETE FROM sections WHERE id=?').run(sec.id); sess.flash = 'Abschnitt gelöscht.'; return redirect(res, '/admin/page/' + sec.page_id); }
        return redirect(res, '/admin');
      }
      if ((m = p.match(/^\/admin\/section\/(\d+)\/move$/)) && method === 'POST') {
        const { fields } = await parseRequest(req); if (!checkCsrf(sess, fields)) return forbidden(res);
        const sec = Q.section(+m[1]); if (!sec) return redirect(res, '/admin');
        moveRowScoped('sections', 'page_id', sec.page_id, sec.id, fields.dir);
        return redirect(res, '/admin/page/' + sec.page_id);
      }
      if ((m = p.match(/^\/admin\/section\/(\d+)$/))) {
        const sec = Q.section(+m[1]); if (!sec) return redirect(res, '/admin');
        return send(res, 200, adminSectionEdit(sess, sec));
      }

      return redirect(res, '/admin');
    }

    // ===================== PUBLIC =====================
    if (p === '/kontakt-senden' && method === 'POST') {
      await parseRequest(req); // Demo: nichts verschicken
      const kontakt = Q.pageBySlug('kontakt');
      return send(res, 200, publicLayout('Danke', `<section class="block"><div class="wrap center">
        <h2 class="title">Danke für deine Nachricht!</h2>
        <p class="lead">Dies ist eine Demo – die Nachricht wurde nicht wirklich verschickt. Verbinde hier später deinen E-Mail-Dienst.</p>
        <a class="btn btn-dark" href="/" style="margin-top:24px">Zurück zur Startseite</a>
      </div></section>`, kontakt ? 'kontakt' : ''));
    }

    if (method === 'GET') {
      const slug = p === '/' ? 'home' : p.slice(1);
      const page = Q.pageBySlug(slug);
      if (page && page.published) return send(res, 200, renderPage(page));
    }

    return send(res, 404, publicLayout('Nicht gefunden', `<section class="block"><div class="wrap center">
      <h2 class="title">Seite nicht gefunden</h2><p class="lead">Diese Seite existiert nicht.</p>
      <a class="btn btn-dark" href="/" style="margin-top:24px">Zur Startseite</a></div></section>`, ''));
  } catch (err) {
    console.error('Request error:', err);
    return send(res, 500, 'Interner Fehler');
  }
});

function forbidden(res) { return send(res, 403, 'Ungültige Anfrage (CSRF). Bitte Seite neu laden.'); }
function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'seite';
}
function moveRow(table, id, dir) {
  const rows = db.prepare(`SELECT id, position FROM ${table} ORDER BY position, id`).all();
  const idx = rows.findIndex(r => r.id === id);
  if (idx < 0) return;
  const swap = dir === 'up' ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= rows.length) return;
  reorderSwap(table, rows, idx, swap);
}
function moveRowScoped(table, scopeCol, scopeVal, id, dir) {
  const rows = db.prepare(`SELECT id, position FROM ${table} WHERE ${scopeCol}=? ORDER BY position, id`).all(scopeVal);
  const idx = rows.findIndex(r => r.id === id);
  if (idx < 0) return;
  const swap = dir === 'up' ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= rows.length) return;
  reorderSwap(table, rows, idx, swap);
}
function reorderSwap(table, rows, i, j) {
  // Positionen neu vergeben, dann tauschen
  rows.forEach((r, k) => db.prepare(`UPDATE ${table} SET position=? WHERE id=?`).run(k, r.id));
  const a = rows[i].id, b = rows[j].id;
  db.prepare(`UPDATE ${table} SET position=? WHERE id=?`).run(j, a);
  db.prepare(`UPDATE ${table} SET position=? WHERE id=?`).run(i, b);
}

server.listen(PORT, () => {
  console.log(`Pilates-Website läuft auf Port ${PORT}`);
  console.log(`Adminbereich: /admin`);
});
