"use client";

/**
 * Confirmação de exclusão.
 *
 * ── Por que ela nomeia as relações ──
 * `Relation` tem `onDelete: Cascade` nas duas pontas (`schema.prisma:140,142`),
 * então apagar uma empresa apaga as arestas que a tocam. No banco é o desenho
 * certo — sem cascade a FK bloquearia o delete, ou sobraria aresta apontando
 * para o vazio. Mas é perda de dado que o Postgres executa em silêncio, e o
 * único lugar onde ela pode ser anunciada é aqui, antes.
 */

import { useMemo, useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deleteCompanyAction } from "@/app/actions/companies";
import type { Company } from "@/lib/companies";
import { useServerRelations } from "@/lib/data-context";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DeleteCompanyDialog({
  company,
  disabled,
}: {
  company: Company;
  disabled?: boolean;
}) {
  const closeEdit = useAppStore((s) => s.closeEdit);
  const select = useAppStore((s) => s.select);
  const notify = useAppStore((s) => s.notify);
  const relations = useServerRelations();

  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const relationCount = useMemo(
    () =>
      relations.filter(
        (r) => r.source === company.id || r.target === company.id,
      ).length,
    [relations, company.id],
  );

  function handleDelete() {
    startTransition(async () => {
      try {
        const result = await deleteCompanyAction(company.id);

        if (result.ok) {
          setOpen(false);
          closeEdit();
          // A seleção tem que sair junto: o painel de detalhe procura a empresa
          // por `selectedId` e ficaria apontando para um id que saiu da lista.
          select(null);
          return;
        }

        // O diálogo fica aberto, mas o aviso vai para o toast: a mensagem
        // precisa sobreviver caso o usuário feche o diálogo ao ver o erro.
        notify(result.error);
      } catch (error) {
        console.error("[orbital] deleteCompanyAction lançou:", error);
        notify(
          "Não foi possível apagar. Verifique a conexão — se persistir, recarregue a página e entre novamente.",
        );
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="danger-ghost"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="sm:mr-auto"
      >
        <Trash2 />
        Apagar
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Fechar no meio da gravação deixaria a operação sem nenhuma tela
          // acompanhando o resultado.
          if (isPending) return;
          setOpen(next);
        }}
      >
        <DialogContent className="max-w-md" showClose={!isPending}>
          <DialogHeader>
            <DialogTitle>Apagar {company.name}?</DialogTitle>
            <DialogDescription>
              {relationCount > 0 ? (
                <>
                  Esta empresa tem{" "}
                  <strong className="text-danger">
                    {relationCount}{" "}
                    {relationCount === 1 ? "relação" : "relações"}
                  </strong>
                  , e {relationCount === 1 ? "ela vai" : "elas vão"} ser
                  apagada{relationCount === 1 ? "" : "s"} junto. Não dá para
                  desfazer.
                </>
              ) : (
                <>Não dá para desfazer.</>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={isPending}
              onClick={handleDelete}
            >
              {isPending && <Loader2 className="animate-spin" />}
              {isPending ? "Apagando…" : "Apagar empresa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
