/**
 * Sessão — camada de SERVIDOR.
 *
 * O app é single-user por decisão, então não há tabela `User` nem banco no
 * caminho: a autenticação é uma senha única em variável de ambiente e um cookie
 * assinado. Ver `documentacao_projeto/decisoes-tecnicas.md`.
 *
 * ── Onde isto pode ser chamado ──
 * `createSession` e `destroySession` escrevem cookie, e `cookies()` só permite
 * escrita em Server Action ou Route Handler — "Setting cookies is not supported
 * during Server Component rendering" (`04-functions/cookies.md:80`). `getSession`
 * e `requireAuth` só leem, então valem em qualquer lugar do servidor.
 *
 * ── O que este arquivo NÃO é ──
 * Não é a camada que protege as rotas. `proxy.ts` faz uma checagem otimista
 * (só olha se o cookie existe) e não substitui a verificação daqui, que confere
 * assinatura e validade. Server Actions são endpoints HTTP públicos: cada uma
 * verifica a sessão por conta própria — com `getSession()`, não `requireAuth()`
 * (ver o comentário desta última).
 */

import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE } from "@/lib/auth-constants";
import { serverEnv } from "@/lib/server-env";

/**
 * Versão do formato do payload. Trocar este número invalida todas as sessões
 * existentes de uma vez — útil se o formato mudar, e melhor do que descobrir na
 * marra que cookies antigos estão sendo lidos com o schema novo.
 */
const SESSION_VERSION = 1;

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

// `APP_PASSWORD` e `SESSION_SECRET` são lidas na hora do uso, por `serverEnv()`,
// e validadas na subida do servidor (`instrumentation.ts`) — não mais no
// carregamento deste módulo, que quebrava o build sem `.env`. Sem elas o app
// continua sem subir: um login que aceita tudo, ou recusa tudo, nunca chega a
// atender.

interface SessionPayload {
  version: number;
  issuedAt: number;
  expiresAt: number;
}

/**
 * Comparação em tempo constante sobre digests SHA-256.
 *
 * `timingSafeEqual` **lança exceção** quando os buffers têm tamanhos
 * diferentes, então passar strings arbitrárias direto para ele é um bug
 * esperando acontecer. Reduzir os dois lados a um digest de 32 bytes resolve o
 * tamanho e a comparação de uma vez.
 */
function safeEqualStrings(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}

function sign(payloadB64: string): Buffer {
  return createHmac("sha256", serverEnv().sessionSecret).update(payloadB64).digest();
}

function encodeToken(payload: SessionPayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64).toString("base64url")}`;
}

function decodeToken(token: string): SessionPayload | null {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const payloadB64 = token.slice(0, separator);
  const given = Buffer.from(token.slice(separator + 1), "base64url");
  const expected = sign(payloadB64);

  // Checar o tamanho antes: `timingSafeEqual` lança se diferirem. O tamanho da
  // assinatura não é segredo, então comparar isso fora do tempo constante não
  // vaza nada.
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(given, expected)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    // Assinatura válida mas corpo ilegível não deveria acontecer; se acontecer,
    // tratar como sessão inválida é a resposta certa.
    return null;
  }

  if (payload.version !== SESSION_VERSION) return null;
  if (typeof payload.expiresAt !== "number") return null;
  if (payload.expiresAt <= Date.now()) return null;

  return payload;
}

/** A senha digitada confere com `APP_PASSWORD`? */
export function verifyPassword(input: string): boolean {
  return safeEqualStrings(input, serverEnv().appPassword);
}

/** Grava o cookie de sessão. Só em Server Action ou Route Handler. */
export async function createSession(): Promise<void> {
  const now = Date.now();
  const payload: SessionPayload = {
    version: SESSION_VERSION,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };

  const store = await cookies();
  store.set(SESSION_COOKIE, encodeToken(payload), {
    httpOnly: true,
    // Em produção sempre; em desenvolvimento não, senão o cookie não sobrevive
    // ao http://localhost de alguns navegadores e o login parece quebrado.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(payload.expiresAt),
  });
}

/** Apaga o cookie de sessão. Só em Server Action ou Route Handler. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** A sessão atual, ou `null` se ausente, expirada ou com assinatura inválida. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return decodeToken(token);
}

/**
 * Exige sessão válida, redirecionando para `/login` se não houver.
 *
 * ⚠️ **Preferir `getSession()` em Server Action**, devolvendo o erro como valor
 * de retorno.
 *
 * Não é que `redirect()` não funcione ali — funciona, e é suportado. É que ele
 * **descarta o formulário inteiro**: o usuário digitou nome, cidade, país,
 * esperou o geocoding, e recebe de volta uma tela de login vazia. Numa página o
 * redirect é a resposta certa, porque ali não há nada digitado a preservar.
 *
 * ⚠️ `redirect()` lança uma exceção de controle de fluxo tratada pelo framework
 * (`07-mutating-data.md:499`). Nunca envolver a chamada a `requireAuth()` num
 * `try/catch` largo — ele engoliria o redirect e a execução seguiria como se o
 * usuário estivesse autenticado.
 */
export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
