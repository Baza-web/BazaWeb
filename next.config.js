/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Server Actions default to a 1MB request body limit, which a phone
  // screenshot (receipt or WhatsApp order) routinely exceeds — that was
  // crashing the AI-scan uploads with a generic server error.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

module.exports = nextConfig;
