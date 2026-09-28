/**
 * Roda uma vez, quando o servidor sobe (`instrumentation.md:18`).
 *
 * Valida as variáveis de ambiente antes da primeira requisição: faltando uma,
 * o servidor não sobe — o mesmo "falhar alto" de antes, que acontecia no build
 * e impedia o build do Docker. Ver `lib/server-env.ts`.
 *
 * O import fica dentro do `register()` e só no runtime Node, como a doc
 * recomenda (`guides/instrumentation.md`, "Importing runtime-specific code").
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { serverEnv } = await import("./lib/server-env");
    serverEnv();
  }
}
