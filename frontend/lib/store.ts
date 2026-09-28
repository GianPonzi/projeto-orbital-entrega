import { useMemo } from "react";
import { create } from "zustand";
import {
  type Company,
  type CompanyStatus,
  filterCompanies,
} from "./companies";
import { useServerCompanies, useTaxonomy } from "./data-context";
import { STATUSES } from "./status";
import type { SortMode } from "./company-groups";
import type { ChatEntry } from "./chat";
import { type RegionId, REGIONS, DEFAULT_REGION } from "./regions";

export type ToastTone = "error" | "success";

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

/**
 * O que a captura pode receber já preenchido. Os campos de texto têm os nomes
 * do formulário (`CompanyFormState`) e já vêm como texto — ano e valor de
 * mercado inclusive, como o `<input>` os guarda.
 *
 * ⚠️ Não traz coordenadas: o pin é resolvido no envio pelo geocoding, o mesmo
 * caminho de uma cidade digitada sem escolher a sugestão.
 *
 * Categoria e subcategorias vêm por **slug**, e quem aplica confere contra a
 * taxonomy atual — a proposta pode ter sido feita antes de uma edição dela.
 */
export interface CompanyPrefill {
  name: string;
  city?: string;
  country?: string;
  description?: string;
  website?: string;
  featuredProduct?: string;
  ceo?: string;
  social?: string;
  foundedYear?: string;
  marketCap?: string;
  categorySlug?: string;
  subcategorySlugs?: string[];
}

interface MapView {
  lng: number;
  lat: number;
  zoom: number;
}

interface FocusTarget {
  lng: number;
  lat: number;
  /** Explicit target zoom (region framing). Omitted for a plain fly-to. */
  zoom?: number;
  /** Bumped on every focus request so repeat clicks re-trigger the flyTo. */
  token: number;
}

interface AppState {
  // ── Region framing (top switcher) ────────────────────────────────────
  activeRegion: RegionId;
  setRegion: (id: RegionId) => void;

  // ── Map ──────────────────────────────────────────────────────────────
  /**
   * Show name chips (mini-cards) next to each pin on the map.
   *
   * ⚠️ Sem consumidor hoje, e mantido de propósito: os mini-cards foram
   * desligados no layout novo, mas o código ficou guardado (comentado no
   * `MapCanvas`, `MiniCardToggle.tsx` intacto) para voltar se fizer falta.
   */
  miniCardMode: boolean;
  toggleMiniCardMode: () => void;

  mapView: MapView;
  setMapView: (view: MapView) => void;

  focus: FocusTarget | null;

  // ── Filtros ──────────────────────────────────────────────────────────
  // Não há filtro de texto: buscar é papel do ⌘K, que procura em todas as
  // empresas e seleciona — não estreita a lista.

  /**
   * Categorias **desligadas**, não ligadas. Vazio = todas visíveis.
   *
   * A inversão existe para a store não precisar conhecer a taxonomy no
   * carregamento do módulo. Ver `filterCompanies` em `lib/companies.ts`.
   */
  excludedCategories: Set<string>;
  toggleCategory: (id: string) => void;
  resetCategories: () => void;

  /** Selected subcategories as `categorySlug:subcategorySlug` composite keys. */
  activeSubcategories: Set<string>;
  toggleSubcategory: (key: string) => void;

  /**
   * Esquece uma categoria apagada — tira o slug de `excludedCategories` e toda
   * chave `slug:*` de `activeSubcategories`.
   *
   * ⚠️ **Não é higiene opcional.** Estes dois conjuntos guardam slugs, e o slug
   * de uma categoria apagada não volta a existir. A entrada órfã não filtra nada
   * (nenhuma empresa tem aquela categoria), mas mantém `excludedCategories.size`
   * acima de zero — e "Mostrar todas" fica visível para sempre, sem ter o que
   * mostrar. É o mesmo defeito que fez o slug de categoria ser tratado como
   * imutável; ali evitado proibindo o rename, aqui inevitável, porque apagar é
   * uma operação legítima.
   */
  forgetCategory: (slug: string) => void;
  /** O mesmo para uma subcategoria apagada, pela chave composta. */
  forgetSubcategory: (key: string) => void;

  activeStatuses: Set<CompanyStatus>;
  toggleStatus: (status: CompanyStatus) => void;

  favoriteOnly: boolean;
  toggleFavoriteOnly: () => void;

  /** Clear every filter (categories, subcategories, status, favorite). */
  resetFilters: () => void;

