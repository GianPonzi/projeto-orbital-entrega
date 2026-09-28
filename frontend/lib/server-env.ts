/**
 * Variáveis de ambiente do servidor — lidas e validadas num lugar só.
 *
 * ── Por que não no carregamento do módulo ──
 * Antes, `lib/auth.server.ts` e `lib/prisma.ts` lançavam erro ao serem
 * carregados. Isso quebrava o `next build` sem `.env` — e o build dentro do
 * Docker não tem `.env`: as variáveis chegam pelo `compose.yaml`, só na subida.
 * Passar segredo no build para contornar gravaria a senha nas camadas da imagem.
 *
 * Agora a validação roda em `instrumentation.ts`, no `register()`, que o Next
 * chama uma vez quando o servidor sobe, antes da primeira requisição
 * (`instrumentation.md:18`). Variável faltando continua derrubando o app alto —
 * na subida, não mais no build.
 */

import "server-only";

/**
 * A documentação sempre pediu "≥32 bytes aleatórios", mas nada verificava — e
 * um pedido que ninguém checa é um pedido que uma configuração apressada de
 * produção ignora em silêncio. Uma chave HMAC curta é adivinhável, e adivinhar
 * a chave significa forjar sessão.
 */
const MIN_SECRET_BYTES = 32;

interface ServerEnv {
  databaseUrl: string;
  appPassword: string;
  sessionSecret: string;
}

let cached: ServerEnv | null = null;

/** As variáveis validadas. Lança, com mensagem legível, se alguma faltar. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const databaseUrl = process.env.DATABASE_URL;
  const appPassword = process.env.APP_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL não está definida — o app não consegue alcançar o Postgres. Confira o .env.",
    );
  }
  if (!appPassword) {
    throw new Error(
      "APP_PASSWORD não está definida — sem ela não há como autenticar. Confira o .env.",
    );
  }
  if (!sessionSecret) {
    throw new Error(
      "SESSION_SECRET não está definida — sem ela o cookie de sessão não pode ser assinado. Confira o .env.",
    );
  }
  if (Buffer.byteLength(sessionSecret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error(
      `SESSION_SECRET tem menos de ${MIN_SECRET_BYTES} bytes — curta demais para assinar sessão. ` +
        "Gere uma nova com `openssl rand -base64 48`.",
    );
  }

  cached = { databaseUrl, appPassword, sessionSecret };
  return cached;
}
