import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { existsSync } from 'fs';

const CDN = 'https://models.chronicleclassic.com';

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
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        basic: resolve(__dirname, 'basic/index.html'),
        chronicle: resolve(__dirname, 'chronicle/index.html'),
      },
    },
  },
  server: {
    proxy: {
      // Proxy asset requests to CDN (avoids CORS issues in dev)
      '/models': { target: CDN, changeOrigin: true },
      '/items': { target: CDN, changeOrigin: true },
      '/item-textures': { target: CDN, changeOrigin: true },
      // Proxy Chronicle API for the chronicle demo
      '/chronicle-api': {
        target: 'https://chronicleclassic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/chronicle-api/, '/api'),
        cookieDomainRewrite: 'localhost',
      },
    },
  },
});
