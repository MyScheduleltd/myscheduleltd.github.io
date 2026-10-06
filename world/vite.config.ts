import { defineConfig, loadEnv, type Plugin } from 'vite';

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
 * - frame-src: YouTube's players, the only frames the world embeds.
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
      'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    plugins: [contentSecurityPolicy(env.VITE_FESTIVAL_SERVER_URL ?? '')],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        // The review pages go out with the PS2 preview, so the owner can see the
        // avatars, the band and the prompts beside the world (2026-09-30).
        input: {
          main: 'index.html',
          rebuild: 'rebuild-review.html',
          avatar: 'avatar-review.html',
          webcam: 'webcam-review.html',
          band: 'band-review.html',
          location: 'location-review.html',
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
