/**
 * O texto das respostas do agente, em pedaços que o painel desenha — PURO.
 *
 * O modelo escreve Markdown. Daqui sai só o que o prompt permite e o painel
 * precisa: parágrafos, listas, `**negrito**` e `[rótulo](https://…)`. Todo o
 * resto passa como texto.
 *
 * ⚠️ **Nada de HTML cru** (`dangerouslySetInnerHTML`). A resposta mistura texto
 * de páginas da web que o agente leu; um `<img onerror>` vindo de lá rodaria
 * dentro do app logado. Aqui só se produz dado, e o React escapa o texto ao
 * desenhar. Link só com `http(s)` — `javascript:` vira texto.
 */

export type ChatInline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "link"; text: string; href: string };

export type ChatBlock =
  | { type: "paragraph"; lines: ChatInline[][] }
  | { type: "list"; ordered: boolean; items: ChatInline[][] };

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseInline(text: string): ChatInline[] {
  const parts: ChatInline[] = [];
  let last = 0;

  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ type: "text", text: text.slice(last, index) });
    if (match[1] !== undefined) {
      parts.push({ type: "bold", text: match[1] });
    } else {
      parts.push({ type: "link", text: match[2], href: match[3] });
    }
    last = index + match[0].length;
  }

  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}

/**
 * Linhas em branco separam blocos; linhas seguidas de item (`- `, `1. `)
 * viram uma lista. Um cabeçalho `#` que escape do prompt perde o `#` e fica
 * como linha de texto.
 */
export function parseChatText(text: string): ChatBlock[] {
  const blocks: ChatBlock[] = [];

  for (const chunk of text.trim().split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((line) => line.replace(/^#{1,6}\s+/, ""));
    let paragraph: string[] = [];
    let list: { ordered: boolean; items: string[] } | null = null;

    const flushParagraph = () => {
      if (paragraph.length > 0) {
        blocks.push({ type: "paragraph", lines: paragraph.map(parseInline) });
        paragraph = [];
      }
    };
    const flushList = () => {
      if (list) {
        blocks.push({
          type: "list",
          ordered: list.ordered,
          items: list.items.map(parseInline),
        });
        list = null;
      }
    };

    for (const line of lines) {
      const bullet = BULLET.exec(line);
      const numbered = bullet ? null : NUMBERED.exec(line);
      const item = bullet ?? numbered;

      if (item) {
        flushParagraph();
        const ordered = numbered !== null;
        if (list && list.ordered !== ordered) flushList();
        list ??= { ordered, items: [] };
        list.items.push(item[1]);
      } else if (line.trim()) {
        flushList();
        paragraph.push(line.trim());
      }
    }

    flushList();
    flushParagraph();
  }

  return blocks;
}

/** "https://www.cerebras.ai/blog/x?utm_source=openai" → "cerebras.ai". */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
