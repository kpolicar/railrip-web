/**
 * RailRip SPA Builder
 * Combines all HTML pages into a single index.html with a hash-based router.
 * Usage: node app/build.js
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = __dirname;
const ROOT_DIR = path.resolve(SRC_DIR, '..');
const OUT = path.join(ROOT_DIR, 'index.html');
const ENV_PATH = path.join(ROOT_DIR, '.env');

function readEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function escapeForSingleQuotedScript(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const envFile = readEnvFromFile(ENV_PATH);
const CLERK_PUBLISHABLE_KEY = (
  process.env.RAILRIP_CLERK_PUBLISHABLE_KEY ||
  envFile.RAILRIP_CLERK_PUBLISHABLE_KEY ||
  ''
).trim();

// Pages: [source file, page id, title]
const PAGES = [
  ['home.html',     'home',     'RailRip — Anticheat Bypass as a Service'],
  ['register.html', 'register', 'Create Account — RailRip'],
  ['login.html',    'login',    'Sign In — RailRip'],
  ['tos.html',      'tos',      'Terms of Service — RailRip'],
  ['privacy.html',  'privacy',  'Privacy Policy — RailRip'],
  ['docs.html',     'restricted','Restricted — RailRip'],
];

// ── helpers ──────────────────────────────────────────────────────────────────

function between(html, open, close) {
  const s = html.indexOf(open);
  const e = html.lastIndexOf(close);
  return (s === -1 || e === -1) ? '' : html.slice(s + open.length, e);
}

function extractAll(html, re) {
  const out = [];
  let m;
  const r = new RegExp(re.source, re.flags);
  while ((m = r.exec(html)) !== null) out.push(m[1]);
  return out.join('\n');
}

/**
 * Scope all CSS selectors in `css` under `prefix` (e.g. ".page-register").
 * Handles @media, @keyframes, @font-face, :root, and plain rules.
 * Skips @keyframes bodies and @font-face (they are global by nature).
 */