  /**
   * Ordem da lista — compartilhada pelo índice e pela galeria, que mostram a
   * mesma coisa em formas diferentes. Trocar numa troca na outra.
   */
  sort: SortMode;
  setSort: (sort: SortMode) => void;

  // ── Selection & panels ───────────────────────────────────────────────
  selectedId: string | null;
  /** Just open the detail panel for an id (e.g. clicking a map pin). */
  select: (id: string | null) => void;
  /** Select + ask the map to fly there (e.g. clicking a list card). */
  focusCompany: (company: Company) => void;

  /**
   * Empresa sob o mouse (ou o foco) no índice. O mapa acende o pin dela — é o
   * que liga a linha da lista ao ponto no mapa sem precisar clicar.
   */
  hoveredId: string | null;
  setHovered: (id: string | null) => void;

  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
  /**
   * Abre a captura, opcionalmente preenchida. O ⌘K manda só o nome ("Capturar
   * 'Acme'"); o chat manda a proposta inteira do agente. O sheet recebe pelo
   * `addPrefill`, cujo `token` muda a cada chamada — é o que faz dois pedidos
   * seguidos com o mesmo conteúdo serem dois pedidos, e não um.
   */
  openAdd: (prefill?: CompanyPrefill) => void;
  addPrefill: { values: CompanyPrefill; token: number } | null;

  /**
   * Mapa ou galeria. A galeria mostra a mesma lista do índice — mesma ordem,
   * mesmos filtros —, em fichas. O mapa não é desmontado ao trocar: fica
   * oculto, e volta com o enquadramento de antes.
   */
  view: "mapa" | "galeria";
  setView: (view: "mapa" | "galeria") => void;

  /** A paleta ⌘K de buscar ou capturar. */
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;

  // ── Chat com o agente ────────────────────────────────────────────────
  /**
   * O painel do chat. **Não é modal**: o mapa, o índice e o ⌘K seguem
   * funcionando com ele aberto — a ideia é perguntar olhando o radar.
   */
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  /**
   * A conversa. Mora aqui, não no painel: fechar e abrir não a perde, e uma
   * resposta que chega com o painel fechado ainda encontra onde entrar. Some
   * ao recarregar a página — de propósito, não há onde guardá-la.
   */
  chatEntries: ChatEntry[];
  pushChatEntry: (entry: ChatEntry) => void;
  clearChat: () => void;
  /** Uma pergunta em voo. Uma por vez: a próxima depende do histórico. */
  chatPending: boolean;
  setChatPending: (pending: boolean) => void;

  /**
   * Id da empresa sendo editada, ou `null`. É um id e não a empresa inteira de
   * propósito: guardar o objeto congelaria um retrato, e o sheet deixaria de
   * ver a alteração que ele mesmo acabou de gravar.
   */
  editingId: string | null;
  openEdit: (id: string) => void;
  closeEdit: () => void;

  // ── Avisos ────────────────────────────────────────────────────────────
  /**
   * Fila de avisos, e ela existe por causa da regra dura nº 10: nenhuma falha
   * de escrita pode ser silenciosa.
   *
   * O formulário de captura resolve o caso dele sozinho — ele reabre com os
   * campos repostos e a mensagem em cima. Mas favoritar, mudar status e apagar
   * são **botões soltos**, sem formulário nenhum onde encaixar o erro. Sem esta
   * fila, o único destino da falha seria o console.
   */
  toasts: Toast[];
  /** Enfileira um aviso. Erro é o tom padrão, porque é o caso que a regra exige. */
  notify: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: string) => void;

  // ── Escrita otimista ──────────────────────────────────────────────────
  /**
   * Empresas que já aparecem no mapa mas ainda não vieram do servidor. Cobre
   * dois momentos: enquanto a Server Action está em voo (id temporário) e a
   * janela entre a action retornar e o `refresh()` reentregar a lista do
   * servidor (id real, já persistido).
   */
  pendingCompanies: Company[];
  addPendingCompany: (company: Company) => void;
  /**
   * Sucesso: troca a entrada temporária pela persistida e move a seleção
   * junto, **numa operação só**. Separado em dois `set`, existiria um render
   * intermediário em que `selectedId` aponta para um id que não está mais na
   * lista — e o painel de detalhe fecharia sozinho logo depois do fly-to.
   */
  resolvePendingCompany: (tempId: string, persisted: Company) => void;
  /** Falha: remove a entrada temporária e solta a seleção, se era ela. */
  discardPendingCompany: (tempId: string) => void;
}

