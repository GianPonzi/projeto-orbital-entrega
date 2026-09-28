"""A ferramenta `adicionar_empresa`: o formato que o modelo preenche.

Os campos espelham a **entrada da captura** do frontend
(`frontend/lib/company-schema.ts`), não as colunas da tabela: `id`, `slug`,
`categoryId`, datas e coordenadas quem resolve é a escrita do app — a
categoria vira cuid, o slug sai do nome, a cidade vira lat/lng pelo geocoding.
Os tetos de tamanho são os mesmos de lá.

O backend não grava nada: devolve a proposta validada, e o frontend a grava
pelo caminho de sempre, depois de o usuário confirmar.
"""

from pydantic import BaseModel, Field


class Subcategoria(BaseModel):
    slug: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=80)


class Categoria(BaseModel):
    """A taxonomy vive no banco; o frontend a manda junto com a pergunta."""

    slug: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=80)
    subcategories: list[Subcategoria] = Field(default_factory=list, max_length=50)


class EmpresaNoRadar(BaseModel):
    """Uma empresa que já está no radar, como o frontend a manda.

    Só três campos, por escolha: o que basta para o agente saber o que já
    existe sem inflar o prompt. O backend continua sem acesso ao banco — a
    lista chega a cada pergunta, lida pelo servidor do Next.
    """

    name: str = Field(min_length=1, max_length=120)
    city: str = Field(max_length=120)
    # "AAAA-MM-DD", no fuso de São Paulo (`frontend/lib/dates.ts`).
    addedAt: str = Field(max_length=10)


class EmpresaProposta(BaseModel):
    """Verificação mínima do que o modelo devolveu, antes de chegar à tela."""

    name: str = Field(min_length=1, max_length=120)
    categorySlug: str = Field(min_length=1, max_length=80)
    subcategorySlugs: list[str] = Field(default_factory=list, max_length=20)
    city: str = Field(min_length=1, max_length=120)
    country: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    website: str | None = Field(default=None, max_length=500)
    featuredProduct: str | None = Field(default=None, max_length=120)
    ceo: str | None = Field(default=None, max_length=120)
    social: str | None = Field(default=None, max_length=500)
    foundedYear: int | None = Field(default=None, ge=1000, le=2200)
    marketCap: float | None = Field(default=None, ge=0, le=1e15)


def _nullable(kind: str, description: str) -> dict:
    return {"type": [kind, "null"], "description": description}


def tool_definition(categories: list[Categoria]) -> dict:
    """A definição da tool, montada a cada pergunta com a taxonomy atual.

    Com a taxonomy, categoria e subcategoria viram `enum`: no modo `strict` o
    modelo só consegue escolher um slug que existe.
    """
    category = {
        "type": "string",
        "description": "Slug da categoria da empresa.",
    }
    subcategory = {"type": "string"}

    if categories:
        category["enum"] = [c.slug for c in categories]
        category["description"] = "Slug da categoria. Opções: " + "; ".join(
            f"{c.slug} ({c.label})" for c in categories
        )
        sub_slugs = sorted({s.slug for c in categories for s in c.subcategories})
        if sub_slugs:
            subcategory["enum"] = sub_slugs

    return {
        "type": "function",
        "name": "adicionar_empresa",
        "description": (
            "Prepara uma empresa para entrar no radar do usuário. Use SOMENTE "
            "quando o usuário pedir explicitamente para adicionar, salvar ou "
            "capturar uma empresa. Pesquise antes para preencher os campos; "
            "o que não encontrar, deixe null. O usuário confirma na tela antes "
            "de gravar."
        ),
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Nome da empresa."},
                "categorySlug": category,
                "subcategorySlugs": {
                    "type": "array",
                    "items": subcategory,
                    "description": "Subcategorias da categoria escolhida; lista vazia se nenhuma servir.",
                },
                "city": {"type": "string", "description": "Cidade da sede."},
                "country": {
                    "type": "string",
                    "description": "País da sede, em português (ex.: Brasil, China, Estados Unidos).",
                },
                "description": _nullable("string", "O que a empresa faz, em uma ou duas frases, em português."),
                "website": _nullable("string", "Site oficial."),
                "featuredProduct": _nullable("string", "Produto que torna a empresa interessante."),
                "ceo": _nullable("string", "Nome de quem comanda a empresa hoje."),
                "social": _nullable("string", "Perfil principal numa rede social (URL)."),
                "foundedYear": _nullable("integer", "Ano de fundação."),
                "marketCap": _nullable("number", "Valor de mercado em dólares, se for de capital aberto."),
            },
            "required": [
                "name", "categorySlug", "subcategorySlugs", "city", "country",
                "description", "website", "featuredProduct", "ceo", "social",
                "foundedYear", "marketCap",
            ],
            "additionalProperties": False,
        },
    }
