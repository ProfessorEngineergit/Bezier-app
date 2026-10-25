import { existsSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * The intro film is in two encodings (see `src/intro/film.ts`), 20 MB each. A desktop build carries
 * only the one its system plays: H.264/AAC inside the app for macOS and Windows, VP9/Opus beside it
 * for Linux (`tauri.linux.conf.json`). Tauri names the system it builds for in TAURI_ENV_PLATFORM;
 * a web build has none and keeps both.
 */
function oneFilmPerSystem(): Plugin {
  return {
    name: 'one-film-per-system',
    apply: 'build',
    closeBundle() {
      const platform = process.env.TAURI_ENV_PLATFORM;
      if (platform === undefined) return;
      // Linux has its film as a file beside the app (tauri.linux.conf.json), not inside it.
      const unused = platform === 'linux' ? ['intro.mp4', 'intro.webm'] : ['intro.webm'];
      for (const file of unused)
        rmSync(fileURLToPath(new URL(`dist/film/${file}`, import.meta.url)), { force: true });
    },
  };
}

/**
 * Leaves out iCloud's conflict copies (`albedo 2.jpg`) from a checkout in a synced folder; they
 * once added 83 MB to an installer. Only a copy whose original sits beside it is dropped, and the
 * build logs it.
 */
function noSyncCopies(): Plugin {
  return {
    name: 'no-sync-copies',
    apply: 'build',
    closeBundle() {
      const out = fileURLToPath(new URL('dist/', import.meta.url));
      const copies = readdirSync(out, { recursive: true, encoding: 'utf8' }).filter((path) => {
        const original = path.replace(/ \d+(\.[^./\\]+)?$/, '$1');
        return original !== path && existsSync(`${out}${original}`);
      });
      for (const copy of copies) rmSync(`${out}${copy}`, { recursive: true, force: true });
      if (copies.length > 0)
        console.warn(
          `Left out ${String(copies.length)} copies made by file sync, e.g. ${copies[0]}`,
        );
    },
  };
}

export default defineConfig({
  plugins: [react(), oneFilmPerSystem(), noSyncCopies()],
  server: {
    // 5173 unless told otherwise. The desktop build's devUrl is pinned to 5173, so `tauri dev` must
    // get it; a second server started beside it (a browser preview, say) is handed its own port
    // through PORT and does not collide.
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    rollupOptions: {
      // bench.html is a second entry point: a bare page that measures the frame budget from ADR
      // 0007 with no application around it. It ships with the build so the same measurement can be
      // taken inside the desktop webview, which is the engine the numbers are in question for.
      input: {
        index: fileURLToPath(new URL('index.html', import.meta.url)),
        bench: fileURLToPath(new URL('bench.html', import.meta.url)),
      },
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // The kernel and solver WebAssembly modules ship as separate files and are fetched at runtime,
    // never inlined into a bundle: the LGPL asks that they stay replaceable
    // (docs/legal/licensing.md), and it lets them be cached.
    exclude: ['occt-wasm', '@salusoft89/planegcs'],
  },
});
