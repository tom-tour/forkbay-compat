'use strict';
// Forkbay Compat: reads every source live in the visitor's browser, and puts their reports side by side per game.
// Nothing from the other sources is stored here: the page only keeps a copy for a few minutes in the browser.

const REPO = 'tom-tour/forkbay-compat';
const CACHE_MIN = 15;
const OUTCOMES = ['Perfect', 'Playable', 'Runs', 'Loads', 'Unplayable'];

// --- Languages: English first, French when the browser asks for it ---
const FR = {
  'Switch 2 emulator reports, from every source': 'Les rapports des émulateurs Switch 2, de toutes les sources',
  'Send a report': 'Envoyer un rapport',
  'Reports are read live from each source when you open this page; only the reports sent here are kept here. Nothing here links to games, keys or firmware.': 'Les rapports sont lus en direct dans chaque source à l\'ouverture de la page ; seuls les rapports envoyés ici sont gardés ici. Rien ici ne renvoie vers des jeux, des clés ou du firmware.',
  'Search a game': 'Rechercher un jeu', 'Most reports': 'Le plus de rapports', 'Latest': 'Les plus récents', 'Name': 'Nom',
  'No game matches your search.': 'Aucun jeu ne correspond à ta recherche.', 'Loading the sources…': 'Lecture des sources…',
  'All games': 'Tous les jeux', 'Perfect': 'Parfait', 'Playable': 'Jouable', 'Runs': 'Tourne', 'Loads': 'Se lance', 'Unplayable': 'Injouable',
  'Problem': 'Problème', 'Fixed': 'Corrigé', 'reports': 'rapports', 'report': 'rapport', 'problems': 'problèmes', 'problem': 'problème',
  'Status per source': 'État selon chaque source', 'Reports': 'Rapports', 'Known problems': 'Problèmes connus',
  'No report yet for this game.': 'Aucun rapport pour ce jeu pour l\'instant.', 'No open problem reported.': 'Aucun problème signalé.',
  'Eglantine compatibility page': 'Page de compatibilité d\'Eglantine', 'wichforks guide pick': 'Choix du guide wichforks',
  'Also try': 'À essayer aussi', 'Lichii reports': 'Rapports Lichii', 'Native port (nxnative)': 'Portage natif (nxnative)',
  'Open the reports on the Lichii site': 'Voir les rapports sur le site de Lichii',
  'The Lichii site does not let other pages read its reports yet. Forkbay reads them directly.': 'Le site de Lichii ne laisse pas encore d\'autres pages lire ses rapports. Forkbay, lui, les lit directement.',
  'Mac, iPhone and iPad: the game runs natively, not in an emulator.': 'Mac, iPhone et iPad : le jeu tourne nativement, pas dans un émulateur.',
  'Open its profile': 'Voir sa fiche', 'All sources': 'Toutes les sources', 'All emulators': 'Tous les émulateurs',
  'Sent from Forkbay': 'Envoyé depuis Forkbay', 'played': 'joué', 'Open': 'Ouvrir', 'Closed': 'Fermé',
  'Not reachable': 'Injoignable', 'GitHub limits reading to 60 requests per hour: try again later.': 'GitHub limite la lecture à 60 requêtes par heure : réessaie plus tard.',
  'today': 'aujourd\'hui', 'yesterday': 'hier', 'Show more': 'Voir plus', 'Other games': 'Autres jeux',
  'Updated': 'Mis à jour', 'Players (here)': 'Joueurs (ici)', 'Eglantine issues': 'Tickets Eglantine', 'Lichii issues': 'Tickets Lichii',
  'Eglantine wiki': 'Wiki Eglantine', 'wichforks reports': 'Rapports wichforks', 'wichforks guide': 'Guide wichforks',
  'Report this game': 'Faire un rapport sur ce jeu', 'program id': 'identifiant',
};
let LANG = 'en';
try { LANG = localStorage.getItem('lang') || (navigator.language || '').slice(0, 2) === 'fr' && 'fr' || 'en'; } catch (e) { LANG = (navigator.language || '').startsWith('fr') ? 'fr' : 'en'; }
const t = s => (LANG === 'fr' && FR[s]) || s;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const $ = id => document.getElementById(id);
const safeUrl = u => /^https:\/\/(github\.com|lichii\.zortos\.me|ko-fi\.com)\//.test(u || '') ? u : '';

