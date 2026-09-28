/**
 * Proxy — o antigo `middleware.ts`, renomeado no Next 16
 * (`03-file-conventions/proxy.md:11`).
 *
 * ── O que ele faz ──
 * Manda para `/login` quem chega sem o cookie de sessão. Só isso.
 *
 * ── O que ele NÃO faz, de propósito ──
 * Não valida a assinatura do cookie nem consulta banco. É uma checagem
 * **otimista**: a doc é explícita que o proxy "should not be your only line of
 * defense" e que se deve "only read the session from the cookie... and avoid
 * database checks" (`02-guides/authentication.md:1031,1119`).
 *
 * Consequência esperada: um cookie forjado, com o nome certo e conteúdo
 * qualquer, **passa por aqui**. Quem o rejeita é o `requireAuth()` da página e
 * o `getSession()` de cada Server Action, que verificam assinatura e validade. Isso não é uma
 * brecha — é a divisão de responsabilidades que a doc recomenda.
 */

import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth-constants";

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  /**
   * Sem matcher o proxy roda em **toda** requisição, estáticos inclusive
   * (`proxy.md:75`) — o que aqui significaria loop de redirect em `/login` e
   * CSS/JS bloqueados antes de carregar.
   *
   * Exclui: a própria rota de login, os assets do Next e o favicon.
   */
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
