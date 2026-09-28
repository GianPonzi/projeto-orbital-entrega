/**
 * Server Actions de sessão.
 *
 * Arquivo com `"use server"` no topo só pode exportar funções async — todas as
 * exports viram endpoints chamáveis pelo cliente. Por isso a lógica de sessão
 * mora em `lib/auth.server.ts` e aqui ficam só as duas actions.
 */

"use server";

import { redirect } from "next/navigation";

import {
  createSession,
  destroySession,
  verifyPassword,
} from "@/lib/auth.server";

export interface LoginState {
  error?: string;
}

/**
 * Assinatura `(prevState, formData)` porque o formulário usa `useActionState`
 * (`02-guides/forms.md:194`).
 *
 * Erro de senha volta como **valor de retorno**, não exceção: é erro esperado,
 * e a doc recomenda modelá-lo assim (`10-error-handling.md:25`).
 */
export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = formData.get("password");

  if (typeof password !== "string" || password.length === 0) {
    return { error: "Informe a senha." };
  }

  if (!verifyPassword(password)) {
    // Mensagem deliberadamente genérica: não confirma nem nega nada além do
    // fato de a senha estar errada.
    return { error: "Senha incorreta." };
  }

  await createSession();

  // `redirect` lança exceção de controle de fluxo — nada abaixo executa, e ela
  // não pode ser capturada por um try/catch em volta.
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
