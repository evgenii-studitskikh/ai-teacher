import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without this, Next.js/Turbopack
  // may infer the wrong root if a stray lockfile exists elsewhere on the
  // machine (e.g. in the user's home directory), which prints a build warning.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
