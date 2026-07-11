/* Hibern8 Ctrl+Space Lite — minimal: hibernate tabs/windows, see audio & active tabs, estimate savings.
   Firefox-compatible alias. No background tracking, no stored settings, one permission (tabs). */
var chrome = (typeof browser !== "undefined") ? browser : globalThis.chrome;

const $ = (id) => document.getElementById(id);
let selfId = null;
let selfWin = null;
let accentHue = null;   // 0-360 (null = default neon blue)
let accentSat = null;   // 0-100 (null = default; 0 = greyscale)

const EST_MB_PER_TAB = 220; // rough per-tab footprint freed by discard (illustrative)
const EST_W_PER_TAB = 0.5;  // rough per-tab power draw avoided (illustrative)

function host(t) { try { return new URL(t.url).hostname.replace(/^www\./, ""); } catch (e) { return t.url || ""; } }
function esc(s) { return String(s).replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c])); }

// Injection watchdog: the CSP blocks any inline/remote script; if one is attempted the browser
// fires 'securitypolicyviolation'. Lite has no notifications permission, so we warn the user with
// an in-panel banner (and log to the console) and prompt an antivirus scan.
document.addEventListener("securitypolicyviolation", (e) => {
  try {
    const dir = e.effectiveDirective || e.violatedDirective || "";
    if (dir && !/script|object|frame|default|worker/.test(dir)) return;
    const blocked = String(e.blockedURI || "inline script").slice(0, 160);
    const source = String(e.sourceFile || location.href).slice(0, 160);
    let b = document.getElementById("secBanner");
    if (!b) {
      b = document.createElement("div"); b.id = "secBanner";
      b.style.cssText = "position:sticky;top:0;z-index:70;background:#5a1616;color:#ffdede;border-bottom:2px solid #e5534b;padding:9px 14px;font-size:12.5px;font-weight:600;line-height:1.4";
      document.body.prepend(b);
    }
    b.textContent = `⚠ Hibern8 blocked a script-injection attempt (${blocked}) from ${source}. Nothing was executed. As a precaution, please run your antivirus / security scan.`;
    b.hidden = false;
    try { console.error("Hibern8 Ctrl+Space Lite blocked a script-injection attempt:", { blocked, source, directive: dir }); } catch (e2) {}
  } catch (e3) {}
});
function muted(t) { return !!(t.mutedInfo && t.mutedInfo.muted); }
function isSelf(t) { return t.id === selfId; }
function discardable(t) {
  return !isSelf(t) && !t.active && !t.discarded && !t.pinned && !t.audible && /^https?:\/\//i.test(t.url || "");
}

function mk(label, title, fn) {
  const b = document.createElement("button");
  b.textContent = label; if (title) b.title = title; b.onclick = fn;
  return b;
}
async function act(fn) { try { await fn(); } catch (e) {} render(); }

// Hibernate every discardable tab in one window (spares active, pinned, audio/video).
async function hibernateWindow(winId) {
  let tabs = [];
  try { tabs = await chrome.tabs.query({ windowId: winId }); } catch (e) {}
  for (const t of tabs) { if (discardable(t)) { try { await chrome.tabs.discard(t.id); } catch (e) {} } }
}

