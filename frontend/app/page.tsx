import { AppShell } from "@/components/AppShell";
import { DataProvider } from "@/lib/data-context";
import { requireAuth } from "@/lib/auth.server";
import { getCompanies } from "@/lib/companies.server";
import { getRelations } from "@/lib/relations.server";
import { getTaxonomy } from "@/lib/taxonomy.server";

/**
 * Continua aqui de propósito, mas o motivo mudou — e vale registrar os dois.
 *
 * ── O motivo original ──
 * O projeto não usa `cacheComponents`, então vale o modelo de cache anterior,
 * em que `dynamic` tem default `'auto'` — "cache as much as possible". Uma
 * query Prisma não é um `fetch` nem uma Request-time API, então o Next não
 * recebia nenhum sinal de dinamismo e pré-renderizaria esta página no build,
 * assando os dados no HTML. O sintoma seria: você cadastra uma empresa,
 * recarrega e nada muda — até o próximo deploy.
 *
 * ── O que mudou ──
 * `requireAuth()` chama `cookies()`, que **é** uma Request-time API. A rota já
 * seria dinâmica por causa disso. Hoje a constante é redundante.
 *
 * ── Por que fica ──
 * Porque a redundância é o ponto: o dinamismo passaria a depender de um efeito
 * colateral da autenticação. Se um dia a leitura sair de trás do login, ou o
 * `requireAuth()` for movido, a página volta a ser assada no build **em
 * silêncio** — e o sintoma (dados congelados) demora a ser percebido.
 *
 * Como conferir: na tabela de rotas do `npm run build`, `/` precisa aparecer
 * como `ƒ (Dynamic)`, não `○ (Static)`. O `npm run dev` mascara o problema.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  // Antes de qualquer query: sem sessão válida, redireciona para /login.
  // O proxy.ts já barra quem chega sem cookie, mas ele é otimista — não
  // verifica assinatura. Esta é a checagem que vale.
  await requireAuth();

  // Independentes entre si — sequencial triplicaria a latência à toa.
  const [companies, relations, taxonomy] = await Promise.all([
    getCompanies(),
    getRelations(),
    getTaxonomy(),
  ]);

  // O await acontece uma vez, aqui, antes de qualquer componente renderizar.
  // Daqui para baixo tudo volta a ser síncrono: nenhum componente vira async,
  // nenhum spinner, nenhum useEffect de carregamento.
  return (
    <DataProvider
      companies={companies}
      relations={relations}
      taxonomy={taxonomy}
    >
      <AppShell />
    </DataProvider>
  );
}