// --- Reading, with a short copy in the browser so that GitHub's 60 requests per hour are enough ---
async function fetchCached(url, kind) {
  const key = 'c:' + url;
  let old = null;
  try { old = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { old = null; }
  if (old && Date.now() - old.at < CACHE_MIN * 60000) return old.v;
  try {
    const r = await fetch(url, { headers: url.startsWith('https://api.github.com') ? { Accept: 'application/vnd.github+json' } : {} });
    if (r.status === 404) return kind === 'json' ? null : '';
    if (!r.ok) { const e = new Error(r.status === 403 || r.status === 429 ? 'rate' : 'http ' + r.status); throw e; }
    const v = kind === 'json' ? await r.json() : await r.text();
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), v })); } catch (e) { /* storage full or blocked */ }
    return v;
  } catch (e) {
    if (old) return old.v;
    throw e;
  }
}

// --- Games: the shared table, matched by program id or by name ---
let GAMES = [];
function indexGames(list) {
  GAMES = list.map(g => ({ ...g, slug: fold(g.name).replace(/ /g, '-'), keys: [g.name, ...(g.aliases || [])].map(fold).filter(k => k.length >= 3) }));
}
function findGame(name, text) {
  const ids = (String(name) + ' ' + String(text || '')).toUpperCase().match(/\b0[14]00[0-9A-F]{12}\b/g) || [];
  for (const id of ids) { const g = GAMES.find(x => (x.ids || []).includes(id)); if (g) return g; }
  const s = ' ' + fold(name) + ' ';
  if (s.trim().length < 3) return null;
  let best = null, len = 0;
  for (const g of GAMES) for (const k of g.keys) if (s.includes(' ' + k + ' ') && k.length > len) { best = g; len = k.length; }
  return best;
}
function otherGame(name) {
  const n = String(name).replace(/\s+/g, ' ').trim().slice(0, 80);
  const slug = fold(n).replace(/ /g, '-');
  if (!slug) return null;
  let g = GAMES.find(x => x.slug === slug);
  if (!g) { g = { name: n, slug, ids: [], aliases: [], keys: [fold(n)], other: true }; GAMES.push(g); }
  return g;
}

