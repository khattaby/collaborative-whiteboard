import "dotenv/config";
import { defineConfig, env } from "prisma/config";

function withQueryParam(url: string, key: string, value: string): string {
  const hasQuery = url.includes("?");
  const separator = hasQuery ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: (() => {
      const directUrl = process.env.DIRECT_URL;
      const baseUrl = directUrl ?? env("DATABASE_URL");
      if (baseUrl.includes("pgbouncer=true")) return baseUrl;
      if (baseUrl.includes("pooler.supabase.com:6543")) {
        return withQueryParam(baseUrl, "pgbouncer", "true");
      }
      return baseUrl;
    })(),
  },
});
