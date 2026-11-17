const origin = process.env.PATRON_API_ORIGIN;
if (origin && (new URL(origin).protocol !== 'https:' || new URL(origin).origin !== origin)) throw new Error('PATRON_API_ORIGIN debe ser un origen HTTPS.');
export default {
  webpack(config) { config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] }; return config; },
  async rewrites() { return origin ? [{ source: '/v1/:path*', destination: origin + '/v1/:path*' }] : []; },
};
