import './style.css';
import { checkForUpdate, updatesEnabled } from './app/update';
import { Tutorial } from './tutorial/tutorial';
import { GAME_TABS, type GameTab, type TourDemo } from './tutorial/lessons';
import { pickSkin, resolveTheme, modeFor, SKINS, SKIN_LABELS, SKIN_MODES, type SkinId } from './theme/skins';
import { PokerTab } from './ui/poker';
import { BlackjackTab } from './ui/blackjack';
import { KuhnTab } from './ui/kuhn';
import { VideoPokerTab } from './ui/vpoker';
import { GinTab } from './ui/gin';
import { CribbageTab } from './ui/cribbage';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- error boundary ----------
// Any uncaught error shows a banner with a way out instead of a silently dead page.
function showError(msg: string) {
  const el = $('error-banner');
  el.innerHTML = '';
  el.append(`Something went wrong: ${msg} `);
  const reload = document.createElement('button');
  reload.textContent = 'Reload';
  reload.onclick = () => location.reload();
  const dismiss = document.createElement('button');
  dismiss.textContent = 'Dismiss';
  dismiss.onclick = () => el.classList.add('hidden');
  el.append(reload, dismiss);
  el.classList.remove('hidden');
}
window.addEventListener('error', (e) => showError(e.message || 'unknown error'));
window.addEventListener('unhandledrejection', (e) => showError(String((e.reason as Error)?.message ?? e.reason)));


// ---------- status lines ----------
const statusOf = (id: string) => (text: string, kind: '' | 'ok' | 'bad' | 'thinking' = '') => {
  const el = $(id);
  el.textContent = text;
  el.className = `status ${kind}`;
};

// ---------- the games ----------
const poker = new PokerTab(statusOf('pk-status'));
const blackjack = new BlackjackTab(statusOf('bj-status'));
const kuhn = new KuhnTab(statusOf('ku-status'));
const vpoker = new VideoPokerTab(statusOf('vp-status'));
const gin = new GinTab(statusOf('gn-status'));
const cribbage = new CribbageTab(statusOf('cb-status'));
type Tab = GameTab;
const TAB_KEY = 'card-solver-tab';
const savedTab = localStorage.getItem(TAB_KEY);
let tab: Tab = (GAME_TABS as readonly string[]).includes(savedTab ?? '') ? savedTab as Tab : 'poker';
function showTab(t: Tab, remember = true) {
  tab = t;
  if (remember) localStorage.setItem(TAB_KEY, t);
  for (const x of GAME_TABS) {
    $(x).classList.toggle('hidden', x !== t);
    const b = $(`tab-${x}`);
    b.setAttribute('aria-selected', String(x === t));
    b.tabIndex = x === t ? 0 : -1;
  }
}
for (const x of GAME_TABS) $(`tab-${x}`).onclick = () => showTab(x);
$('tabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const i = GAME_TABS.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1);
  showTab(GAME_TABS[(i + GAME_TABS.length) % GAME_TABS.length]);
  $(`tab-${tab}`).focus();
});
showTab(tab, false);

// ---------- tour examples ----------
// Each example changes the app only for the step; everything (cards, range, rules,
// the trainer hand and the shoe, every tab's cards, the tab) is put back exactly afterwards.
let tourHome: Tab | null = null;
const snap = () => ({ tab, poker: poker.snapshot(), bj: blackjack.snapshot(), kuhn: kuhn.snapshot(), vp: vpoker.snapshot(), gin: gin.snapshot(), crib: cribbage.snapshot() });
let demoSaved: ReturnType<typeof snap> | null = null;
function tourDemo(id: TourDemo | null) {
  if (!id) {
    if (demoSaved) {
      const d = demoSaved; demoSaved = null;
      poker.restore(d.poker); poker.save();
      blackjack.restore(d.bj); blackjack.save();
      kuhn.restore(d.kuhn); kuhn.save();
      vpoker.restore(d.vp); vpoker.save();
      gin.restore(d.gin); gin.save();
      cribbage.restore(d.crib); cribbage.save();
      ($('i18') as HTMLDetailsElement).open = false;
    }
    return;
  }
  demoSaved ??= snap();
  if (['deal', 'range', 'equity', 'decide', 'theory', 'chart'].includes(id)) poker.demo(id);
  else if (id.startsWith('ku-')) kuhn.demo(id);
  else if (id.startsWith('vp-')) vpoker.demo(id);
  else if (id.startsWith('gn-')) gin.demo(id);
  else if (id.startsWith('cb-')) cribbage.demo(id);
  else blackjack.demo(id);
}

// ---------- dialogs ----------
const helpDialog = $<HTMLDialogElement>('help-dialog');
$('help').onclick = () => helpDialog.showModal();
$('help-close').onclick = () => helpDialog.close();