function row(t, kind, winLabel) {
  const d = document.createElement("div");
  d.className = "row" + (kind === "audio" ? " audio" : "") + (kind === "active" ? " active" : "") + (kind === "dorm" ? " dorm" : "");
  const tag = winLabel ? `<span class="win">${esc(winLabel)}</span>` : "";
  d.innerHTML = `<span class="t">${esc(t.title || host(t))}</span><span class="h">${esc(host(t))}</span>${tag}`;
  const b = document.createElement("span"); b.className = "b";

  if (kind === "dorm") {
    b.appendChild(mk("Wake", "Wake & reload", () => act(() => chrome.tabs.update(t.id, { active: true }))));
  } else {
    // Go to the tab (focus its window too).
    b.appendChild(mk("Go", "Switch to this tab", () => act(async () => {
      await chrome.tabs.update(t.id, { active: true });
      try { await chrome.windows.update(t.windowId, { focused: true }); } catch (e) {}
    })));
    if (t.audible || muted(t)) {
      b.appendChild(mk(muted(t) ? "🔊" : "🔇", muted(t) ? "Unmute" : "Mute", () => act(() => chrome.tabs.update(t.id, { muted: !muted(t) }))));
    }
    // The active tab can't discard itself; whole-window hibernation is offered in the window header.
    if (!isSelf(t) && !t.active && !t.discarded) {
      b.appendChild(mk("💤", "Hibernate this tab", () => act(() => chrome.tabs.discard(t.id))));
    }
  }
  // Close the tab — available on every line (including hibernated). Never on the Hibern8 panel itself.
  if (!isSelf(t)) {
    const cb = mk("✕", "Close this tab", () => act(() => chrome.tabs.remove(t.id)));
    cb.className = "closebtn";
    b.appendChild(cb);
  }
  d.appendChild(b);
  return d;
}

function sectionEl(title, rows) {
  const frag = document.createDocumentFragment();
  const h = document.createElement("h3"); h.textContent = `${title} (${rows.length})`;
  frag.appendChild(h);
  rows.forEach((r) => frag.appendChild(r));
  return frag;
}

// Header for one window group: title + count + a whole-window hibernate button.
function winHeader(label, count, dormCount, wid, eligible) {
  const h = document.createElement("div"); h.className = "winhead";
  const t = document.createElement("span"); t.className = "winttl";
  t.textContent = `${label} — ${count} tab(s)${dormCount ? ` · ${dormCount} hibernated` : ""}`;
  h.appendChild(t);
  const b = mk("💤 Window", eligible ? "Hibernate the idle tabs in this window" : "No idle tabs to hibernate in this window",
    () => act(() => hibernateWindow(wid)));
  b.className = "btn winhib"; if (!eligible) b.disabled = true;
  h.appendChild(b);
  return h;
}

async function render() {
  let all = [], wins = [];
  try { all = await chrome.tabs.query({}); } catch (e) {}
  try { wins = await chrome.windows.getAll(); } catch (e) {}
  all = all.filter((t) => t.url && !t.url.startsWith(chrome.runtime.getURL("")));

  // Window order: current window first, then the rest (by the browser's window order),
  // then any windows only seen via tabs. This is what makes secondary windows appear.
  const order = [];
  if (selfWin != null) order.push(selfWin);
  wins.forEach((w) => { if (!order.includes(w.id)) order.push(w.id); });
  all.forEach((t) => { if (!order.includes(t.windowId)) order.push(t.windowId); });
  const label = (wid) => `Window ${order.indexOf(wid) + 1}${wid === selfWin ? " · this window" : ""}`;
  const multi = order.length > 1;

  const dorm = all.filter((t) => t.discarded);
  const awakeCount = all.filter((t) => !t.discarded).length;

  // Metrics (across all windows).
  $("counts").textContent = `${order.length} window(s) · ${awakeCount} awake · ${dorm.length} hibernated`;
  $("mHib").textContent = dorm.length;
  $("mAwake").textContent = awakeCount;
  $("mMb").textContent = (dorm.length * EST_MB_PER_TAB).toLocaleString();
  $("mW").textContent = (dorm.length * EST_W_PER_TAB).toFixed(1);

  const frag = document.createDocumentFragment();

  // Audio / video across all windows, pinned to the top (tagged by window when more than one).
  const audio = all.filter((t) => t.audible || muted(t));
  if (audio.length) frag.appendChild(sectionEl("🔊 Audio / Video", audio.map((t) => row(t, "audio", multi ? label(t.windowId) : ""))));

  // Active tabs — the foreground tab of each window — pinned right under Audio / Video for quick reach.
  const actives = all.filter((t) => t.active);
  if (actives.length) frag.appendChild(sectionEl("👁 Active Tabs", actives.map((t) => row(t, "active", multi ? label(t.windowId) : ""))));

  // One group per window — active first, then awake, then hibernated — for EVERY window.
  order.forEach((wid) => {
    const wtabs = all.filter((t) => t.windowId === wid);
    if (!wtabs.length) return;
    const active = wtabs.filter((t) => t.active);
    const awake = wtabs.filter((t) => !t.active && !t.discarded);
    const dormw = wtabs.filter((t) => t.discarded);
    const eligible = wtabs.some((t) => discardable(t));
    frag.appendChild(winHeader(label(wid), wtabs.length, dormw.length, wid, eligible));
    [...active, ...awake, ...dormw].forEach((t) => {
      const kind = t.discarded ? "dorm" : (t.active ? "active" : "awake");
      frag.appendChild(row(t, kind, ""));
    });
  });

  if (!all.length) {
    const e = document.createElement("div"); e.className = "empty"; e.textContent = "No tabs."; frag.appendChild(e);
  }
  $("list").replaceChildren(frag);
}

