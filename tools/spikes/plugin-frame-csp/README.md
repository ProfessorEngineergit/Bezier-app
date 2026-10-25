# Does a plugin's frame inherit the app's script policy?

**Yes.** A page with `script-src 'self' 'wasm-unsafe-eval'` (the desktop app's policy, in
`apps/desktop/src-tauri/tauri.conf.json`) holds a sandboxed `srcdoc` frame with one inline
script. The script does not run: a `srcdoc` document inherits the policy of the page that
holds it, and the frame's own policy can only narrow it further.

Run: serve this folder from any static server and open `index.html`. It prints
`inline script in srcdoc frame: BLOCKED`. Measured on 2026-10-08 in Chromium, served by Vite.

What follows: plugins (`packages/lessons/community/plugins`) run in a browser, where the app
sends no policy, and **not in the desktop app**. The frame's document has to come from an
origin of its own with its own policy header, which in the desktop app means a custom
protocol in the Rust shell. Not built.