// The "### Label" sections of a GitHub issue form.
function formFields(body) {
  const f = {}, marks = [], re = /^###\s+(.+?)\s*$/gm;
  let m;
  while ((m = re.exec(body || ''))) marks.push([m[1].toLowerCase(), m.index, re.lastIndex]);
  marks.forEach(([k, , end], i) => {
    let v = body.slice(end, i + 1 < marks.length ? marks[i + 1][1] : body.length).trim();
    v = v.replace(/```[\s\S]*?```/g, '').trim();
    f[k] = v === '_No response_' ? '' : v;
  });
  return f;
}
const plain = s => String(s || '').replace(/!\[[^\]]*\]\[[^\]]*\]|!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`>#]/g, '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
function outcomeOf(s) { const f = ' ' + fold(s) + ' '; return ['Unplayable', ...OUTCOMES].find(o => f.includes(' ' + o.toLowerCase() + ' ')) || ''; }

// --- The sources. Each one turns what it reads into the same kind of item ---
const SOURCES = [
  {
    id: 'here', name: 'Players (here)', home: `https://github.com/${REPO}/issues?q=label%3Areport`,
    async load() {
      const list = await fetchCached(`https://api.github.com/repos/${REPO}/issues?labels=report&state=all&per_page=100`, 'json') || [];
      return list.filter(i => !i.pull_request && !(i.labels || []).some(l => l.name === 'invalid' || l.name === 'spam')).map(i => {
        const f = formFields(i.body);
        return { kind: 'report', game: f['game'], text: [f['notes'], f['settings']].filter(Boolean).join(' · '), ids: f['program id'],
          outcome: outcomeOf(f['result']), emulator: f['emulator'], build: f['emulator build'], gpu: f['graphics card'], cpu: f['processor'], os: f['operating system'],
          fps: f['fps'], played: f['time played'], version: f['game version'], forkbay: /forkbay/i.test(f['sent from'] || ''), date: Date.parse(i.created_at), url: i.html_url };
      });
    },
  },
  {
    id: 'eg-issues', name: 'Eglantine issues', home: 'https://github.com/Eglantine-Community/Eglantine/issues?q=label%3Agame-bug',
    async load() {
      const out = [];
      for (const label of ['game-bug', 'game-support']) {
        const list = await fetchCached(`https://api.github.com/repos/Eglantine-Community/Eglantine/issues?labels=${label}&state=all&per_page=100`, 'json') || [];
        for (const i of list) if (!i.pull_request) out.push(issueItem(i, 'Eglantine'));
      }
      return out;
    },
  },
  {
    id: 'li-issues', name: 'Lichii issues', home: 'https://github.com/zortos293/Lichii/issues?q=%5BGBug%5D',
    async load() {
      const out = [];
      for (const page of [1, 2]) {
        const r = await fetchCached(`https://api.github.com/search/issues?q=${encodeURIComponent('repo:zortos293/Lichii is:issue "[GBug]" in:title')}&sort=created&order=desc&per_page=100&page=${page}`, 'json');
        const items = (r && r.items) || [];
        for (const i of items) out.push(issueItem(i, 'Lichii'));
        if (items.length < 100) break;
      }
      return out;
    },
  },
  {
    id: 'eg-wiki', name: 'Eglantine wiki', home: 'https://github.com/Eglantine-Community/Eglantine/wiki/Game-Compatibility',
    async load() {
      const md = await fetchCached('https://raw.githubusercontent.com/wiki/Eglantine-Community/Eglantine/Game-Compatibility.md', 'text');
      const badge = { playable: 'Playable', ingame: 'Runs', intro: 'Loads', loadable: 'Loads', nothing: 'Unplayable' };
      const out = [];
      let inside = false;
      for (const line of md.split('\n')) {
        const l = line.trim();
        if (!l.startsWith('|')) { if (inside && l) inside = false; continue; }
        const c = l.replace(/^\||\|$/g, '').split('|').map(x => x.trim());
        if (c[0] === 'Game Title') { inside = true; continue; }
        if (!inside || c.length < 5 || c[0].startsWith(':--') || c[0].startsWith('--')) continue;
        const b = (c[2].match(/\]\[(\w+)\]/) || [])[1];
        const day = (c[3].match(/\d{4}-\d{2}-\d{2}/) || [])[0];
        out.push({ kind: 'status', game: c[0], outcome: badge[b] || '', emulator: 'Eglantine', build: plain(c[3].replace(/^\S*\s*·\s*/, '')), version: c[1] === '—' ? '' : c[1],
          text: plain(c[4]), date: day ? Date.parse(day) : null, url: this.home });
      }
      return out;
    },
  },
  {
    id: 'wf-reports', name: 'wichforks reports', home: 'https://github.com/riyadhHDA/wichforks',
    async load() {
      const d = await fetchCached('https://raw.githubusercontent.com/riyadhHDA/wichforks/main/data/performance-reports.json', 'json');
      return ((d && d.reports) || []).map(r => ({ kind: 'report', game: r.game, outcome: outcomeOf(r.performance), emulator: r.build_family && r.build_family !== 'Unspecified' ? r.build_family.replace(/ build$/, '') : '',
        build: r.build === 'unspecified' ? '' : r.build, gpu: /not stated|unknown/i.test(r.gpu) ? '' : r.gpu, cpu: /not stated|unknown/i.test(r.cpu) ? '' : r.cpu,
        text: [r.performance, r.notes].filter(Boolean).join(' · '), date: dayMonth(r.date, d.generated), url: 'https://github.com/riyadhHDA/wichforks/blob/main/data/performance-reports.json' }));
    },
  },
  {
    id: 'wf-guide', name: 'wichforks guide', home: 'https://github.com/riyadhHDA/wichforks#which-fork-for-which-game',
    async load() {
      const md = await fetchCached('https://raw.githubusercontent.com/riyadhHDA/wichforks/main/README.md', 'text');
      const out = [];
      let inside = false;
      for (const line of md.split('\n')) {
        const l = line.trim();
        if (!l.startsWith('|')) { inside = false; continue; }
        const c = l.replace(/^\||\|$/g, '').split('|').map(x => plain(x));
        if (c[0] === 'Game' && c[1] === 'First pick') { inside = true; continue; }
        if (!inside || c.length < 4 || c[0].startsWith('--')) continue;
        out.push({ kind: 'pick', game: c[0], pick: c[1], also: c[2], text: c[3], url: 'https://github.com/riyadhHDA/wichforks' });
      }
      return out;
    },
  },
  {
    id: 'nxnative', name: 'nxnative', home: 'https://github.com/seedds/nxnative',
    async load() {
      const md = await fetchCached('https://raw.githubusercontent.com/seedds/nxnative/main/README.md', 'text');
      const passed = new Set((md.match(/dm\/games\/([0-9A-F]{16})\/README\.md/g) || []).map(x => x.slice(9, 25)));
      return [...passed].map(id => ({ kind: 'native', game: id, ids: id, url: `https://github.com/seedds/nxnative/blob/main/dm/games/${id}/README.md` }));
    },
  },
];

