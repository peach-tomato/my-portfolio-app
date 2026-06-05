import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/yahoo': {
        target: 'https://query2.finance.yahoo.com',
        changeOrigin: true,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            try {
              const urlObj = new URL(req.url, 'http://localhost');
              const targetUrl = urlObj.searchParams.get('url');
              if (targetUrl) {
                const parsedTarget = new URL(targetUrl);
                proxyReq.path = parsedTarget.pathname + parsedTarget.search;
                
                // Yahoo Finance blocks requests with localhost Origin/Referer
                proxyReq.removeHeader('origin');
                proxyReq.removeHeader('Origin');
                proxyReq.removeHeader('referer');
                proxyReq.removeHeader('Referer');
                proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
              }
            } catch (err) {
              console.error('Local Vite Proxy Error:', err);
            }
          });
        }
      }
    }
  }
})