// ---------- tutorial ----------
const tutorial = new Tutorial({
  onFinish: () => {},
  showTab: (t) => showTab(t, false),
  demo: tourDemo,
  tourOpen: (open) => {
    if (open) tourHome ??= tab;
    else if (tourHome) { showTab(tourHome, false); tourHome = null; }
  },
});
const tutDialog = $<HTMLDialogElement>('tutorial-dialog');
const openTutorial = () => { $('tut-summary').textContent = tutorial.summary(); tutDialog.showModal(); };
const fromMenu = (fn: () => void) => () => { tutDialog.close(); fn(); };
$('tutorial').onclick = openTutorial;
$('tour').onclick = () => { helpDialog.close(); openTutorial(); };
$('tut-lessons').onclick = fromMenu(() => tutorial.startLessons());
$('tut-restart').onclick = fromMenu(() => tutorial.startLessons(0));
$('tut-tour').onclick = fromMenu(() => tutorial.startTour());
$('tut-tour-restart').onclick = fromMenu(() => tutorial.startTour(0));
$('tut-reset').onclick = () => { tutorial.resetProgress(); $('tut-summary').textContent = tutorial.summary(); };
$('tut-close').onclick = () => tutDialog.close();

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  if (tutorial.busy || document.querySelector('dialog[open]')) return;
  const t = e.target as HTMLElement;
  if (t.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '?') { e.preventDefault(); helpDialog.showModal(); return; }
  const n = Number(e.key);
  if (Number.isInteger(n) && n >= 1 && n <= GAME_TABS.length && !t.closest('#table-card')) { showTab(GAME_TABS[n - 1]); return; }
  const games = { poker, blackjack, kuhn, vpoker, gin, cribbage };
  const handled = games[tab].onKey(e);
  if (handled) e.preventDefault();
});

// ---------- theme and skin ----------
// A skin (matte by default) plus light/dark, which follows the computer (System) until the player picks one.
let skin: SkinId = pickSkin(location.search, localStorage.getItem('card-solver-skin'));
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const savedMode = localStorage.getItem('card-solver-theme');
  const t = modeFor(skin, resolveTheme(savedMode, darkQuery.matches));
  document.documentElement.dataset.skin = skin;
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  const mode = savedMode === 'light' || savedMode === 'dark' ? savedMode : 'system';
  const single = SKIN_MODES[skin].length === 1;
  document.querySelectorAll<HTMLButtonElement>('#theme-skins button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.skin === skin)));
  document.querySelectorAll<HTMLButtonElement>('#theme-modes button').forEach((b) => {
    b.disabled = single;
    b.setAttribute('aria-checked', String(b.dataset.mode === mode));
  });
  $('theme-mode-note').textContent = single ? `${SKIN_LABELS[skin]} has a ${SKIN_MODES[skin][0]} look only.` : mode === 'system' ? `Following your computer: ${t}.` : '';
}
for (const id of SKINS) {
  const b = document.createElement('button');
  b.className = 'skin-card';
  b.dataset.skin = id;
  b.setAttribute('role', 'radio');
  b.innerHTML = `<span class="skin-preview" data-preview="${id}" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>${SKIN_LABELS[id]}</span>`;
  b.onclick = () => { skin = id; localStorage.setItem('card-solver-skin', id); applyTheme(); };
  $('theme-skins').append(b);
}
document.querySelectorAll<HTMLButtonElement>('#theme-modes button').forEach((b) => {
  b.onclick = () => {
    if (b.dataset.mode === 'system') localStorage.removeItem('card-solver-theme');
    else localStorage.setItem('card-solver-theme', b.dataset.mode!);
    applyTheme();
  };
});
darkQuery.addEventListener('change', applyTheme);
applyTheme();
// Settings: theme, light/dark, updates (desktop only) and About in one dialog.
const settingsDialog = $<HTMLDialogElement>('settings-dialog');
const openSettings = () => settingsDialog.showModal();
$('settings').onclick = openSettings;
$('help-appearance').onclick = () => { helpDialog.close(); openSettings(); };
$('settings-close').onclick = () => settingsDialog.close();
settingsDialog.addEventListener('click', (e) => { if (e.target === settingsDialog) settingsDialog.close(); });
for (const d of [helpDialog, tutDialog]) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });

// ---------- update check (desktop app only) ----------
async function runUpdateCheck(manual: boolean) {
  if (manual) $('update-msg').textContent = 'Checking…';
  const r = await checkForUpdate(__APP_VERSION__);
  const el = $('update-banner');
  if (r.kind === 'available') {
    el.innerHTML = `Card Solver ${r.latest} is out. `;
    const a = document.createElement('a');
    a.href = r.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Download';
    a.onclick = (ev) => { ev.preventDefault(); void openExternal(r.url); };
    el.append(a);
    el.classList.remove('hidden');
    $('update-msg').textContent = `Version ${r.latest} is available.`;
  } else if (manual) {
    $('update-msg').textContent = r.kind === 'current' ? `Up to date (v${__APP_VERSION__}).` : `Could not check: ${r.message}.`;
  }
}
async function openExternal(url: string) {
  if ('__TAURI_INTERNALS__' in window) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else window.open(url, '_blank', 'noopener');
}
if (updatesEnabled(window)) {
  $('check-update').onclick = () => void runUpdateCheck(true);
  if (import.meta.env.PROD) setTimeout(() => void runUpdateCheck(false), 3000);
} else {
  // Web/PWA: always the latest version, so no Updates section, banner or check.
  $('updates-section').remove();
  $('update-banner').remove();
  $('settings').setAttribute('aria-label', 'Settings: theme and about');
}
$('version').textContent = `v${__APP_VERSION__}`;

// ---------- start ----------
tutorial.offer($('onboarding'));

// Offline support when served as a PWA (not in dev, not inside Tauri).
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http') && !('__TAURI_INTERNALS__' in window)) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
} else if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
}

// Dev-only handle for browser checks.
if (import.meta.env.DEV) (window as unknown as { __app: object }).__app = { poker, blackjack, kuhn, vpoker, gin, cribbage };
