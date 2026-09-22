import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

// Top-level call exposes wrangler.jsonc bindings to `next dev` via getPlatformProxy.
initOpenNextCloudflareForDev();

export default nextConfig;
