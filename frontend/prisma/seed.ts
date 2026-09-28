/**
 * Seed — **bootstrap de primeira execução** da taxonomia.
 *
 * ── Não é mais sincronização, e a diferença é a razão de ele existir assim ──
 * Enquanto `data/taxonomy.json` era a fonte de verdade, este arquivo fazia
 * `upsert` e podia rodar dez vezes sem consequência. Agora a fonte é o
 * **banco**, e a taxonomia é editável — então um `upsert` a partir do JSON
 * passaria por cima de label, cor e ordem que o usuário mudou, com um retrato
 * antigo. É exatamente a arma que o seed de empresas já tinha e que motivou
 * separá-lo antes de a escrita existir.
 *
 * Por isso: **se já houver categoria no banco, este script não faz nada.** O
 * JSON deixou de ser fonte e virou fixture — o conteúdo com que um banco vazio
 * nasce, para o mapa não abrir sem nenhuma categoria.
 *
 * ⚠️ Consequência: mudar `data/taxonomy.json` **não** altera um banco já
 * semeado. Para recomeçar do JSON, esvazie a tabela antes.
 *
 * ── Empresas não são semeadas ──
 * `data/companies.json` e `data/relations.json` não participam de nenhum fluxo;
 * são retrato histórico.
 *
 * ── Tradução de ids ──
 * No JSON, `"tecnologia"` é o id. No banco é o **slug** — a PK é um cuid.
 *
 * Roda fora do Next (via tsx), então carrega o `.env` na mão e monta o próprio
 * PrismaClient sobre a `DIRECT_URL`: é operação administrativa em lote, mesmo
 * motivo das migrations.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

import taxonomy from "../data/taxonomy.json";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DIRECT_URL (ou DATABASE_URL) não definida — confira o .env antes de rodar o seed.",
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  // A guarda que transforma sincronização em bootstrap. Sem ela, um `db seed`
  // distraído devolveria cor, label e ordem ao que o JSON diz — apagando
  // edições feitas pela interface sem avisar ninguém.
  const existing = await prisma.category.count();
  if (existing > 0) {
    console.log(
      `Taxonomia já existe (${existing} categorias) — nada a fazer.\n` +
        "O banco é a fonte de verdade; data/taxonomy.json é só o conteúdo\n" +
        "inicial de um banco vazio. Para recomeçar dele, esvazie a tabela antes.",
    );
    return;
  }

  let categories = 0;
  let subcategories = 0;

  // A ordem do array no JSON é a ordem de exibição na sidebar; sem gravá-la em
  // sortOrder ela se perderia (o Postgres não garante ordem de linhas).
  for (let i = 0; i < taxonomy.length; i++) {
    const cat = taxonomy[i];
    const category = await prisma.category.upsert({
      where: { slug: cat.id },
      update: {
        label: cat.label,
        color: cat.color,
        iconKey: cat.iconKey,
        blurb: cat.blurb,
        sortOrder: i,
      },
      create: {
        slug: cat.id,
        label: cat.label,
        color: cat.color,
        // Sem isto um banco novo nasceria com todas as categorias no ícone
        // genérico — o mesmo efeito que o backfill da migration existe para
        // evitar num banco já semeado.
        iconKey: cat.iconKey,
        blurb: cat.blurb,
        sortOrder: i,
      },
    });
    categories++;

    for (let j = 0; j < cat.subcategories.length; j++) {
      const sub = cat.subcategories[j];
      await prisma.subcategory.upsert({
        // Chave composta: é aqui que "logistica" de Robótica e "logistica" de
        // Fornecedores deixam de colidir.
        where: { categoryId_slug: { categoryId: category.id, slug: sub.id } },
        update: { label: sub.label, sortOrder: j },
        create: {
          categoryId: category.id,
          slug: sub.id,
          label: sub.label,
          sortOrder: j,
        },
      });
      subcategories++;
    }
  }

  console.log(
    `Seed concluído: ${categories} categorias · ${subcategories} subcategorias.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
