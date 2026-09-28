/**
 * O chat com o agente — a parte que roda **nos dois lados**.
 *
 * ```
 * ChatPanel ──action──▶ askAgentAction ──fetch──▶ backend:8000/chat
 *  (navegador)          (Next, servidor)          (FastAPI + OpenAI)
 * ```
 *
 * Aqui ficam o contrato (schemas zod), a montagem do histórico e a conversão
 * da proposta do agente em pré-preenchimento da captura. Sem Prisma, sem
 * `server-only`: o painel importa este arquivo.
 */

import { z } from "zod";

import type { CompanyPrefill } from "@/lib/store";

/**
 * Os tetos do backend (`backend/app/main.py`). A action recusa acima deles e o
 * cliente apara antes de mandar — as duas pontas leem daqui.
 */
export const CHAT_MAX_MESSAGES = 20;
export const CHAT_MAX_CHARS = 4000;
const MAX_COMPANY = 200;

// ── Pedido: navegador → action ───────────────────────────────────────────────

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(CHAT_MAX_CHARS),
});

export const chatRequestSchema = z.object({
  messages: z
    .array(chatMessageSchema)
    .min(1)
    .max(CHAT_MAX_MESSAGES)
    // O backend recusa com 422 o que não começa e termina pelo usuário;
    // conferir aqui devolve uma mensagem legível em vez de um erro de upstream.
    .refine(
      (messages) =>
        messages[0]?.role === "user" && messages.at(-1)?.role === "user",
      { error: "A conversa deve começar e terminar com uma pergunta." },
    ),
  company: z.string().trim().max(MAX_COMPANY).optional(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.output<typeof chatRequestSchema>;

// ── Resposta: backend → action → navegador ─────────────────────────────────

/**
 * Espelha `EmpresaProposta` (`backend/app/empresa.py`). O backend já validou
 * com pydantic; validar de novo aqui é o que impede uma mudança de lá de
 * chegar à tela como `undefined` em campo obrigatório.
 */
const proposalSchema = z.object({
  name: z.string().min(1),
  categorySlug: z.string().min(1),
  subcategorySlugs: z.array(z.string()),
  city: z.string().min(1),
  country: z.string().min(1),
  description: z.string().nullable(),
  website: z.string().nullable(),
  featuredProduct: z.string().nullable(),
  ceo: z.string().nullable(),
  social: z.string().nullable(),
  foundedYear: z.number().int().nullable(),
  marketCap: z.number().nullable(),
});

export const agentReplySchema = z.object({
  answer: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  proposal: proposalSchema.nullable(),
});

export type AgentProposal = z.infer<typeof proposalSchema>;
export type AgentReply = z.infer<typeof agentReplySchema>;

/** O que `askAgentAction` devolve: erro como valor, mensagem pronta para a tela. */
export type AgentResult =
  | { ok: true; reply: AgentReply }
  | { ok: false; error: string };

// ── A conversa na tela ───────────────────────────────────────────────────────

/**
 * Uma linha da conversa. `error` é da tela, não do agente: mostra a falha no
 * lugar onde a resposta estaria e **não** vai no histórico mandado ao backend.
 */
export type ChatEntry =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      sources: AgentReply["sources"];
      proposal: AgentProposal | null;
    }
  | { id: string; role: "error"; content: string };

/**
 * O histórico que vai ao backend: sem os erros, só as últimas
 * `CHAT_MAX_MESSAGES`, e começando por uma pergunta.
 *
 * ⚠️ Aparar pode deixar uma resposta na frente — e o backend recusa conversa
 * que começa pelo assistente. Por isso o `while` depois do `slice`.
 *
 * Resposta longa é cortada em `CHAT_MAX_CHARS`: ela só serve de contexto, e o
 * backend recusaria o pedido inteiro por uma resposta antiga comprida.
 */
export function toChatHistory(entries: ChatEntry[]): ChatMessage[] {
  const messages: ChatMessage[] = entries
    .filter((e) => e.role !== "error")
    .map((e) => ({
      role: e.role as ChatMessage["role"],
      content: e.content.slice(0, CHAT_MAX_CHARS),
    }))
    .slice(-CHAT_MAX_MESSAGES);

  while (messages.length > 0 && messages[0].role !== "user") messages.shift();
  return messages;
}

/**
 * A proposta do agente no formato que a captura aceita.
 *
 * ⚠️ `null` vira `""`, não `undefined`: o sheet espalha isto sobre o
 * `EMPTY_FORM`, e um `undefined` explícito apagaria o `""` de lá — o `<input>`
 * ficaria sem valor controlado. Números viram texto, como o `<input>` guarda.
 */
export function proposalToPrefill(proposal: AgentProposal): CompanyPrefill {
  return {
    name: proposal.name,
    categorySlug: proposal.categorySlug,
    subcategorySlugs: proposal.subcategorySlugs,
    city: proposal.city,
    country: proposal.country,
    description: proposal.description ?? "",
    website: proposal.website ?? "",
    featuredProduct: proposal.featuredProduct ?? "",
    ceo: proposal.ceo ?? "",
    social: proposal.social ?? "",
    foundedYear: proposal.foundedYear?.toString() ?? "",
    marketCap: proposal.marketCap?.toString() ?? "",
  };
}