function issueItem(i, emulator) {
  const f = formFields(i.body);
  const game = f['game'] || '';
  return { kind: 'issue', game, emulator, build: f['emulator build'], gpu: f['graphics card'], os: f['operating system'],
    title: i.title.replace(/^\[GBug\]\s*/i, ''), text: plain(f['steps to reproduce'] || ''), regression: /\[x\]\s*This is a regression/i.test(f['regression'] || ''),
    outcome: i.state === 'closed' ? 'Fixed' : 'Problem', date: Date.parse(i.created_at), url: i.html_url };
}
// "4 Nov" in the year the file was made.
function dayMonth(s, generated) {
  const y = (String(generated || '').match(/\d{4}/) || [new Date().getFullYear()])[0];
  if (!/^\d{1,2} [A-Za-z]{3}/.test(String(s || ''))) return null;
  const d = Date.parse(`${s} ${y}`);
  return isNaN(d) ? null : d;
}

// --- Loading everything, each source on its own so that one failing does not stop the others ---
const STATE = {};
let ITEMS = [];
async function loadAll() {
  renderSources();
  try { const g = await (await fetch('data/games.json')).json(); indexGames(g.games); } catch (e) { indexGames([]); }
  await Promise.all(SOURCES.map(async s => {
    STATE[s.id] = { state: 'wait' };
    renderSources();
    try {
      const list = await s.load();
      for (const it of list) {
        it.src = s.id;
        // A problem without a known game is left out: the sources' game field is often "Other" or empty.
        it.g = it.kind === 'issue' ? findGame(/other|not listed/i.test(it.game) ? '' : it.game) || findGame(it.title) || findGame(it.text.slice(0, 300))
          : findGame(it.game) || (it.kind === 'report' ? otherGame(it.game) : null);
        if (it.g) ITEMS.push(it);
      }
      STATE[s.id] = { state: 'ok', n: list.length };
    } catch (e) {
      STATE[s.id] = { state: 'err', rate: e.message === 'rate' };
    }
    renderSources();
    route();
  }));
}

