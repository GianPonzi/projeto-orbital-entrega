/**
 * A chamada ao backend de agentes — camada de SERVIDOR.
 *
 * É aqui que o frontend fala com o backend por REST: `POST ${BACKEND_URL}/chat`,
 * do servidor do Next para o FastAPI. No compose, `http://backend:8000`, pela
 * rede interna; no desenvolvimento nativo, `http://localhost:8000`.
 *
 * Quem chama é `askAgentAction` (`app/actions/agent.ts`). Erro volta como
 * valor, com a mensagem pronta para a tela.
 */

import "server-only";

import {
  agentReplySchema,
  type AgentResult,
  type ChatRequest,
} from "@/lib/chat";
import { getCompanies } from "@/lib/companies.server";
import { getTaxonomy } from "@/lib/taxonomy.server";

/**
 * Maior que o prazo do backend (60s por chamada à OpenAI, com uma nova
 * tentativa, e até 8 rodadas de ferramenta): quem desiste primeiro deve ser
 * ele, que sabe dizer por quê.
 */
const TIMEOUT_MS = 120_000;

/** Teto de empresas mandadas ao agente — o mesmo de `backend/app/main.py`. */
const RADAR_MAX = 2000;

export async function askBackend(request: ChatRequest): Promise<AgentResult> {
  // ⚠️ Lida aqui, não validada na subida (`instrumentation.ts`): sem ela o app
  // funciona inteiro e só o chat avisa — o mesmo contrato da OPENAI_API_KEY.
  const baseUrl = process.env.BACKEND_URL;
  if (!baseUrl) {
    return {
      ok: false,
      error: "O chat não está configurado: defina BACKEND_URL no ambiente do frontend.",
    };
  }

  /**
   * Duas leituras do banco vão junto com a pergunta, as duas feitas **aqui**,
   * no servidor, e não recebidas do navegador — o cliente poderia mandar
   * qualquer coisa:
   *
   * - a taxonomy, que vira `enum` na ferramenta `adicionar_empresa` e decide
   *   quais categorias o modelo pode escolher;
   * - o radar (nome, cidade, data de captura), que vai em JSON no fim das
   *   instruções: é como o agente sabe o que já existe sem ter acesso ao banco.
   *   Lido a cada pergunta, então a empresa recém-capturada já aparece.
   */
  let taxonomy: Awaited<ReturnType<typeof getTaxonomy>>;
  let radar: Awaited<ReturnType<typeof getCompanies>>;
  try {
    [taxonomy, radar] = await Promise.all([getTaxonomy(), getCompanies()]);
  } catch (error) {
    console.error("[orbital] chat sem dados do banco:", error);
    return { ok: false, error: "O banco não respondeu. Tente de novo em instantes." };
  }
  const categories = taxonomy.map((c) => ({
    slug: c.id,
    label: c.label,
    subcategories: c.subcategories.map((s) => ({ slug: s.id, label: s.label })),
  }));
  // Só os três campos, por escolha: o bastante para saber o que existe sem
  // inflar o prompt. O teto é o do backend (`backend/app/main.py`) — acima
  // dele o pedido inteiro seria recusado.
  const companies = radar
    .slice(0, RADAR_MAX)
    .map((c) => ({ name: c.name, city: c.city, addedAt: c.addedAt }));

  let res: Response;
  try {
    res = await fetch(new URL("/chat", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...request, categories, companies }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return {
        ok: false,
        error: "O agente demorou demais para responder. Tente uma pergunta mais específica.",
      };
    }
    console.error("[orbital] backend do chat inalcançável:", error);
    return { ok: false, error: "O backend do chat não respondeu. Ele está no ar?" };
  }

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    // O FastAPI devolve `{"detail": "..."}` nos erros do agente (texto já
    // escrito para o usuário) e `{"detail": [...]}` nos de validação (422).
    const detail =
      body && typeof body === "object" && "detail" in body ? body.detail : null;
    if (typeof detail !== "string") {
      console.error("[orbital] backend do chat recusou o pedido:", res.status, body);
    }
    return {
      ok: false,
      error: typeof detail === "string" ? detail : "O backend do chat recusou o pedido.",
    };
  }

  // A única validação da resposta: o que sai daqui chega ao navegador como
  // valor de retorno da action, sem outro ponto onde o formato possa mudar.
  const parsed = agentReplySchema.safeParse(body);
  if (!parsed.success) {
    console.error("[orbital] resposta inesperada do backend:", parsed.error);
    return {
      ok: false,
      error: "O backend do chat devolveu uma resposta num formato inesperado.",
    };
  }

  return { ok: true, reply: parsed.data };
}