/**
 * Status é enum do Prisma — lista fixa, conhecida em tempo de compilação, e por
 * isso continua sendo allowlist. Categoria não: ela vem do banco e o usuário
 * edita, então o filtro dela é por exclusão. Ver `filterCompanies`.
 */
const ALL_STATUSES = new Set<CompanyStatus>(STATUSES.map((s) => s.id));

export const useAppStore = create<AppState>((set) => ({
  activeRegion: DEFAULT_REGION,
  setRegion: (id) =>
    set((state) => {
      const region = REGIONS.find((r) => r.id === id);
      if (!region) return { activeRegion: id };
      return {
        activeRegion: id,
        focus: {
          lng: region.lng,
          lat: region.lat,
          zoom: region.zoom,
          token: (state.focus?.token ?? 0) + 1,
        },
      };
    }),

  miniCardMode: false,
  toggleMiniCardMode: () =>
    set((state) => ({ miniCardMode: !state.miniCardMode })),

  // Centered on the Atlantic so the world view shows multiple continents.
  mapView: { lng: 0, lat: 25, zoom: 1.4 },
  setMapView: (mapView) => set({ mapView }),

  focus: null,

  excludedCategories: new Set<string>(),
  toggleCategory: (id) =>
    set((state) => {
      const next = new Set(state.excludedCategories);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { excludedCategories: next };
    }),
  resetCategories: () =>
    set({
      excludedCategories: new Set<string>(),
      activeSubcategories: new Set<string>(),
    }),

  activeSubcategories: new Set<string>(),
  toggleSubcategory: (key) =>
    set((state) => {
      const next = new Set(state.activeSubcategories);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { activeSubcategories: next };
    }),

  forgetCategory: (slug) =>
    set((state) => {
      const excluded = new Set(state.excludedCategories);
      excluded.delete(slug);

      const prefix = `${slug}:`;
      const subs = new Set(
        [...state.activeSubcategories].filter((key) => !key.startsWith(prefix)),
      );

      return { excludedCategories: excluded, activeSubcategories: subs };
    }),

  forgetSubcategory: (key) =>
    set((state) => {
      const next = new Set(state.activeSubcategories);
      next.delete(key);
      return { activeSubcategories: next };
    }),

  activeStatuses: new Set(ALL_STATUSES),
  toggleStatus: (status) =>
    set((state) => {
      const next = new Set(state.activeStatuses);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return { activeStatuses: next };
    }),

  favoriteOnly: false,
  toggleFavoriteOnly: () =>
    set((state) => ({ favoriteOnly: !state.favoriteOnly })),

  resetFilters: () =>
    set({
      excludedCategories: new Set<string>(),
      activeSubcategories: new Set<string>(),
      activeStatuses: new Set(ALL_STATUSES),
      favoriteOnly: false,
    }),

  sort: "recentes",
  setSort: (sort) => set({ sort }),

  selectedId: null,
  select: (selectedId) => set({ selectedId }),
  focusCompany: (company) =>
    set((state) => ({
      selectedId: company.id,
      focus: {
        lng: company.lng,
        lat: company.lat,
        token: (state.focus?.token ?? 0) + 1,
      },
    })),

  hoveredId: null,
  setHovered: (hoveredId) => set({ hoveredId }),

  addOpen: false,
  setAddOpen: (addOpen) => set({ addOpen }),
  openAdd: (prefill) =>
    set((state) => ({
      addOpen: true,
      commandOpen: false,
      addPrefill: prefill
        ? { values: prefill, token: (state.addPrefill?.token ?? 0) + 1 }
        : state.addPrefill,
    })),
  addPrefill: null,

  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),

  chatOpen: false,
  setChatOpen: (chatOpen) => set({ chatOpen }),
  chatEntries: [],
  pushChatEntry: (entry) =>
    set((state) => ({ chatEntries: [...state.chatEntries, entry] })),
  clearChat: () => set({ chatEntries: [] }),
  chatPending: false,
  setChatPending: (chatPending) => set({ chatPending }),

  view: "mapa",
  setView: (view) => set({ view }),

  editingId: null,
  // Fecha a captura junto: dois formulários de empresa abertos ao mesmo tempo
  // não têm significado, e o de trás continuaria capturando o Esc.
  openEdit: (editingId) => set({ editingId, addOpen: false }),
  closeEdit: () => set({ editingId: null }),

  toasts: [],
  notify: (message, tone = "error") =>
    set((state) => ({
      toasts: [...state.toasts, { id: crypto.randomUUID(), message, tone }],
    })),
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  pendingCompanies: [],
  addPendingCompany: (company) =>
    set((state) => ({ pendingCompanies: [company, ...state.pendingCompanies] })),

  resolvePendingCompany: (tempId, persisted) =>
    set((state) => ({
      pendingCompanies: state.pendingCompanies.map((c) =>
        c.id === tempId ? persisted : c,
      ),
      selectedId: state.selectedId === tempId ? persisted.id : state.selectedId,
    })),

  discardPendingCompany: (tempId) =>
    set((state) => ({
      pendingCompanies: state.pendingCompanies.filter((c) => c.id !== tempId),
      selectedId: state.selectedId === tempId ? null : state.selectedId,
    })),
}));

