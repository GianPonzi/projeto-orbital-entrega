
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Comandos de schema (migrate/db push/studio) exigem conexão DIRETA:
    // rodar DDL através do pooler falha com erros de lock/session state.
    // O app em runtime usa DATABASE_URL (pooled) via adapter pg — ver lib/prisma.ts.
    // O fallback cobre ambientes onde só DATABASE_URL existe.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