function scopeAllCSS(css, prefix) {
  const lines = [];
  let depth = 0;           // brace depth
  let inKeyframes = false; // inside @keyframes — don't prefix
  let inFontFace  = false; // inside @font-face — don't prefix
  let inMedia     = false; // inside @media — prefix inner selectors
  let mediaHeader = '';
  let mediaBody   = '';

  // Tokenise into rule-chunks by tracking braces
  // We'll work character-by-character to track depth accurately
  let i = 0;
  const out = [];
  let buf = '';

  function flushRule(rule) {
    rule = rule.trim();
    if (!rule) return;

    // @keyframes — keep verbatim
    if (/^@keyframes\b/i.test(rule) || /^@-webkit-keyframes\b/i.test(rule)) {
      out.push(rule);
      return;
    }
    // @font-face — keep verbatim
    if (/^@font-face\b/i.test(rule)) {
      out.push(rule);
      return;
    }
    // @media / @supports — recurse into their bodies
    const mediaMatch = rule.match(/^(@(?:media|supports)[^{]*)\{([\s\S]*)\}\s*$/);
    if (mediaMatch) {
      const inner = scopeAllCSS(mediaMatch[2], prefix);
      out.push(`${mediaMatch[1]}{${inner}}`);
      return;
    }
    // :root — keep as-is (CSS vars should stay global)
    if (/^:root\s*\{/.test(rule)) {
      out.push(rule);
      return;
    }
    // *, *::before, *::after reset — scope it
    // Regular rule: "selector { ... }"
    const braceIdx = rule.indexOf('{');
    if (braceIdx === -1) { out.push(rule); return; }

    const selPart  = rule.slice(0, braceIdx).trim();
    const bodyPart = rule.slice(braceIdx);

    // Split compound selectors by comma, prefix each
    const selectors = selPart.split(',').map(sel => {
      sel = sel.trim();
      if (!sel) return '';
      // Already prefixed or is a keyframe %
      if (sel.startsWith(prefix) || /^\d|^(from|to|[\d.]+%)/.test(sel)) return sel;
      // `html` selector — just drop it (use :root for vars) or skip
      if (sel === 'html') return 'html';
      // `body` → prefix directly
      if (sel === 'body' || sel.startsWith('body ') || sel.startsWith('body.') || sel.startsWith('body:')) {
        return sel.replace(/^body/, prefix);
      }
      return `${prefix} ${sel}`;
    }).filter(Boolean);

    out.push(`${selectors.join(', ')} ${bodyPart}`);
  }

  // Strip CSS block comments before tokenising to avoid them leaking into selectors
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // Parse properly by extracting top-level blocks
  // Strategy: find each top-level rule (everything between top-level `{...}`)
  const topRules = [];
  let d = 0;
  let start = 0;
  for (let ci = 0; ci < css.length; ci++) {
    if (css[ci] === '{') d++;
    else if (css[ci] === '}') {
      d--;
      if (d === 0) {
        topRules.push(css.slice(start, ci + 1).trim());
        start = ci + 1;
      }
    }
  }

  topRules.forEach(flushRule);
  return out.join('\n');
}

// ── collect styles & bodies ───────────────────────────────────────────────────

let mergedStyles = '';
let pageBlocks   = '';
let allScripts   = '';

for (const [file, id, title] of PAGES) {
  const src = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');

  // --- styles ---
  let styles = extractAll(src, /<style>([\s\S]*?)<\/style>/gi);
  if (id !== 'home') {
    styles = scopeAllCSS(styles, `.page-${id}`);
  }
  mergedStyles += `\n/* ====== ${file} ====== */\n${styles}\n`;

  // --- body content (strip inline scripts — they're consolidated below) ---
  const body = between(src, '<body>', '</body>')
    .trim()
    .replace(/<script>([\s\S]*?)<\/script>/gi, '')
    .trim();

  if (id === 'home') {
    // Home page is the default — visible, no wrapper class needed for body layout
    pageBlocks += `
<div id="page-home" class="spa-page" data-title="${title}">
${body}
</div>\n`;
  } else {
    pageBlocks += `
<div id="page-${id}" class="spa-page page-${id}" data-title="${title}" style="display:none">
${body}
</div>\n`;
  }

  // --- scripts (inline only) ---
  const scripts = extractAll(src, /<script>([\s\S]*?)<\/script>/gi);
  if (scripts.trim()) {
    allScripts += `\n// ====== ${file} ======\n${scripts}\n`;
  }
}

// ── SPA router ────────────────────────────────────────────────────────────────

const router = `
(function() {
  // ---- Router ----
  const pages = document.querySelectorAll('.spa-page');
  const titleMap = {};
  pages.forEach(p => { titleMap[p.id] = p.dataset.title || 'RailRip'; });

  window.showPage = function(id) {
    const fullId = 'page-' + id;
    pages.forEach(p => { p.style.display = p.id === fullId ? '' : 'none'; });
    document.title = titleMap[fullId] || 'RailRip';
    history.pushState({ page: id }, '', id === 'home' ? '/' : '#' + id);
    window.scrollTo(0, 0);

    // Re-fire intersection observers for home page reveals
    if (id === 'home') {
      document.querySelectorAll('#page-home .reveal, #page-home .reveal-left, #page-home .reveal-right, #page-home .reveal-scale').forEach(el => {
        el.classList.remove('visible');
        revealObserver.observe(el);
      });
    }
  };

  window.addEventListener('popstate', e => {
    showPage((e.state && e.state.page) || 'home');
  });

  // Initial routing from URL hash
  const hash = window.location.hash.replace('#', '');
  if (hash && document.getElementById('page-' + hash)) {
    showPage(hash);
  }
})();
`;

// ── patch internal links ──────────────────────────────────────────────────────
// We'll handle link patching in the output HTML via the build substitutions below.

// ── build head from index.html ────────────────────────────────────────────────

const indexSrc = fs.readFileSync(path.join(SRC_DIR, 'home.html'), 'utf8');
let head = between(indexSrc, '<head>', '</head>');
head = head.replace(/<style>[\s\S]*?<\/style>/gi, ''); // strip inline style (merged separately)
head = head.replace(/<title>.*?<\/title>/i, '<title>RailRip — Anticheat Bypass as a Service | Game Hack, Exploit &amp; Bot Platform</title>');

// ── assemble ──────────────────────────────────────────────────────────────────

let html = `<!DOCTYPE html>
<html lang="en">
<head>
${head.trim()}
<style>
/* ============================================================
   SPA shell — hide inactive pages, give sub-pages full height
   ============================================================ */
.spa-page { min-height: 100vh; }
${mergedStyles}
</style>
</head>
<body>
${pageBlocks}
<script>
window.RAILRIP_CLERK_PUBLISHABLE_KEY = '${escapeForSingleQuotedScript(CLERK_PUBLISHABLE_KEY)}';

${allScripts}
${router}
</script>
</body>
</html>`;

// ── patch cross-page hrefs ────────────────────────────────────────────────────
// Replace href="page.html" → href="#page" / onclick="showPage('page');return false"
const LINK_MAP = {
  'register.html': 'register',
  'login.html':    'login',
  'tos.html':      'tos',
  'privacy.html':  'privacy',
  'docs.html':     'restricted',
  'index.html':    'home',
};

const rAll = (str, find, rep) => str.split(find).join(rep);
for (const [from, to] of Object.entries(LINK_MAP)) {
  html = rAll(html, `href="${from}"`, `href="#${to}" onclick="showPage('${to}');return false"`);
  html = rAll(html, `href="${from}#`, `href="#${to}" onclick="showPage('${to}');return false" data-anchor="`);
}

// ── patch footer/pricing/nav 403-gated links ──────────────────────────────────
// Discord, Contact, API Reference links in footer and nav → restricted page
html = html.replace(
  /<a href="#">(Discord|Contact|API Reference)<\/a>/g,
  `<a href="#restricted" onclick="showPage('restricted');return false">$1</a>`
);
// Enterprise "Contact Us" button 
html = html.replace(
  /(<button class="plan-btn btn-ghost">)Contact Us(<\/button>)/,
  `<button class="plan-btn btn-ghost" onclick="showPage('restricted')">Contact Us</button>`
);
// Free tier "Get Started" button → register
html = html.replace(
  /(<button class="plan-btn btn-ghost">)Get Started(<\/button>)/,
  `<button class="plan-btn btn-ghost" onclick="showPage('register')">Get Started</button>`
);
// Standard "Load Balance" button → register
html = html.replace(
  /(<button class="plan-btn btn-accent">)Load Balance →(<\/button>)/,
  `<button class="plan-btn btn-accent" onclick="showPage('register')">Load Balance →</button>`
);
// Hero "Start for Free" button
html = html.replace(
  /onclick="document\.getElementById\('pricing'\)\.scrollIntoView/g,
  `onclick="document.getElementById('pricing') && document.getElementById('pricing').scrollIntoView`
);

// ── register page: remove free trial wording ──────────────────────────────────
html = html.replace(/Start your free trial — no charge required to get started\./g,
  'Create your account to get started.');
html = html.replace(/Free trial — no charge today/g, 'Account activated');
html = html.replace(/Your card is saved for future billing\. You won't be charged today\./g,
  'Your card details are saved for future billing.');
html = html.replace(/ You get 1,000 API requests per hour at no cost\. Your card is only charged if you load balance manually\./g,
  ' You get 1,000 API requests per hour on the free tier.');
html = html.replace(/<h1>Activate free trial<\/h1>/, '<h1>Add payment details</h1>');
html = html.replace(/Register &amp; activate free trial/g, 'Register');
html = html.replace(/Your RailRip account is active\. Your free trial starts now — 1,000 requests per hour, no charge\./g,
  'Your RailRip account is active. You have 1,000 requests per hour on the free tier.');
html = html.replace(/No card charge until you upgrade — your free tier activates immediately\./g,
  'Your free tier activates immediately.');
// Remove "Cancel anytime" fine print sentence
html = html.replace(/\s*<a href="#">Cancel anytime<\/a>\./g, '');
html = html.replace(/You will not be billed until you manually load balance\./g, '');

// ── login page: remove forgot password ───────────────────────────────────────
html = html.replace(
  /<a href="#" class="forgot-link">Forgot password\?<\/a>/g, ''
);
// Remove the now-empty field-row div if it only has remember-me left
// (leave remember-me checkbox, just remove the forgot-password link)

// ── docs/restricted page: generic message ─────────────────────────────────────
html = html.replace(
  /The <strong>RailRip API documentation<\/strong> is exclusively available to active subscribers\.\s*Upgrade your plan to unlock full technical documentation, code samples, and integration guides\./,
  'This page is restricted to paying customers. Please upgrade your plan to gain access.'
);
html = html.replace(/Documentation is for paying customers only/,
  'This page is restricted to paying customers');

// ── write output ──────────────────────────────────────────────────────────────
fs.writeFileSync(OUT, html, 'utf8');
console.log(`✓ Built SPA → ${OUT}  (${(html.length / 1024).toFixed(1)} KB)`);