/**
 * Empresas do banco (via Server Component) + as otimistas ainda não refletidas
 * ali. Continua sendo a única porta pela qual a UI lê empresas.
 *
 * ── A reconciliação é por id, nunca por nome ou slug ──
 * O slug definitivo só existe depois da escrita, e o nome pode repetir. Por id
 * a conta fecha sozinha: o id temporário nunca está na lista do servidor, e o
 * cuid real só passa a estar depois que o `refresh()` reentrega a página — que
 * é exatamente o instante em que a cópia otimista deve sumir.
 *
 * A entrada resolvida fica na lista até isso acontecer, e então é filtrada em
 * vez de removida. Sem efeito, sem cleanup, e o custo é um punhado de objetos
 * por sessão.
 */
export function useAllCompanies(): Company[] {
  const pendingCompanies = useAppStore((s) => s.pendingCompanies);
  const serverCompanies = useServerCompanies();
  return useMemo(() => {
    const serverIds = new Set(serverCompanies.map((c) => c.id));
    return [
      ...pendingCompanies.filter((c) => !serverIds.has(c.id)),
      ...serverCompanies,
    ];
  }, [pendingCompanies, serverCompanies]);
}

/**
 * A empresa já existe no banco?
 *
 * Enquanto a captura está em voo, a empresa aparece no mapa com um id inventado
 * pelo navegador (`pending-<uuid>`) — o Postgres nunca ouviu falar dele. Mandar
 * um `update` ou `delete` com esse id devolveria "não encontrada", que é uma
 * mensagem sem sentido para algo que está visivelmente na tela. Os controles de
 * escrita ficam desabilitados até esta função virar `true`.
 *
 * O teste é a presença na lista do servidor, e não o prefixo do id de propósito:
 * é a mesma pergunta que a reconciliação de `useAllCompanies` já faz, em vez de
 * uma segunda regra que pode divergir dela.
 */
export function useIsPersisted(id: string | undefined): boolean {
  const serverCompanies = useServerCompanies();
  return useMemo(
    () => (id !== undefined && serverCompanies.some((c) => c.id === id)),
    [id, serverCompanies],
  );
}

/** Companies that pass the current category/subcategory/status/favorite filters. */
export function useFilteredCompanies(): Company[] {
  const companies = useAllCompanies();
  const excludedCategories = useAppStore((s) => s.excludedCategories);
  const activeSubcategories = useAppStore((s) => s.activeSubcategories);
  const activeStatuses = useAppStore((s) => s.activeStatuses);
  const favoriteOnly = useAppStore((s) => s.favoriteOnly);
  return useMemo(
    () =>
      filterCompanies(companies, {
        excludedCategories,
        subcategories: activeSubcategories,
        statuses: activeStatuses,
        favoriteOnly,
      }),
    [
      companies,
      excludedCategories,
      activeSubcategories,
      activeStatuses,
      favoriteOnly,
    ],
  );
}

/** Count of companies per category, across the full (unfiltered) dataset. */
export function useCategoryCounts(): Record<string, number> {
  const companies = useAllCompanies();
  const { categories } = useTaxonomy();
  return useMemo(() => {
    // Seed every known category at 0 so filters show "0" instead of undefined.
    const counts: Record<string, number> = Object.fromEntries(
      categories.map((c) => [c.id, 0]),
    );
    for (const c of companies)
      counts[c.categorySlug] = (counts[c.categorySlug] ?? 0) + 1;
    return counts;
  }, [companies, categories]);
}

/** Count per subcategory, keyed by `categorySlug:subcategorySlug`, unfiltered. */
export function useSubcategoryCounts(): Record<string, number> {
  const companies = useAllCompanies();
  return useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of companies) {
      for (const sid of c.subcategorySlugs) {
        const key = `${c.categorySlug}:${sid}`;
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  }, [companies]);
}
