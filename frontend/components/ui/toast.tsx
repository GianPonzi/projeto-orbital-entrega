"use client";

/**
 * Avisos flutuantes — a superfície que torna a regra dura nº 10 cumprível fora
 * do formulário de captura.
 *
 * Feito à mão, sem dependência nova, como seis dos nove primitivos de `ui/`. O
 * que o `@radix-ui/react-toast` traria de difícil (arrastar para dispensar,
 * hotkey de foco, empilhamento com pausa no hover) não é necessário aqui.
 *
 * A fila vive na store, não neste arquivo — regra dura nº 6.
 */

import { useEffect } from "react";
import { TriangleAlert, Check, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppStore, type Toast } from "@/lib/store";

/**
 * ⚠️ Só o sucesso tem prazo. Erro fica até ser dispensado de propósito: um
 * aviso de falha que evapora sozinho enquanto o usuário olha para outro lugar
 * é quase tão ruim quanto não avisar — e é exatamente o que a regra nº 10
 * proíbe.
 */
const SUCCESS_TIMEOUT_MS = 3_000;

function ToastCard({ toast }: { toast: Toast }) {
  const dismissToast = useAppStore((s) => s.dismissToast);
  const isError = toast.tone === "error";

  useEffect(() => {
    if (isError) return;
    const timer = setTimeout(() => dismissToast(toast.id), SUCCESS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isError, toast.id, dismissToast]);

  const Icon = isError ? TriangleAlert : Check;

  return (
    <div
      // `alert` é assertivo e interrompe o leitor de tela; `status` é educado.
      // A diferença importa: falha de gravação tem que furar a fila.
      role={isError ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-surface px-3.5 py-3 shadow-[var(--shadow)] duration-200 animate-in fade-in-0 slide-in-from-top-2",
        isError ? "border-danger/40" : "border-success/40",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          isError ? "text-danger" : "text-success",
        )}
      />
      <p className="min-w-0 flex-1 text-sm leading-relaxed text-primary">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label="Dispensar aviso"
        className="-mr-1 -mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-primary"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** Empilha os avisos no topo, logo abaixo da barra superior. */
export function ToastViewport() {
  const toasts = useAppStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[116px] z-50 mx-auto flex w-full max-w-md flex-col gap-2 px-3 md:top-[68px]">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
