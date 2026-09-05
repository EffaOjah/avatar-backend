import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  datasource: {
    url: env("DATABASE_URL"),
    directUrl: env("DIRECT_URL"),
  },
  skills: {
    agents: ["claude", "cursor", "agents", "devin"],
  },
});
