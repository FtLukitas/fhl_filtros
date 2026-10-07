/** @type {import('next').NextConfig} */
const nextConfig = {
  // Agregá la IP de tu celular acá
  allowedDevOrigins: ['192.168.1.43', '192.168.100.36', 'localhost'],
  async redirects() {
    return [
      {
        source: '/contacto',
        destination: '/',
        permanent: false,
      },
    ];
  },
};
export default nextConfig;
