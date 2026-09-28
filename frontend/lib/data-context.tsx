"use client";

/**
 * Dado vindo do servidor, entregue à árvore cliente.
 *
 * ── Por que Context e não hidratar a store ──
 * A store zustand é um singleton de módulo: uma instância só, criada quando o
 * arquivo carrega. No navegador isso é inofensivo, mas o mesmo módulo também
 * roda no servidor durante o pré-render — e ali um singleton vira estado
 * compartilhado entre requisições. Com Context o dado nasce junto com o render,
 * sem primeiro render vazio e sem efeito de hidratação.
 *
 * A divisão que isso estabelece:
 *   store   → o que VOCÊ fez (filtros, ordem, vista, seleção, câmera, otimistas)
 *   context → o que o SERVIDOR entregou (empresas, relações)
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Company } from "@/lib/companies";
import type { Relation } from "@/lib/relations";
import {
  buildTaxonomyIndex,
  type CategoryMeta,
  type TaxonomyIndex,
} from "@/lib/categories";

interface ServerData {
  companies: Company[];
  relations: Relation[];
  taxonomy: CategoryMeta[];
}

const ServerDataContext = createContext<ServerData | null>(null);

export function DataProvider({
  companies,
  relations,
  taxonomy,
  children,
}: ServerData & { children: ReactNode }) {
  // Sem o memo, um objeto literal novo a cada render invalidaria o context e
  // re-renderizaria toda a árvore consumidora — mapa incluído.
  //
  // ⚠️ `taxonomy` **tem** que estar nas deps. Hoje o esquecimento passaria
  // despercebido, porque o servidor entrega arrays com referência nova a cada
  // render e qualquer um deles já invalida o memo — mas seria uma bomba armada
  // para o dia em que alguém memoizasse a entrega.
  const value = useMemo(
    () => ({ companies, relations, taxonomy }),
    [companies, relations, taxonomy],
  );

  return (
    <ServerDataContext.Provider value={value}>
      {children}
    </ServerDataContext.Provider>
  );
}

function useServerData(): ServerData {
  const value = useContext(ServerDataContext);
  if (!value) {
    // Erro explícito: sem isto o sintoma seria uma tela vazia sem explicação.
    throw new Error(
      "Dados do servidor ausentes — o componente precisa estar dentro de <DataProvider>.",
    );
  }
  return value;
}

export function useServerCompanies(): Company[] {
  return useServerData().companies;
}

export function useServerRelations(): Relation[] {
  return useServerData().relations;
}

/**
 * A taxonomy do servidor, já indexada.
 *
 * ⚠️ **Chame uma vez no topo do componente** e use o objeto devolvido dentro
 * dos `.map()`. Hook não pode ser chamado em laço, e era justamente essa
 * limitação que mantinha a taxonomy em código.
 *
 * O `useMemo` é o que torna o objeto estável entre renders — sem ele, o
 * `MapCanvas` recriaria as camadas WebGL a cada render, porque as `LayerProps`
 * dele derivam de `colorPairs`.
 */
export function useTaxonomy(): TaxonomyIndex {
  const taxonomy = useServerData().taxonomy;
  return useMemo(() => buildTaxonomyIndex(taxonomy), [taxonomy]);
}
