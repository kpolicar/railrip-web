# RailRip — Anticheat Bypass as a Service

Landing page and auth flow for **RailRip**, a SaaS product that provides an anticheat bypass API for cheat developers.

---

## What is RailRip?

RailRip is an API-based service that allows cheat developers to ship fully undetectable cheats to end users. The architecture (based on a university thesis by Klemen Janez Poličar) works as follows:

```
User's Machine                    RailRip Cloud              Game Server
(game + TightVNC server + EAC) ←→ (cheat software +      ←→ (all traffic
                                   TightVNC client +          rerouted via
                                   VPN endpoint +             RailRip)
                                   packet sniffer)
```

The cheat logic runs entirely on RailRip's cloud infrastructure and never touches the end user's machine. The user runs only a legitimate VNC client. Because no illegitimate software runs locally, anticheats (like EasyAntiCheat) cannot detect it.

The API exposes:
- **Packet stream** — raw game network packets, intercepted in real time
- **Video/image stream** — the game's visual output for computer vision processing
- **Audio stream** — game audio for sound-based event detection
- **Input injection** — mouse and keyboard commands sent back to the user's game client

---

## Pages

| Page | Route | Description |
|---|---|---|
| Landing | `#home` | Full marketing page — hero, architecture diagram, how it works, use cases, demo, pricing |
| Register | `#register` | 2-step account creation: details → card |
| Login | `#login` | Login form (always returns "invalid credentials") |
| Terms of Service | `#tos` | European-compliant ToS |
| Privacy Policy | `#privacy` | GDPR-compliant privacy policy |
| Restricted (403) | `#restricted` | Paywall gate for docs, Discord, API reference, Contact |

---

## Project structure

```
railrip/
├── index.html          ← compiled SPA output (do not edit directly)
├── home.html           ← home page source
├── build.js            ← SPA builder script (Node.js, no dependencies)
├── register.html       ← register page source
├── login.html          ← login page source
├── tos.html            ← terms of service source
├── privacy.html        ← privacy policy source
├── docs.html           ← restricted/403 page source
└── README.md
```

---

## Building

The site is a **single-page application** compiled from the individual HTML source files. There are no npm dependencies — just Node.js.

```bash
node build.js
```

This produces `index.html` (~156 KB), a fully self-contained SPA with:
- All pages embedded as `<div id="page-X" class="spa-page">` blocks
- All `<style>` blocks merged into a single `<head>` (per-page body styles are scoped to avoid bleed)
- All inline `<script>` blocks wrapped in IIFEs and concatenated
- A hash-based client-side router (`showPage('name')` / `#name` URLs)
- `history.pushState` for clean back/forward navigation

### What the build patches automatically

| Source | Patch |
|---|---|
| `href="page.html"` | → `onclick="showPage('page')"` |
| Footer: Discord, API Reference, Contact | → `showPage('restricted')` |
| Nav: Docs | → `showPage('restricted')` |
| Pricing: Enterprise "Contact Us" button | → `showPage('restricted')` |
| Register: free trial wording | → removed |
| Register: "Cancel anytime" | → removed |
| Register: step 2 button | → "Register" |
| Login: "Forgot password?" link | → removed |
| Restricted page description | → generic "restricted to paying customers" |

### Re-running the build

The build reads from source files (`home.html`, `register.html`, etc.), so it is **safely re-runnable** — it will not read its own output as input.

To update a page, edit its source file (e.g. `register.html`) then run `node build.js`.

---

## Tech stack

- Pure HTML / CSS / JavaScript — no framework, no build tools beyond the one-file build script
- **Font:** Plus Jakarta Sans (Google Fonts) + JetBrains Mono for code blocks
- **Icons:** Font Awesome 6.5.0 Free (CDN)
- **Canvas demo:** top-down game animation on `<canvas>` with `devicePixelRatio` scaling, animated player, trail particles, and an automated RailRip cursor that redirects the character every 3.5 seconds
- **Architecture diagram:** CSS-only, no external libraries

---

## How this project was created

This project was generated almost entirely through **GitHub Copilot (Claude Sonnet 4.6)** in VS Code, via a multi-session conversation. The full generation process:

1. **Initial build** — a complete ~2,200-line landing page was generated from a brief description of the product concept. Sections included: animated train banner, hero, architecture diagram, how it works, use cases, live canvas demo, case study (oryxbot.com), and pricing.

2. **Architecture correction** — the architecture diagram was corrected after Copilot read `how-it-works.md` (a Slovenian university thesis by Klemen Janez Poličar on bypassing anticheats via VNC + VPN). The original (wrong) diagram had the game client running on the cloud; it was corrected to the actual setup.

3. **Visual polish** — Windows 11-style app chrome added to the canvas demo, animated RailRip cursor label, oryxbot.com hero image for the case study section.

4. **Design system upgrade** — replaced all emoji/ASCII icons with Font Awesome 6.5.0, switched font from Inter to Plus Jakarta Sans, highlighted "anticheat bypass as a service" in the hero, fixed incorrect copy ("executes alongside the game client" → runs on separate infrastructure).

5. **Additional pages** — `register.html` (2-step sliding form), `login.html` (always returns invalid credentials), `docs.html` (403 paywall), `tos.html` (European ToS), `privacy.html` (GDPR policy) — all generated by Copilot.

6. **SPA conversion** — all pages combined into a single `index.html` via a generated `build.js` Node script with a hash-based router, scoped CSS merging, and automatic link patching.
