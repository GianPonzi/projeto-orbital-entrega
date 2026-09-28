/**
 * Gera `data/countries.json` — a lista do autocomplete de país.
 *
 *     node scripts/generate-countries.mjs
 *
 * ── Por que gerar, e não digitar ou baixar ──
 * Os nomes vêm do **ICU embutido no Node** (`Intl.DisplayNames`), que é a mesma
 * base que o navegador usa. Nenhuma lista à mão para manter, nenhuma
 * dependência nova, nenhum serviço externo no caminho de um dado que não muda.
 *
 * ⚠️ **O resultado é commitado, e o script não roda no build.** Rodar em runtime
 * amarraria o país gravado ao ICU de quem estivesse executando: a mesma empresa
 * ganharia "Estados Unidos" numa máquina e "EUA" noutra, e o texto vai para uma
 * coluna do Postgres. Gerado uma vez e versionado, o valor é o mesmo para
 * sempre — e um `git diff` mostra quando o ICU mudar de ideia.
 *
 * O `en` existe só para a busca: digitar "united" acha "Estados Unidos".
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pt = new Intl.DisplayNames(["pt-BR"], { type: "region", fallback: "code" });
const en = new Intl.DisplayNames(["en"], { type: "region", fallback: "code" });

/**
 * Agrupamentos ("União Europeia"), códigos reservados e territórios sem
 * população fixa. O ICU os conhece, mas nenhum é resposta para "onde fica a
 * sede desta empresa".
 *
 * Também entram códigos **retirados / excepcionalmente reservados** que o ICU
 * ainda nomeia com o mesmo rótulo do código vigente (DD→Alemanha, SU→Rússia,
 * YU→Sérvia…). Sem isto a lista tem nomes duplicados: o Combobox usa o nome
 * como `value`/`key`, e o React avisa — e o `cmdk` deixa de distinguir as
 * linhas.
 */
const SKIP = new Set([
  "EU", "EZ", "UN", "QO", "XA", "XB", "ZZ",
  "IC", "EA", "AC", "CP", "DG", "TA",
  "BV", "HM", "AQ",
  // Retirados / excepcionalmente reservados (mesmo nome que o código atual)
  "DD", // Alemanha Oriental → DE
  "DY", // Daomé → BJ (Benin)
  "HV", // Alto Volta → BF (Burquina Faso)
  "ZR", // Zaire → CD (Congo - Kinshasa)
  "AN", // Antilhas Holandesas → CW (Curaçao) e outros
  "FX", // França metropolitana → FR
  "YD", // Iêmen do Sul → YE
  "BU", // Birmânia → MM
  "UK", // reservado; oficial é GB
  "SU", // URSS → RU
  "CS", // Sérvia e Montenegro / Tchecoslováquia → RS
  "YU", // Iugoslávia → RS
  "TP", // Timor Português → TL
  "NH", // Novas Hébridas → VU
  "VD", // Vietnã do Norte → VN
  "RH", // Rodésia → ZW
]);

const countries = [];

// Varre AA–ZZ e fica com o que o ICU reconhece. É mais confiável do que
// carregar uma lista ISO à mão: o que existe aqui é exatamente o que o
// `Intl.DisplayNames` do navegador também sabe nomear.
for (let a = 65; a <= 90; a++) {
  for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a) + String.fromCharCode(b);
    if (SKIP.has(code)) continue;

    // Com `fallback: "code"`, um código desconhecido volta como ele mesmo.
    const name = pt.of(code);
    if (!name || name === code) continue;

    countries.push({ code, name, en: en.of(code) });
  }
}

// Ordenado aqui para o cliente não pagar um sort com `localeCompare` a cada
// carga — e para o diff do arquivo ser estável entre execuções.
countries.sort((x, y) => x.name.localeCompare(y.name, "pt-BR"));

const target = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "countries.json",
);

writeFileSync(target, `${JSON.stringify(countries, null, 2)}\n`, "utf8");
console.log(`${countries.length} países → data/countries.json`);
