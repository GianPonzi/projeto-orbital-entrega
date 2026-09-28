/**
 * Server Action do chat com o agente.
 *
 * ⚠️ **Mais um endpoint POST público** (`data-security.md:276`), com
 * `getSession()` própria. Este arquivo exporta apenas actions.
 *
 * É por aqui que o frontend chama o backend por REST: a action roda no
 * servidor do Next, que faz `POST ${BACKEND_URL}/chat` (`lib/agent.server.ts`).
 * O navegador nunca vê o endereço do backend nem a chave da OpenAI.
 *
 * Nada é gravado aqui. A proposta do agente volta para a tela, e quem grava é
 * a captura, depois de o usuário revisar.
 *
 * ⚠️ **Custo conhecido, aceito:** o Next despacha as actions uma por vez por
 * aba (`02-guides/server-actions.md:26`). Enquanto o agente pesquisa, qualquer
 * outra escrita feita na mesma aba (favoritar, editar, capturar pelo ⌘K) espera
 * a pergunta terminar. Se isso incomodar, a saída documentada é um Route
 * Handler (`02-guides/backend-for-frontend.md:902`).
 */

"use server";

import { askBackend } from "@/lib/agent.server";
import { getSession } from "@/lib/auth.server";
import { chatRequestSchema, type AgentResult } from "@/lib/chat";

export async function askAgentAction(input: unknown): Promise<AgentResult> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      error: "Sua sessão expirou. Recarregue a página e entre novamente.",
    };
  }

  const parsed = chatRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Pergunta inválida.",
    };
  }

  return askBackend(parsed.data);
}
