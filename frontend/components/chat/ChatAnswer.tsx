"use client";

/**
 * Uma resposta do agente: o texto, as fontes da busca e, quando o usuário
 * pediu para adicionar uma empresa, o cartão da proposta.
 */

import { Fragment, useMemo } from "react";
import { TriangleAlert, Plus } from "lucide-react";

import type { AgentProposal, AgentReply } from "@/lib/chat";
import { proposalToPrefill } from "@/lib/chat";
import {
  parseChatText,
  sourceHost,
  type ChatInline,
} from "@/lib/chat-text";
import { findSimilarCompanies } from "@/lib/company-search";
import { useTaxonomy } from "@/lib/data-context";
import { useAllCompanies, useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { CompanyLogo } from "@/components/company/CompanyLogo";

function Inline({ parts }: { parts: ChatInline[] }) {
  return parts.map((part, i) => {
    if (part.type === "bold") {
      return (
        <strong key={i} className="font-semibold text-primary">
          {part.text}
        </strong>
      );
    }
    if (part.type === "link") {
      return (
        <a
          key={i}
          href={part.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline-offset-2 hover:underline"
        >
          {part.text}
        </a>
      );
    }
    return <Fragment key={i}>{part.text}</Fragment>;
  });
}

/** O texto do modelo, pelos blocos de `lib/chat-text.ts` — sem HTML cru. */
export function ChatText({ text }: { text: string }) {
  const blocks = useMemo(() => parseChatText(text), [text]);

  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed text-primary">
      {blocks.map((block, i) => {
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              key={i}
              className={
                block.ordered
                  ? "list-decimal space-y-1 pl-5"
                  : "list-disc space-y-1 pl-5 marker:text-muted"
              }
            >
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline parts={item} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline parts={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function Sources({ sources }: { sources: AgentReply["sources"] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-2.5">
      <p className="eyebrow mb-1.5 text-[10px] text-muted">Fontes</p>
      <ul className="flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <li key={source.url} className="min-w-0">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              title={source.title}
              className="block max-w-[220px] truncate rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted transition-colors hover:border-border-strong hover:text-primary"
            >
              {sourceHost(source.url)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A empresa que o agente preparou. **Não grava**: "Revisar e adicionar" abre a
 * captura preenchida, e quem grava é ela — com geocoding, otimista, rollback e
 * a tradução de nome repetido que já existem (`decisoes-tecnicas.md`).
 */
function ProposalCard({ proposal }: { proposal: AgentProposal }) {
  const { getCategory, getSubcategories } = useTaxonomy();
  const companies = useAllCompanies();
  const openAdd = useAppStore((s) => s.openAdd);
  const focusCompany = useAppStore((s) => s.focusCompany);

  const meta = getCategory(proposal.categorySlug);
  const subs = getSubcategories(proposal.categorySlug, proposal.subcategorySlugs);
  const similar = useMemo(
    () => findSimilarCompanies(companies, proposal.name),
    [companies, proposal.name],
  );

  const facts = [
    proposal.ceo && `CEO ${proposal.ceo}`,
    proposal.foundedYear && `fundada em ${proposal.foundedYear}`,
    proposal.website && sourceHost(proposal.website),
  ].filter(Boolean);

  return (
    <div className="mt-2.5 rounded-lg border border-border bg-surface-raised p-3">
      <p className="eyebrow mb-2 text-[10px] text-muted">Pronta para capturar</p>

      <div className="flex items-center gap-2.5">
        <CompanyLogo name={proposal.name} color={meta.color} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-primary">{proposal.name}</p>
          <p className="truncate text-xs text-muted">
            <span
              className="cat-text"
              style={{ "--c": meta.color } as React.CSSProperties}
            >
              {meta.label}
            </span>
            {subs.length > 0 && ` · ${subs.map((s) => s.label).join(", ")}`}
          </p>
          <p className="truncate text-xs text-muted">
            {proposal.city}, {proposal.country}
          </p>
        </div>
      </div>

      {proposal.description && (
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted">
          {proposal.description}
        </p>
      )}
      {facts.length > 0 && (
        <p className="mt-1.5 truncate font-mono text-[10px] text-muted">
          {facts.join(" · ")}
        </p>
      )}

      {/* Avisa, não bloqueia: o banco só recusa o nome idêntico, e "Cerebras
          Systems" passaria ao lado de "Cerebras". Quem decide é o usuário. */}
      {similar.length > 0 && (
        <div className="mt-2.5 flex items-start gap-2 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-2 text-xs text-primary">
          <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0 text-accent" />
          <p className="min-w-0">
            Já no radar:{" "}
            {similar.map((company, i) => (
              <Fragment key={company.id}>
                {i > 0 && ", "}
                <button
                  type="button"
                  onClick={() => focusCompany(company)}
                  className="font-semibold underline-offset-2 hover:underline"
                >
                  {company.name}
                </button>
              </Fragment>
            ))}
          </p>
        </div>
      )}

      <Button
        variant="accent"
        size="sm"
        className="mt-3 w-full"
        onClick={() => openAdd(proposalToPrefill(proposal))}
      >
        <Plus />
        Revisar e adicionar
      </Button>
    </div>
  );
}

export function ChatAnswer({
  content,
  sources,
  proposal,
}: {
  content: string;
  sources: AgentReply["sources"];
  proposal: AgentProposal | null;
}) {
  return (
    <div>
      <ChatText text={content} />
      <Sources sources={sources} />
      {proposal && <ProposalCard proposal={proposal} />}
    </div>
  );
}
