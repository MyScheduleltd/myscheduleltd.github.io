import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

/**
 * The festival page's Content-Security-Policy, as a meta tag in the built page.
 *
 * GitHub Pages cannot send headers, so the policy rides in the document. It is
 * the second line behind escaping: if a STAFF-written or visitor-written string
 * is ever drawn unescaped again, the browser still refuses to run a script that
 * did not come from this site (security review, 2026-10-07).
 *
 * Build only. In development Vite injects its own client and talks to it over a
 * websocket, and the review pages load fixtures a production policy would
 * rightly refuse.
 *
 * What each allowance is for:
 * - `blob:` scripts and `'wasm-unsafe-eval'`: the webcam tracker's library is
 *   fetched, checked against a recorded SHA-256 and only then run from a blob
 *   URL; it and the avatar decoder compile WebAssembly.
 * - connect-src: the festival service, and the tracker's pinned files on
 *   jsDelivr and Google Cloud Storage; Google's Drive API for the VR copies.
 * - frame-src: YouTube's players and the public M.O.T.H arcade game.
 * - img-src and media-src take any https source: STAFF paste VR video links
 *   from CDNs of their choosing, and neither images nor video can run script.
 * - style-src keeps 'unsafe-inline' for the many style attributes the panels
 *   set; inline style cannot run script either.
 */
const contentSecurityPolicy = (service: string): Plugin => ({
  name: 'festival-content-security-policy',
  apply: 'build',
  transformIndexHtml(html, context) {
    // The world's page only. The review pages are loopback tools.
    if (!context.path.endsWith('/index.html')) return html;
    let serviceOrigin = '';
    try { serviceOrigin = service ? new URL(service).origin : ''; } catch { serviceOrigin = ''; }
    const policy = [
      "default-src 'self'",
      "script-src 'self' blob: 'wasm-unsafe-eval'",
      "worker-src 'self' blob:",
      `connect-src 'self' ${serviceOrigin} https://cdn.jsdelivr.net https://storage.googleapis.com https://www.googleapis.com https://drive.usercontent.google.com blob: data:`.replace(/\s+/g, ' '),
      "frame-src 'self' https://myscheduleltd.com/moth/ https://www.youtube.com https://www.youtube-nocookie.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');
    return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
  },
});

/** Executable Basis code stays on this origin, pinned to installed three. */
const basisTranscoder = (): Plugin => {
  const files = ['basis_transcoder.js', 'basis_transcoder.wasm', 'basis_worker.js'] as const;
  let building = false;
  const pinnedFile = (file: string) => readFileSync(fileURLToPath(new URL(`./node_modules/three/examples/jsm/libs/basis/${file}`, import.meta.url)));
  const source = (file: typeof files[number]) => {
    if (file !== 'basis_worker.js') return pinnedFile(file);
    // Match KTX2Loader.init's composition byte-for-byte from the installed
    // release, with no handwritten transcoder/glue changes. Static workers
    // have their own response policy instead of inheriting the page's CSP.
    const basis = KTX2Loader as unknown as {
      BasisWorker: () => void; EngineFormat: object; EngineType: object; TranscoderFormat: object; BasisFormat: object;
    };
    const fn = basis.BasisWorker.toString();
    return Buffer.from([
      '/* Pinned three.js KTX2 static worker. Never loaded through the asset data mirror. */',
      'let _EngineFormat = ' + JSON.stringify(basis.EngineFormat),
      'let _EngineType = ' + JSON.stringify(basis.EngineType),
      'let _TranscoderFormat = ' + JSON.stringify(basis.TranscoderFormat),
      'let _BasisFormat = ' + JSON.stringify(basis.BasisFormat),
      pinnedFile('basis_transcoder.js').toString('utf8'),
      fn.substring(fn.indexOf('{') + 1, fn.lastIndexOf('}')),
    ].join('\n'));
  };
  // The document keeps its strict script policy. Only this isolated worker's
  // Emscripten bindings need JS code generation; it cannot access the DOM.
  const workerPolicy = "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'";
  return {
    name: 'festival-basis-transcoder',
    configResolved(config) { building = config.command === 'build'; },
    buildStart() {
      if (!building) return;
      for (const file of files) this.emitFile({ type: 'asset', fileName: `assets/basis/${file}`, source: source(file) });
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0];
        const file = files.find(file => path === `/assets/basis/${file}`);
        if (!file) { next(); return; }
        response.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'application/javascript');
        if (file === 'basis_worker.js') response.setHeader('Content-Security-Policy', workerPolicy);
        response.end(source(file));
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] === '/assets/basis/basis_worker.js') response.setHeader('Content-Security-Policy', workerPolicy);
        next();
      });
    },
  };
};

/**
 * The SHA-256 of every model, picture and sound the world fetches, published on
 * Pages beside them as `assets/asset-integrity.json`.
 *
 * Those files are fetched from jsDelivr's copy of this repository first
 * (src/world/AssetMirror.ts), and a copy whose hash is not on this list is
 * thrown away. The list itself always comes from this site.
 */
const assetIntegrity = (): Plugin => ({
  name: 'festival-asset-integrity',
  apply: 'build',
  generateBundle(_options, bundle) {
    const hashes: Record<string, string> = {};
    for (const [fileName, item] of Object.entries(bundle)) {
      if (item.type !== 'asset' || !(/\.(glb|png|jpe?g|webp|mp3|wav|ktx2)$/i.test(fileName)
        || /^assets\/basis\/(?:basis_transcoder\.(?:js|wasm)|basis_worker\.js)$/.test(fileName))) continue;
      const bytes = typeof item.source === 'string' ? Buffer.from(item.source) : Buffer.from(item.source);
      hashes[fileName.split('/').pop()!] = `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
    }
    this.emitFile({ type: 'asset', fileName: 'assets/asset-integrity.json', source: JSON.stringify(hashes) });
  },
});

/**
 * The review pages are loopback tools and no longer ship (owner, 2026-10-17).
 * Vite copies `public/` wholesale, so their fixtures under `public/review` are
 * taken back out of the build here; the dev server still serves them.
 */
const withoutReviewFixtures = (): Plugin => ({
  name: 'festival-without-review-fixtures',
  apply: 'build',
  async closeBundle() {
    await rm(fileURLToPath(new URL('./dist/review', import.meta.url)), { recursive: true, force: true });
  },
});

/**
 * The size of every avatar file, so the sign-in page's loading bar knows each
 * download's total before it starts (src/world/ImportedAvatar.ts). Assets are
 * published byte for byte, so the source files' sizes are the downloads'.
 */
const avatarBytes = (): Record<string, number> => {
  const folder = fileURLToPath(new URL('./src/assets/avatars/', import.meta.url));
  return Object.fromEntries(readdirSync(folder).filter(name => /\.(glb|png|jpe?g)$/i.test(name))
    .map(name => [name, statSync(`${folder}${name}`).size]));
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    define: { __AVATAR_BYTES__: JSON.stringify(avatarBytes()) },
    plugins: [contentSecurityPolicy(env.VITE_FESTIVAL_SERVER_URL ?? ''), basisTranscoder(), assetIntegrity(), withoutReviewFixtures()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        // The world only. The review pages (rebuild, avatar, webcam, band,
        // location) went out with the PS2 preview from 2026-09-30; the owner
        // took them off the public site on 2026-10-17. They still open from
        // the dev server.
        input: {
          main: 'index.html',
        },
        output: {
          manualChunks: {
            three: ['three'],
          },
        },
      },
    },
    server: {
      host: '127.0.0.1',
    },
  };
});
