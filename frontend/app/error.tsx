"use client"; // Error boundaries têm que ser Client Component (`error.md:21`).

/**
 * Tela de recuperação da rota `/`.
 *
 * ── Por que ela existe ──
 * `app/page.tsx` lê do Postgres antes de qualquer componente renderizar. Se
 * essa leitura estourar — banco fora do ar, timeout do pooler, rede oscilando —
 * não há prazo de timeout que salve: o render falha e o usuário recebe a tela
 * de erro crua do Next. Isso deixou de ser acabamento no dia em que a leitura
 * começou a estourar de verdade (ver `banco-de-dados.md`).
 *
 * ── `unstable_retry()`, não `reset()` ──
 * A doc do pacote instalado é explícita: *"In most cases, you should use
 * `unstable_retry()` instead"* (`error.md:157`), e ele foi **adicionado no
 * 16.2.0** (`error.md:331`). A diferença importa exatamente no nosso caso:
 * `reset()` limpa o estado do boundary e re-renderiza **sem buscar de novo**,
 * então uma falha de banco voltaria idêntica; `unstable_retry()` refaz o fetch
 * e o render (`error.md:121`). Código e tutoriais anteriores ao 16.2 usam
 * `reset` — não "corrigir" de volta.
 *
 * ── O que este arquivo NÃO cobre ──
 * O `layout.js` do mesmo segmento (`error.md:96`). Como o nosso layout raiz só
 * monta fontes e `<body>`, não há leitura de dados ali para falhar — por isso
 * não existe `global-error.tsx`.
 */

import { useEffect } from "react";
import { Orbit, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Em produção a `message` que chega aqui é genérica, de propósito — o
    // detalhe fica no log do servidor e se liga a esta tela pelo `digest`
    // (`error.md:111`). Em desenvolvimento vem a mensagem real.
    console.error("[orbital] falha ao renderizar a rota:", error);
  }, [error]);

  return (
    <main className="grid h-dvh w-screen place-items-center bg-canvas px-4">
      <div className="flex w-full max-w-md flex-col items-start gap-4 rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow)]">
        <span className="flex size-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
          <Orbit className="size-5" />
        </span>

        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-xl font-semibold tracking-tight text-primary">
            O mapa não carregou
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            A leitura das empresas não respondeu. Costuma ser passageiro —
            tentar de novo resolve na maioria das vezes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="accent" onClick={() => unstable_retry()}>
            <RotateCw />
            Tentar de novo
          </Button>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Recarregar a página
          </Button>
        </div>

        {error.digest && (
          // O identificador que casa esta tela com a linha correspondente no
          // log do servidor. Sem ele, "deu erro" é tudo que sobra.
          <p className="font-mono text-[11px] text-muted/70">
            ref {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
