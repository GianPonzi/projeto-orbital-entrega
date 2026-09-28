/**
 * O nome do cookie de sessão, isolado num módulo sem dependência nenhuma.
 *
 * Existe separado de `lib/auth.server.ts` porque o `proxy.ts` precisa dele e
 * não pode importar aquele arquivo: o proxy roda antes do render, num contexto
 * próprio, e `auth.server.ts` carrega `server-only` e `node:crypto`. A doc do
 * Next ainda avisa para não depender de módulos compartilhados no proxy
 * (`03-file-conventions/proxy.md:19`) — uma constante é o limite disso.
 */
export const SESSION_COOKIE = "orbital_session";
