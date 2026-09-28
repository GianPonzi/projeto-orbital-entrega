/**
 * Prisma Client singleton.
 *
 * Every database read and write in the app goes through this instance, and it
 * stays inside `*.server.ts` — components never import it. The data layer is
 * the only door to the data.
 *
 * ── Which connection string ──
 * Uses DATABASE_URL, which points at the POOLED endpoint
 * (`pooled.db.prisma.io`). Migrations and the seed deliberately use DIRECT_URL
 * instead — running DDL through the pooler fails with lock and session-state
 * errors. See `prisma.config.ts`.
 *
 * ── Por que existem timeouts aqui ──
 * O pooler é infraestrutura compartilhada: oscilar é o comportamento normal
 * dele, não a exceção. Já aconteceu — 2 de 3 consultas ficando sem resposta
 * enquanto o endpoint direct respondia em menos de 1s.
 *
 * Sem prazo máximo o driver `pg` espera **indefinidamente**, e uma degradação
 * de alguns minutos do lado do serviço vira página branca por 86 segundos. A
 * amplificação era nossa, não deles. Com os timeouts a falha aparece rápido e
 * legível, em vez de parecer que o app travou.
 */

// A regra dura nº 1 do projeto protege este arquivo, mas até aqui ele não se
// protegia sozinho: um import indevido quebraria o build com um "Module not
// found: net/tls" vindo do `pg`, longe da causa. Com a diretiva o erro passa a
// nomear o problema. O seed não é afetado — `prisma/seed.ts` constrói o próprio
// client, justamente por rodar fora do Next.
import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Sem checagem aqui de propósito: lançar no carregamento do módulo quebrava o
// `next build` sem `.env` (o build do Docker). A ausência continua falhando
// alto — na subida do servidor, em `instrumentation.ts` (ver
// `lib/server-env.ts`). Construir o client não abre conexão, então ler a
// variável crua aqui não esconde nada.
const connectionString = process.env.DATABASE_URL;

/**
 * Dois prazos distintos, porque medimos duas distribuições distintas.
 *
 * ── Conexão ──
 * Caso típico 750–1250ms (é a distância até us-east-1). Pior já medido: 6,2s,
 * pelo pooled. 15s dá folga sobre isso sem virar espera infinita.
 *
 * ── Query ──
 * Caso típico 126–230ms. Mas o caminho até us-east-1 trava de forma
 * intermitente, e o pior caso legítimo medido foi de **16,8s** — uma consulta
 * que respondeu, só devagar.
 *
 * ⚠️ O número anterior aqui era 10s, e estava errado: foi calibrado contra uma
 * espera infinita, sem saber que existia espera legítima de 17s. Ele
 * transformava lentidão em erro — a consulta teria voltado, e nós desistíamos
 * antes. 25s cobre o pior caso observado com margem.
 *
 * Nenhum número resolve sozinho: já vimos estouro aos 30s. Por isso o prazo é
 * generoso mas finito, e a falha precisa ser recuperável na interface em vez
 * de virar tela de erro crua.
 *
 * `statement_timeout` ficou de fora de propósito: ele é parâmetro de sessão do
 * Postgres, e poolers costumam recusar parâmetros de startup. Trocaria uma
 * espera longa por uma falha de conexão. `query_timeout` é do lado do cliente e
 * não depende do pooler cooperar.
 */
const CONNECTION_TIMEOUT_MS = 15_000;
const QUERY_TIMEOUT_MS = 25_000;

/**
 * ⚠️ O default do Prisma é `maxWait: 2000` — e ele **não** é o tempo da query,
 * é o tempo para conseguir uma conexão e abrir a transação.
 *
 * Isso derruba escrita quando o banco está longe. Toda escrita aninhada (o
 * `connect`/`set` das subcategorias, hoje) roda em transação, e do Brasil até
 * `us-east-1` abrir uma leva ~900ms no caso bom e passa de 4s quando a rede
 * oscila. Medido: com o default, 3 falhas em 5 tentativas; com o teto elevado,
 * 6 sucessos em 6. Leitura nunca falhou porque não abre transação.
 *
 * Em produção a latência some — app e banco ficam ambos em `us-east-1` — mas o
 * teto continua valendo como seguro, e custa nada.
 *
 * O preço é que uma falha real demora mais para aparecer (10s em vez de 2s).
 * Aceito: a alternativa era recusar escritas legítimas na metade das vezes.
 *
 * `timeout` é outra coisa: quanto a transação pode **durar** depois de aberta.
 * Fica acima do `query_timeout` de propósito, para o driver falhar primeiro,
 * com a mensagem mais específica.
 */
const TRANSACTION_MAX_WAIT_MS = CONNECTION_TIMEOUT_MS;
const TRANSACTION_TIMEOUT_MS = 30_000;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      query_timeout: QUERY_TIMEOUT_MS,
    }),
    transactionOptions: {
      maxWait: TRANSACTION_MAX_WAIT_MS,
      timeout: TRANSACTION_TIMEOUT_MS,
    },
  });

// Next's dev server re-executes modules on every save. Without stashing the
// instance on globalThis, each hot reload would build a fresh connection pool
// until the database starts refusing connections. In production every instance
// is isolated, so the global would only ever leak.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
