import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth.server";
import { LoginForm } from "./login-form";

// Lê cookie, então nunca poderia ser pré-renderizada de qualquer forma; o
// explícito evita depender desse efeito colateral.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Entrar — Orbital",
};

export default async function LoginPage() {
  // Quem já tem sessão não tem o que fazer aqui.
  if (await getSession()) redirect("/");

  return (
    <main className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-[320px] rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
        <header className="mb-5">
          <h1 className="font-[family-name:var(--font-space-grotesk)] text-xl text-primary">
            Orbital
          </h1>
          <p className="mt-1 text-sm text-muted">
            Aplicação pessoal. Informe a senha para continuar.
          </p>
        </header>

        <LoginForm />
      </div>
    </main>
  );
}
