import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const basePath = env.VITE_BASE_PATH || '/';
    return {
      // Use project subpath on GitHub Pages (or "/" for custom domains/local).
      base: basePath,
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: env.VITE_SUPABASE_URL_PROXY || 'https://checklist-api.marcelo.far.br',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/rest\/v1/, '').replace(/^\/api/, ''),
            secure: false
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
