import type { Config } from "@react-router/dev/config";

export default {
  // Server-side render by default. DalyHub runs its server code in the
  // Cloudflare Workers runtime (see ADR-008).
  ssr: true,
} satisfies Config;
