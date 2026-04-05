import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { existsSync } from 'fs';

/** Redirect /basic → /basic/, /chronicle → /chronicle/ so MPA pages resolve. */
function trailingSlash(): Plugin {
  return {
    name: 'trailing-slash',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? '';
        if (!url.endsWith('/') && !url.includes('.') && existsSync(resolve(__dirname, url.slice(1), 'index.html'))) {
          _res.writeHead(301, { Location: url + '/' });
          _res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [trailingSlash()],
  // GitHub Pages sets BASE_PATH during CI build; defaults to '/' for local dev
  base: process.env.BASE_PATH || '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        basic: resolve(__dirname, 'basic/index.html'),
        chronicle: resolve(__dirname, 'chronicle/index.html'),
        test: resolve(__dirname, 'test/index.html'),
        'zam-frame': resolve(__dirname, 'test/zam-frame.html'),
        grid: resolve(__dirname, 'test/grid/index.html'),
      },
    },
  },
  server: {
    proxy: {
      // Proxy Chronicle API for the chronicle demo
      '/chronicle-api': {
        target: 'https://chronicleclassic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/chronicle-api/, '/api'),
        cookieDomainRewrite: 'localhost',
      },
      // Proxy ZamImg CDN for the regression test page (model data is gated by referer)
      '/zamimg-proxy': {
        target: 'https://wow.zamimg.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/zamimg-proxy/, ''),
        headers: {
          Referer: 'https://www.wowhead.com/',
        },
      },
    },
  },
});
