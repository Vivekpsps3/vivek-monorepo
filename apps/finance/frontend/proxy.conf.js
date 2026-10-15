/**
 * Dev proxy (Vite / Angular 19+). Frontend uses apiUrl: '/api' so SPA routes
 * (/transactions, /planning, etc.) never collide with API paths.
 */
const target = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000';

const common = {
  target,
  secure: false,
  changeOrigin: true,
};

const travelTarget = process.env.TRAVEL_PROXY_TARGET || 'http://127.0.0.1:8090';
const mediaTarget = process.env.MEDIA_PROXY_TARGET || 'http://127.0.0.1:8091';

module.exports = {
  '/api': common,
  '/api/**': common,
  '/travel': { target: travelTarget, secure: false, changeOrigin: true, pathRewrite: { '^/travel': '' } },
  '/media': { target: mediaTarget, secure: false, changeOrigin: true, pathRewrite: { '^/media': '' } },
};