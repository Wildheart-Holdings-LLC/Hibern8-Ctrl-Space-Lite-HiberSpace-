# Hibern8 Ctrl+Space Lite

A barebones, low-footprint build. Core functions only:

- **Hibernate tabs and/or whole windows** - per-tab 💤; "Hibernate idle tabs" to sweep every window; or "💤 Window" on an active tab to hibernate just that window's idle tabs. All skip active, pinned, and audio/video tabs.
- **See audio/video tabs** - anything playing sound is listed at the top, with Go and Mute.
- **See every window** - each open window (current window first) gets its own group listing all of that window's tabs - active first, then awake, then hibernated - with a per-window "💤 Window" hibernate button in the header. Secondary and additional windows appear after a browser restart, not just the current one.
- **Memory & power estimates** - a metrics row shows hibernated/awake counts and the approximate MB reclaimed and watts saved.
- **Mute** - per-tab mute/unmute, or "Mute all."
- **Close** - a ✕ on every tab line closes that tab (works on hibernated tabs too).
- **Color + greyscale** - a Color row with a ROYGBIV hue slider and a saturation slider tints the accent and repaints the toolbar icon to match your pick; slide saturation to 0 for greyscale, or ↺ to return to the default neon blue.
- **Safe-Hold** - 🛡 Suspend holds all page traffic, pauses in-progress downloads, and keeps tabs from loading until you manually release, so nothing reloads or keeps transferring on untrusted Wi-Fi before your VPN is up. Optional: engage at startup, and require confirming your VPN is connected before releasing (a manual confirmation - an extension can't auto-detect a VPN). This is a convenience layer on top of your VPN's own kill-switch, not a replacement.

No tab groups, no themes/fonts, no streaming play-position capture, no screen-time timer, no bookmarks. The UI stays tiny and there's still no tracking. Adding Safe-Hold does bring three extra permissions - `storage` (to remember the two Safe-Hold toggles), `declarativeNetRequest` (to block outbound traffic while held), and `downloads` (to pause/resume in-progress transfers while held) - plus lightweight startup/tab-activation listeners. If you want the absolute-minimum footprint and don't need Safe-Hold, remove those three permissions and the Safe-Hold block from `background.js`.

## Install (Chrome / Edge)
1. `chrome://extensions` (or `edge://extensions`) → Developer mode on.
2. **Load unpacked** → select this `hibern8-lite` folder.
3. Click the toolbar icon to open the Lite panel.

Verify real memory savings in the browser's task manager: **Shift+Esc** (Chrome/Edge).

## Firefox note
This Lite manifest uses a service worker (Chromium). For Firefox, change the `background`
block to `"background": { "scripts": ["background.js"] }` and add a
`browser_specific_settings.gecko.id`. The `lite.js` already aliases `browser` → `chrome`, so no code change is needed.

## 🧪 QA checklist (Lite - Chrome / Edge / Firefox)
Load unpacked (or, on Firefox, Load Temporary Add-on after the one-line `background` swap above), then:

**Help panel** *(the recently fixed one - verify all four close paths)*
1. Open the Lite panel, click **❔**. The Help panel opens.
2. Click **✕** → closes.
3. Reopen, click **Got it** → closes.
4. Reopen, click the dimmed backdrop (outside the card) → closes.
5. Reopen, press **Esc** → closes.
6. Confirm the panel is **hidden on first load** (it should not appear until you click ❔).

**Safe-Hold**
1. In Help, toggle **Engage Safe-Hold automatically at startup** and **Require a VPN…**; reopen Help and confirm both persist.
2. Click **🛡 Suspend** → the red "Traffic held" banner appears and open web tabs discard.
3. Click a held tab → the local **hold.html** page shows instead of the site.
4. Click **Release now** (or **✓ VPN connected - release** if Require-VPN is on - a manual confirmation) → banner clears, pages load, and paused downloads resume.
5. Confirm the hold banner is **hidden when not held** (it should not show on normal load).

**Core functions**
1. **Hibernate idle tabs**, per-tab **💤**, **💤 Window** on an active row, **Mute all**, per-tab mute, and the per-line **✕ close** all work.
2. Metrics row updates (hibernated / awake / ≈ MB / ≈ W), and **Shift+Esc** (Chrome/Edge) / `about:performance` (Firefox) confirms real memory drops.
3. Color row: hue + saturation sliders recolor the accent and toolbar icon; ↺ resets to neon blue.

**Security posture**
- Strict CSP (`default-src 'self'; script-src 'self'; object-src 'none'; connect-src 'self'`) blocks any inline/remote script. No host permissions; never reads or edits page content.
- Injection watchdog: if a script injection is ever blocked, a red in-panel banner names the source and prompts an antivirus scan (Lite has no notifications permission, so it warns in-panel + console). Full details in `PRIVACY-AND-SECURITY.md`.

*Note: the "Hibern8 opens as the first tab on session restore" behavior is a **full-build** feature; Lite opens on toolbar click and only auto-acts at startup if "Engage Safe-Hold at startup" is checked.*

## Lite vs. Full
- **Lite** = pure functionality, minimal excess memory: hibernate tabs/windows, see audio & active tabs, estimate savings, mute.
- **Full** (Hibern8 Ctrl+Space) = full tab-management workspace - windows explorer, tab groups, bulk controls, Safe-Hold, screen-time timer, themes/fonts, bookmarks - for organizing and reclaiming memory without losing your place while browsing or researching.

## License
Copyright 2026 Wildheart Holdings LLC. Free to use - for your personal use, or for an organization across the devices it owns or manages (no per-seat limit). Please don't redistribute, resell, or repackage it. Provided as-is, without warranty. While there is no implied warranty, written or otherwise, if you find an issue you're welcome to report it through the web store listing. Full terms in `EULA.md`. Nothing leaves your device.
