import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiUrl = process.env['API_URL'] ?? 'http://localhost:4000';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    // Exposes window.__viewerDebug counters. Off in production builds unless
    // VIEWER_DEBUG=1 is set (the browser tests run against a debug build).
    __VIEWER_DEBUG__: JSON.stringify(mode !== 'production' || process.env['VIEWER_DEBUG'] === '1'),
  },
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
    // The codec packages are UMD/CommonJS; pre-bundle them so the loader can
    // use their default exports in dev.
    include: [
      'dicom-parser',
      '@cornerstonejs/dicom-image-loader > @cornerstonejs/codec-charls/decodewasmjs',
      '@cornerstonejs/dicom-image-loader > @cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
      '@cornerstonejs/dicom-image-loader > @cornerstonejs/codec-openjpeg/decodewasmjs',
      '@cornerstonejs/dicom-image-loader > @cornerstonejs/codec-openjph/wasmjs',
    ],
  },
  worker: { format: 'es' },
  server: {
    port: Number(process.env['WEB_PORT'] ?? 5173),
    strictPort: true,
    proxy: {
      '/api': apiUrl,
      '/health': apiUrl,
    },
  },
}));
