// Hibern8 Ctrl+Space Lite — open (or focus) the panel when the toolbar icon is clicked.
// Firefox-compatible alias (Lite ships a Chromium service worker; see README for the FF swap).
var chrome = (typeof browser !== "undefined") ? browser : globalThis.chrome;

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("lite.html");
  const existing = await chrome.tabs.query({ url });
  if (existing.length) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.windows.update(existing[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});

// First-run prompt: open Hibern8 Ctrl+Space Lite on install. Its header shows the Ctrl+Space shortcut;
// change it at chrome://extensions/shortcuts (Chrome/Edge) or about:addons (Firefox).
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== "install") return;
  try { await chrome.tabs.create({ url: chrome.runtime.getURL("lite.html") }); } catch (e) {}
});

/* ---- Safe-Hold (compact) — hold all page traffic until manual release.
   Optional: engage at startup, require a VPN before releasing. Best-effort
   VPN check (Chromium only). Nothing leaves your device. ---- */
const GATE_RULE_ID = 9042;
const isHttp = (u) => /^https?:\/\//i.test(u || "");
const selfPrefix = () => chrome.runtime.getURL("");

async function prefs() {
  let r = {};
  try { r = await chrome.storage.local.get(["shStartup", "shRequireVpn"]); } catch (e) {}
  return { startup: !!r.shStartup, requireVpn: !!r.shRequireVpn };
}
async function getHold() {
  try { const { sh } = await chrome.storage.session.get("sh"); return sh || { active: false }; }
  catch (e) { try { const { sh } = await chrome.storage.local.get("sh"); return sh || { active: false }; } catch (e2) { return { active: false }; } }
}
async function setHold(sh) {
  try { await chrome.storage.session.set({ sh }); }
  catch (e) { try { await chrome.storage.local.set({ sh }); } catch (e2) {} }
}
// Extensions can't detect a VPN or read network interfaces, so this always returns false;
// "require VPN" is a MANUAL confirmation gate (the user confirms their VPN is up and releases).
async function vpnDetected() { return false; }
async function setGate(on) {
  try {
    if (on) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [GATE_RULE_ID],
        addRules: [{ id: GATE_RULE_ID, priority: 1, action: { type: "block" },
          condition: { regexFilter: "^https?:", resourceTypes: ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "media", "websocket", "csp_report", "other"] } }],
      });
    } else { await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [GATE_RULE_ID] }); }
  } catch (e) {}
}
async function badge(on) {
  try { await chrome.action.setBadgeText({ text: on ? "HOLD" : "" }); await chrome.action.setBadgeBackgroundColor({ color: "#c0392b" }); } catch (e) {}
}
async function outsideTabs() {
  let t = []; try { t = await chrome.tabs.query({}); } catch (e) {}
  return t.filter((x) => isHttp(x.url) && !(x.url || "").startsWith(selfPrefix()));
}
// Pause in-progress downloads so a hold also freezes the file-transfer queue
// (the DNR gate only blocks NEW requests, not bytes already streaming).
async function holdDownloads() {
  const ids = [];
  try {
    if (chrome.downloads && chrome.downloads.search) {
      const items = await chrome.downloads.search({ state: "in_progress" });
      for (const d of items) { if (d.paused) continue; try { await chrome.downloads.pause(d.id); ids.push(d.id); } catch (e) {} }
    }
  } catch (e) {}
  return ids;
}
async function resumeDownloads(ids) {
  if (!chrome.downloads || !chrome.downloads.resume) return;
  for (const id of (ids || [])) { try { await chrome.downloads.resume(id); } catch (e) {} }
}
async function engageHold() {
  const held = (await outsideTabs()).length;
  const dl = await holdDownloads();
  await setHold({ active: true, held, dl });
  await setGate(true);
  for (const t of await outsideTabs()) { if (!t.discarded && !t.active) { try { await chrome.tabs.discard(t.id); } catch (e) {} } }
  await badge(true);
}
async function releaseHold() {
  const sh = await getHold();
  await setHold({ active: false }); await setGate(false);
  await resumeDownloads(sh.dl);
  await badge(false);
}

// While held, pause any newly-started download and remember it.
try {
  if (chrome.downloads && chrome.downloads.onCreated) {
    chrome.downloads.onCreated.addListener(async (d) => {
      const sh = await getHold(); if (!sh.active) return;
      try { await chrome.downloads.pause(d.id); const s = await getHold(); s.dl = [...new Set([...(s.dl || []), d.id])]; await setHold(s); } catch (e) {}
    });
  }
} catch (e) {}

chrome.runtime.onStartup.addListener(async () => { const p = await prefs(); if (p.startup) await engageHold(); });

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const sh = await getHold(); if (!sh.active) return;
  try {
    const t = await chrome.tabs.get(tabId);
    if (isHttp(t.url) && !(t.url || "").startsWith(selfPrefix())) {
      await chrome.tabs.update(tabId, { url: chrome.runtime.getURL("hold.html") + "?u=" + encodeURIComponent(t.url) });
    }
  } catch (e) {}
});

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  (async () => {
    try {
      if (!msg || !msg.type) return send({});
      if (msg.type === "sh:get") { return send({ sh: await getHold(), prefs: await prefs(), vpn: await vpnDetected(), held: (await outsideTabs()).length }); }
      if (msg.type === "sh:suspend") { await engageHold(); return send({ ok: true }); }
      if (msg.type === "sh:release") {
        const p = await prefs();
        if (p.requireVpn && !msg.force && !(await vpnDetected())) return send({ ok: false, reason: "vpn" });
        await releaseHold(); return send({ ok: true });
      }
    } catch (e) { return send({ ok: false }); }
  })();
  return true;
});
