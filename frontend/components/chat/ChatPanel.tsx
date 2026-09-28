"use client";

/**
 * O chat com o agente: painel flutuante no canto inferior direito.
 *
 * ⚠️ **Não é modal, e não é `role="dialog"`.** A ideia é perguntar olhando o
 * radar: mapa, índice e detalhe seguem clicáveis. E o ⌘K se recusa a abrir
 * sobre um `[role="dialog"][data-state="open"]` (`CommandPalette`) — como
 * diálogo, o painel desligaria o atalho enquanto estivesse aberto.
 *
 * A conversa mora na store (`chatEntries`): fechar o painel não a perde, e a
 * resposta de uma pergunta feita antes de fechar entra mesmo assim.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Orbit, Trash2, X } from "lucide-react";

import { askAgentAction } from "@/app/actions/agent";
import { cn } from "@/lib/utils";
import { CHAT_MAX_CHARS, toChatHistory } from "@/lib/chat";
import { useAllCompanies, useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ChatAnswer } from "@/components/chat/ChatAnswer";

const SUGGESTIONS = [
  "Quem é o CEO da Nvidia?",
  "Quem são os concorrentes da Nvidia?",
  "Adiciona a Cerebras ao radar",
];

export function ChatPanel() {
  const open = useAppStore((s) => s.chatOpen);
  const setOpen = useAppStore((s) => s.setChatOpen);
  const entries = useAppStore((s) => s.chatEntries);
  const pending = useAppStore((s) => s.chatPending);
  const pushChatEntry = useAppStore((s) => s.pushChatEntry);
  const clearChat = useAppStore((s) => s.clearChat);
  const setChatPending = useAppStore((s) => s.setChatPending);
  const detailOpen = useAppStore((s) => s.selectedId !== null);
  const selectedId = useAppStore((s) => s.selectedId);
  const companies = useAllCompanies();
  const selected = companies.find((c) => c.id === selectedId);

  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Sincroniza o DOM com a conversa: rola até a última mensagem quando ela
  // cresce ou quando o painel reabre. É efeito de verdade — mexe na rolagem,
  // não em estado.
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, entries.length, pending]);

  if (!open) return null;

  async function send(text: string) {
    const question = text.trim();
    if (!question || useAppStore.getState().chatPending) return;

    pushChatEntry({ id: crypto.randomUUID(), role: "user", content: question });
    setDraft("");
    setChatPending(true);

    // Lido da store depois do push: o histórico já inclui a pergunta.
    const messages = toChatHistory(useAppStore.getState().chatEntries);

    try {
      const result = await askAgentAction({ messages, company: selected?.name });
      pushChatEntry(
        result.ok
          ? {
              id: crypto.randomUUID(),
              role: "assistant",
              content: result.reply.answer,
              sources: result.reply.sources,
              proposal: result.reply.proposal,
            }
          : { id: crypto.randomUUID(), role: "error", content: result.error },
      );
    } catch (error) {
      // A action devolve erro como valor; ela **lança** quando nem chega a
      // rodar — rede fora, ou o `proxy.ts` devolvendo o redirect para o
      // `/login` (cookie apagado). Mesma mensagem dupla da captura
      // (`AddCompanySheet`), e pelo mesmo motivo. Sem o catch, o
      // "Pesquisando…" ficaria na tela para sempre.
      console.error("[orbital] askAgentAction lançou:", error);
      pushChatEntry({
        id: crypto.randomUUID(),
        role: "error",
        content:
          "Não foi possível perguntar. Verifique a conexão — se persistir, recarregue a página e entre novamente.",
      });
    } finally {
      setChatPending(false);
    }
  }

  return (
    <aside
      aria-label="Chat com o agente"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
      className={cn(
        "fixed inset-x-3 bottom-3 z-40 flex h-[70dvh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow)] duration-200 animate-in fade-in-0 slide-in-from-bottom-2",
        "md:inset-x-auto md:bottom-4 md:right-4 md:h-[min(580px,calc(100dvh-6rem))] md:w-[380px]",
        // O painel de detalhe ocupa 380px na borda direita; o chat se afasta
        // em vez de cobri-lo.
        detailOpen && "md:right-[396px]",
      )}
    >
      <header className="flex items-center gap-2 border-b border-border py-2 pl-3.5 pr-2">
        <span className="eyebrow shrink-0 text-muted">Perguntar</span>
        {selected && (
          <span
            title="Quando a pergunta não disser de qual empresa se trata, é desta"
            className="min-w-0 truncate rounded-full border border-border px-2 py-0.5 text-xs text-muted"
          >
            sobre <span className="text-primary">{selected.name}</span>
          </span>
        )}
        <div className="ml-auto flex shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={clearChat}
            disabled={pending || entries.length === 0}
            aria-label="Limpar conversa"
            title="Limpar conversa"
          >
            <Trash2 />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(false)}
            aria-label="Fechar chat"
            title="Fechar (Esc)"
          >
            <X />
          </Button>
        </div>
      </header>

      <div className="scrollarea flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3.5 py-3.5">
        {entries.length === 0 && !pending && (
          <div className="flex flex-col gap-3 text-sm text-muted">
            <p>
              Pergunte sobre qualquer empresa — o agente pesquisa na web quando
              precisa. Para capturar, peça para adicionar: ele prepara a ficha e
              você revisa antes de gravar.
            </p>
            <div className="flex flex-col items-start gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="rounded-full border border-border px-2.5 py-1 text-left text-xs text-muted transition-colors hover:border-border-strong hover:text-primary"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {entries.map((entry) => {
          if (entry.role === "user") {
            return (
              <p
                key={entry.id}
                className="ml-8 self-end whitespace-pre-wrap rounded-lg bg-sunken px-3 py-2 text-sm text-primary"
              >
                {entry.content}
              </p>
            );
          }
          if (entry.role === "error") {
            return (
              <p
                key={entry.id}
                role="alert"
                className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {entry.content}
              </p>
            );
          }
          return (
            <ChatAnswer
              key={entry.id}
              content={entry.content}
              sources={entry.sources}
              proposal={entry.proposal}
            />
          );
        })}

        {pending && (
          <p aria-live="polite" className="flex items-center gap-2 text-sm text-muted">
            <Orbit
              aria-hidden
              className="size-4 animate-spin text-accent [animation-duration:3s]"
            />
            Pesquisando…
          </p>
        )}

        <div ref={endRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
        className="flex items-end gap-2 border-t border-border p-2.5"
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter envia; Shift+Enter quebra a linha. `isComposing` protege
            // quem digita acento por composição (o Enter confirma a letra).
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void send(draft);
            }
          }}
          placeholder="Pergunte sobre uma empresa…"
          aria-label="Pergunta"
          maxLength={CHAT_MAX_CHARS}
          rows={2}
          autoFocus
          className="min-h-0"
        />
        <Button
          type="submit"
          variant="accent"
          size="icon"
          disabled={pending || !draft.trim()}
          aria-label="Enviar"
        >
          <ArrowUp />
        </Button>
      </form>
    </aside>
  );
}
