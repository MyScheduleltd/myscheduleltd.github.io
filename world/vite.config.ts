import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
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
});
