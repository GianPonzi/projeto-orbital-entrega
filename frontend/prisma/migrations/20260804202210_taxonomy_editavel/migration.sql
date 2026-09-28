-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "iconKey" TEXT,
ALTER COLUMN "blurb" SET DEFAULT '';

-- Backfill do iconKey.
--
-- Antes desta migration o ícone era escolhido em código, chaveado pelo SLUG da
-- categoria (`saude` -> Activity). Com a escolha no banco, uma categoria sem
-- `iconKey` cai no ícone genérico — sem este UPDATE as cinco categorias
-- semeadas trocariam de ícone na primeira renderização, o que parece regressão.
--
-- As chaves abaixo reproduzem EXATAMENTE o que a tela já mostrava. Migration
-- não é hora de melhorar aparência: se a tela mudasse junto, não haveria como
-- distinguir "funcionou" de "caiu no fallback".
UPDATE "Category" SET "iconKey" = CASE "slug"
  WHEN 'saude'        THEN 'activity'
  WHEN 'energia'      THEN 'zap'
  WHEN 'tecnologia'   THEN 'cpu'
  WHEN 'robotica'     THEN 'bot'
  WHEN 'fornecedores' THEN 'package'
END
WHERE "slug" IN ('saude', 'energia', 'tecnologia', 'robotica', 'fornecedores');