$("hibAll").onclick = async () => {
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch (e) {}
  for (const t of tabs) { if (discardable(t)) { try { await chrome.tabs.discard(t.id); } catch (e) {} } }
  render();
};
$("muteAll").onclick = async () => {
  let a = [];
  try { a = await chrome.tabs.query({ audible: true }); } catch (e) {}
  for (const t of a) { if (!isSelf(t)) { try { await chrome.tabs.update(t.id, { muted: true }); } catch (e) {} } }
  render();
};
$("refresh").onclick = render;

// Help overlay
const _help = $("helpOverlay");
function showHelp(v) { _help.hidden = !v; if (v) loadShPrefs(); }
$("helpBtn").onclick = () => showHelp(true);
$("helpClose").onclick = () => showHelp(false);
$("helpCloseBtn").onclick = () => showHelp(false);
_help.addEventListener("click", (e) => { if (e.target === _help) showHelp(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") showHelp(false); });

// Safe-Hold: preferences + suspend/release banner
function bg(msg) { return new Promise((res) => { try { chrome.runtime.sendMessage(msg, (r) => res(r || {})); } catch (e) { res({}); } }); }
async function loadShPrefs() {
  try { const r = await chrome.storage.local.get(["shStartup", "shRequireVpn"]); $("shStartup").checked = !!r.shStartup; $("shRequireVpn").checked = !!r.shRequireVpn; } catch (e) {}
}
$("shStartup").onchange = () => { try { chrome.storage.local.set({ shStartup: $("shStartup").checked }); } catch (e) {} };
$("shRequireVpn").onchange = () => { try { chrome.storage.local.set({ shRequireVpn: $("shRequireVpn").checked }); } catch (e) {} };

function shBtn(label, cls, fn) { const b = document.createElement("button"); b.className = "btn " + (cls || ""); b.textContent = label; b.onclick = fn; return b; }
async function shRelease(force) {
  const r = await bg({ type: "sh:release", force: !!force });
  if (r && r.ok) refreshHold(); else if (r && r.reason === "vpn") refreshHold();
  render();
}
async function refreshHold() {
  const note = $("holdNote"); if (!note) return;
  const st = await bg({ type: "sh:get" });
  const sh = (st && st.sh) || { active: false };
  if (!sh.active) { note.hidden = true; return; }
  const held = st.held || sh.held || 0;
  const requireVpn = st.prefs && st.prefs.requireVpn;
  $("holdMsg").innerHTML = `🔒 <b>Traffic held</b> — ${held} tab(s) suspended, downloads paused.`;
  const btns = $("holdBtns"); btns.replaceChildren();
  // VPN presence can't be auto-detected by an extension, so "require VPN" is a manual confirm.
  if (requireVpn) {
    btns.appendChild(shBtn("✓ VPN connected — release", "primary", () => shRelease(true)));
  } else {
    btns.appendChild(shBtn("Release now", "primary", () => shRelease(false)));
  }
  note.hidden = false;
}
$("suspendBtn").onclick = async () => { await bg({ type: "sh:suspend" }); refreshHold(); render(); };
setInterval(refreshHold, 5000);

// Theme: Auto (match system) / Dark / Light. Stored locally; applied by a body class that
// overrides the CSS variables. Auto = no class, so the prefers-color-scheme media query wins.
const _theme = $("themeSel");
function applyTheme(v) {
  document.body.classList.remove("light", "dark");
  if (v === "light" || v === "dark") document.body.classList.add(v);
}
try {
  const tv = localStorage.getItem("hibern8-lite-theme") || "auto";
  if (_theme) _theme.value = tv;
  applyTheme(tv);
} catch (e) { applyTheme("auto"); }
if (_theme) _theme.onchange = () => {
  const v = _theme.value;
  try { localStorage.setItem("hibern8-lite-theme", v); } catch (e) {}
  applyTheme(v);
};

// Color + greyscale: tints the accent and repaints the toolbar icon to match the user's pick.
function drawActionIcon(size, fill) {
  const c = new OffscreenCanvas(size, size), x = c.getContext("2d");
  const r = Math.round(size * 0.22);
  x.clearRect(0, 0, size, size);
  x.beginPath();
  x.moveTo(r, 0);
  x.arcTo(size, 0, size, size, r); x.arcTo(size, size, 0, size, r);
  x.arcTo(0, size, 0, 0, r); x.arcTo(0, 0, size, 0, r);
  x.closePath();
  x.fillStyle = fill; x.fill();
  x.fillStyle = "#0b1020"; x.textAlign = "center"; x.textBaseline = "middle";
  x.font = `bold ${Math.round(size * 0.72)}px Arial`;
  x.fillText("8", size / 2, size / 2 + Math.round(size * 0.06));
  return x.getImageData(0, 0, size, size);
}
function applyAccent() {
  const s = document.body.style;
  if (accentHue == null) {
    s.removeProperty("--accent");
    try { chrome.action.setIcon({ imageData: { 16: drawActionIcon(16, "#1F51FF"), 32: drawActionIcon(32, "#1F51FF") } }); } catch (e) {}
    return;
  }
  const sat = accentSat == null ? 90 : accentSat;   // 0 = greyscale
  s.setProperty("--accent", `hsl(${accentHue} ${sat}% 60%)`);
  try { chrome.action.setIcon({ imageData: { 16: drawActionIcon(16, `hsl(${accentHue} ${sat}% 55%)`), 32: drawActionIcon(32, `hsl(${accentHue} ${sat}% 55%)`) } }); } catch (e) {}
}
const _hue = $("hueSlider"), _sat = $("satSlider");
try { const hv = localStorage.getItem("hibern8-lite-hue"); if (hv) { accentHue = +hv; if (_hue) _hue.value = accentHue; } } catch (e) {}
try { const sv = localStorage.getItem("hibern8-lite-sat"); if (sv && _sat) { accentSat = +sv; _sat.value = accentSat; } } catch (e) {}
if (_hue) _hue.oninput = () => { accentHue = +_hue.value; try { localStorage.setItem("hibern8-lite-hue", String(accentHue)); } catch (e) {} applyAccent(); };
if (_sat) _sat.oninput = () => {
  accentSat = +_sat.value; try { localStorage.setItem("hibern8-lite-sat", String(accentSat)); } catch (e) {}
  if (accentHue == null && _hue) { accentHue = +_hue.value; try { localStorage.setItem("hibern8-lite-hue", String(accentHue)); } catch (e) {} }
  applyAccent();
};
if ($("hueReset")) $("hueReset").onclick = () => {
  accentHue = null; accentSat = null;
  try { localStorage.removeItem("hibern8-lite-hue"); localStorage.removeItem("hibern8-lite-sat"); } catch (e) {}
  if (_sat) _sat.value = 90;
  applyAccent();
};

(async () => {
  try { const s = await chrome.tabs.getCurrent(); selfId = s ? s.id : null; selfWin = s ? s.windowId : null; } catch (e) {}
  applyAccent();
  render();
  refreshHold();
})();