// --- Display ---
function renderSources() {
  $('sources').innerHTML = SOURCES.map(s => {
    const st = STATE[s.id] || { state: 'wait' };
    const tip = st.state === 'err' ? (st.rate ? t('GitHub limits reading to 60 requests per hour: try again later.') : t('Not reachable')) : '';
    return `<a class="src ${st.state}" href="${esc(s.home)}" target="_blank" rel="noopener" title="${esc(tip)}"><i></i>${esc(t(s.name))}${st.state === 'ok' ? ` · ${st.n}` : ''}</a>`;
  }).join('') + `<span class="src" title="${esc(t('The Lichii site does not let other pages read its reports yet. Forkbay reads them directly.'))}"><i></i>Lichii · <a href="https://lichii.zortos.me/reports" target="_blank" rel="noopener">lichii.zortos.me</a></span>`;
}

const ago = ms => {
  if (!ms) return '';
  const day = d => { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate()); };
  const n = Math.round((day(Date.now()) - day(ms)) / 864e5);
  if (n <= 0) return t('today');
  if (n === 1) return t('yesterday');
  if (n < 30) return LANG === 'fr' ? `il y a ${n} jours` : `${n} days ago`;
  return new Date(ms).toLocaleDateString(LANG === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const plural = (n, one, many) => `${n} ${t(n === 1 ? one : many)}`;
function counts(list) { const c = {}; for (const o of OUTCOMES) c[o] = 0; for (const it of list) if (c[it.outcome] !== undefined) c[it.outcome]++; return c; }
function barHtml(c) {
  const total = OUTCOMES.reduce((a, o) => a + c[o], 0);
  if (!total) return '';
  return `<div class="bar">${OUTCOMES.map(o => c[o] ? `<span class="b-${o}" data-w="${(100 * c[o] / total).toFixed(1)}" title="${esc(t(o))}: ${c[o]}"></span>` : '').join('')}</div>`;
}

let Q = '', SORT = 'reports', FSRC = '', FEMU = '';
try { SORT = localStorage.getItem('sort') || 'reports'; } catch (e) { /* blocked */ }

function gameStats(g) {
  const its = ITEMS.filter(i => i.g === g);
  const reports = its.filter(i => i.kind === 'report' || i.kind === 'status');
  const problems = its.filter(i => i.kind === 'issue' && i.outcome === 'Problem');
  const last = Math.max(0, ...its.map(i => i.date || 0));
  return { its, reports, problems, last };
}

function renderList() {
  const words = fold(Q).split(' ').filter(Boolean);
  let list = GAMES.filter(g => words.every(w => g.keys.some(k => k.includes(w)))).map(g => ({ g, s: gameStats(g) })).filter(x => x.s.its.length || !x.g.other);
  if (SORT === 'name') list.sort((a, b) => a.g.name.localeCompare(b.g.name));
  else if (SORT === 'latest') list.sort((a, b) => b.s.last - a.s.last);
  else list.sort((a, b) => b.s.reports.length - a.s.reports.length || b.s.its.length - a.s.its.length);
  const known = list.filter(x => !x.g.other), others = list.filter(x => x.g.other);
  const card = ({ g, s }) => `<a class="game" href="#/game/${esc(g.slug)}"><b>${esc(g.name)}</b><div class="counts">${s.reports.length ? `<span class="pill">${plural(s.reports.length, 'report', 'reports')}</span>` : ''}${s.problems.length ? `<span class="pill o-Problem">${plural(s.problems.length, 'problem', 'problems')}</span>` : ''}${s.last ? `<span class="pill">${esc(ago(s.last))}</span>` : ''}</div>${barHtml(counts(s.reports))}</a>`;
  const loading = Object.values(STATE).some(s => s.state === 'wait');
  return `<div class="tools"><input type="text" id="q" placeholder="${esc(t('Search a game'))}" aria-label="${esc(t('Search a game'))}" value="${esc(Q)}" autocomplete="off"><div class="seg" id="sort">${[['reports', 'Most reports'], ['latest', 'Latest'], ['name', 'Name']].map(([k, l]) => `<button data-k="${k}" class="${SORT === k ? 'on' : ''}">${esc(t(l))}</button>`).join('')}</div>${loading ? `<span class="muted small">${esc(t('Loading the sources…'))}</span>` : ''}</div>`
    + (list.length ? `<div class="grid">${known.map(card).join('')}</div>${others.length ? `<h3>${esc(t('Other games'))}</h3><div class="grid">${others.map(card).join('')}</div>` : ''}` : `<p class="empty">${esc(t('No game matches your search.'))}</p>`);
}

function srcName(id) { const s = SOURCES.find(x => x.id === id); return s ? t(s.name) : id; }
function itemHtml(it) {
  const head = it.kind === 'issue' ? esc(it.title) : esc(clip(it.text || '', 420));
  const meta = [it.emulator && it.build ? `${it.emulator} · ${it.build}` : it.emulator || it.build, it.gpu, it.cpu, it.os, it.fps && `${it.fps} FPS`, it.version && `v${it.version}`, it.played && `${t('played')} ${it.played}`].filter(Boolean).map(esc).join(' · ');
  const label = it.outcome ? `<span class="pill o-${esc(it.outcome)}">${esc(t(it.outcome))}</span>` : '';
  const url = safeUrl(it.url);
  return `<div class="rep"><div class="who"><span class="tag ${it.forkbay ? 'fb' : ''}">${esc(it.forkbay ? t('Sent from Forkbay') : srcName(it.src))}</span>${label}<span class="meta">${esc(ago(it.date))}</span></div><div class="what">${head ? `<p>${head}</p>` : ''}${it.kind === 'issue' && it.text ? `<p class="meta">${esc(clip(it.text, 300))}</p>` : ''}${meta ? `<p class="meta">${meta}</p>` : ''}${url ? `<p class="meta"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(t('Open'))} ↗</a></p>` : ''}</div></div>`;
}

