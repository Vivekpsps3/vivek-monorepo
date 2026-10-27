// The dev UI and every API share the same root server. Feature pages stay local.
const target = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000';
const common = { target, secure: false, changeOrigin: true };
module.exports = { '/api/**': common, '/travel/api/**': common, '/media/api/**': common };
