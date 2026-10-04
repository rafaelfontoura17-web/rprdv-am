/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["exceljs", "pg"],
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};
export default nextConfig;