function renderGame(slug) {
  const g = GAMES.find(x => x.slug === slug);
  if (!g) return `<a class="back" href="#/">← ${esc(t('All games'))}</a><p class="empty">${esc(Object.values(STATE).some(s => s.state === 'wait') ? t('Loading the sources…') : t('No game matches your search.'))}</p>`;
  const s = gameStats(g);
  const facts = [];
  for (const w of s.its.filter(i => i.kind === 'status')) facts.push(`<div class="card"><h2>${esc(t('Eglantine compatibility page'))}</h2><span class="pill o-${esc(w.outcome)}">${esc(t(w.outcome))}</span> <span class="meta">${esc(w.build)}</span><p class="small">${esc(clip(w.text, 360))}</p><p class="meta"><a href="${esc(safeUrl(w.url))}" target="_blank" rel="noopener">${esc(t('Open'))} ↗</a></p></div>`);
  for (const p of s.its.filter(i => i.kind === 'pick')) facts.push(`<div class="card"><h2>${esc(t('wichforks guide pick'))}${p.game !== g.name ? ` <span class="meta">(${esc(p.game)})</span>` : ''}</h2><p><b>${esc(p.pick)}</b></p>${p.also && p.also !== 'None' ? `<p class="small">${esc(t('Also try'))}${LANG === 'fr' ? ' : ' : ': '}${esc(p.also)}</p>` : ''}<p class="meta">${esc(p.text)}</p></div>`);
  if (g.lichii) facts.push(`<div class="card"><h2>${esc(t('Lichii reports'))}</h2><p class="small muted">${esc(t('The Lichii site does not let other pages read its reports yet. Forkbay reads them directly.'))}</p><p><a class="btn" href="https://lichii.zortos.me/games/${encodeURIComponent(g.lichii)}" target="_blank" rel="noopener">${esc(t('Open the reports on the Lichii site'))} ↗</a></p></div>`);
  for (const n of s.its.filter(i => i.kind === 'native')) facts.push(`<div class="card"><h2>${esc(t('Native port (nxnative)'))}</h2><p class="small muted">${esc(t('Mac, iPhone and iPad: the game runs natively, not in an emulator.'))}</p><p><a href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener">${esc(t('Open its profile'))} ↗</a></p></div>`);
  let reps = s.its.filter(i => i.kind === 'report').sort((a, b) => (b.date || 0) - (a.date || 0));
  const srcs = [...new Set(reps.map(r => r.src))], emus = [...new Set(reps.map(r => r.emulator).filter(Boolean))].sort();
  if (FSRC) reps = reps.filter(r => r.src === FSRC);
  if (FEMU) reps = reps.filter(r => r.emulator === FEMU);
  const issues = s.its.filter(i => i.kind === 'issue').sort((a, b) => (a.outcome === 'Fixed') - (b.outcome === 'Fixed') || (b.date || 0) - (a.date || 0));
  const reportUrl = newReportUrl(g);
  return `<a class="back" href="#/">← ${esc(t('All games'))}</a>
  <div class="row-head"><h1>${esc(g.name)}</h1><p class="meta">${(g.ids || []).length ? `${esc(t('program id'))} ${g.ids.map(esc).join(', ')}` : ''}</p>${barHtml(counts(s.reports))}<p class="cta"><a class="btn primary" href="${esc(reportUrl)}" target="_blank" rel="noopener">${esc(t('Report this game'))}</a></p></div>
  ${facts.length ? `<h3>${esc(t('Status per source'))}</h3><div class="facts">${facts.join('')}</div>` : ''}
  <h3>${esc(t('Reports'))} · ${reps.length}</h3>
  <div class="tools"><select id="fsrc"><option value="">${esc(t('All sources'))}</option>${srcs.map(x => `<option value="${esc(x)}" ${FSRC === x ? 'selected' : ''}>${esc(srcName(x))}</option>`).join('')}</select><select id="femu"><option value="">${esc(t('All emulators'))}</option>${emus.map(x => `<option ${FEMU === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
  <div class="card">${reps.length ? reps.slice(0, 200).map(itemHtml).join('') : `<p class="empty">${esc(t('No report yet for this game.'))}</p>`}</div>
  <h3>${esc(t('Known problems'))} · ${issues.filter(i => i.outcome === 'Problem').length}</h3>
  <div class="card">${issues.length ? issues.slice(0, 200).map(itemHtml).join('') : `<p class="empty">${esc(t('No open problem reported.'))}</p>`}</div>`;
}

// GitHub fills the form from the address: each field by its id.
function newReportUrl(g) {
  const p = new URLSearchParams({ template: 'report.yml' });
  if (g) { p.set('title', `[Report] ${g.name}`); p.set('game', g.name); if ((g.ids || [])[0]) p.set('title_id', g.ids[0]); }
  return `https://github.com/${REPO}/issues/new?${p}`;
}

function route() {
  const m = location.hash.match(/^#\/game\/([a-z0-9-]+)$/);
  const focus = document.activeElement && document.activeElement.id === 'q';
  $('view').innerHTML = m ? renderGame(m[1]) : renderList();
  for (const b of document.querySelectorAll('.bar span[data-w]')) b.style.width = b.dataset.w + '%';
  if (focus && $('q')) { const q = $('q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}

function applyLang() {
  document.documentElement.lang = LANG;
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const b of $('lang').querySelectorAll('button')) b.classList.toggle('on', b.dataset.l === LANG);
  $('newReport').href = newReportUrl(null);
  renderSources();
}

document.addEventListener('input', e => { if (e.target.id === 'q') { Q = e.target.value; route(); } });
document.addEventListener('change', e => {
  if (e.target.id === 'fsrc') { FSRC = e.target.value; route(); }
  if (e.target.id === 'femu') { FEMU = e.target.value; route(); }
});
document.addEventListener('click', e => {
  const s = e.target.closest('#sort button');
  if (s) { SORT = s.dataset.k; try { localStorage.setItem('sort', SORT); } catch (x) { /* blocked */ } route(); }
  const l = e.target.closest('#lang button');
  if (l) { LANG = l.dataset.l; try { localStorage.setItem('lang', LANG); } catch (x) { /* blocked */ } applyLang(); route(); }
});
window.addEventListener('hashchange', () => { FSRC = ''; FEMU = ''; route(); window.scrollTo(0, 0); });

applyLang();
route();
loadAll();
