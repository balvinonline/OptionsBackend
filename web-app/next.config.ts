import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/socket.io',
        destination: 'http://127.0.0.1:5000/api/socket.io/',
      },
      {
        source: '/api/socket.io/:path*',
        destination: 'http://127.0.0.1:5000/api/socket.io/:path*',
      },
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:5000/api/:path*',
      },
      {
        source: '/socket.io/:path*',
        destination: 'http://127.0.0.1:5000/socket.io/:path*',
      }
    ];
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['sessions-terms-conjunction-previously.trycloudflare.com', 'localhost:3000']
    }
  },
  // @ts-ignore - Internal config option for Next.js 14 Webpack dev server cross-origin access
  allowedDevOrigins: [
    'sessions-terms-conjunction-previously.trycloudflare.com',
    'localhost:3000'
  ]
};

export default nextConfig;
