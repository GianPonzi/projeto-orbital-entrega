# Orbital

Radar pessoal de empresas.

## Arquitetura

Quatro serviços no `compose.yaml`:

| serviço | o que é | porta |
|---|---|---|
| `frontend` | Next.js 16 (interface, CRUD de empresas) | `localhost:3000` |
| `backend` | FastAPI com o agente (OpenAI, Responses API) | `localhost:8000` |
| `db` | Postgres 18 | interna |
| `migrate` | cria as tabelas e a taxonomy inicial, e sai | — |

O frontend chama o backend por REST (`POST http://backend:8000/chat`), a partir do servidor do Next. O backend não acessa o banco: ele recebe a pergunta com o contexto necessário e devolve a resposta. Quando o usuário pede para adicionar uma empresa, o agente devolve os campos preenchidos, e o usuário revisa antes de gravar.

## Como rodar

Abra o `.env` e preencha as chaves. Depois:

```bash
docker compose up --build
```

Acesse **http://localhost:3000** e entre com a senha **`orbital`** (`APP_PASSWORD` no `.env`).

O banco começa com as categorias e sem nenhuma empresa. Para adicionar, use **Capturar** ou peça ao agente em **Perguntar**.

## Chaves

As duas ficam no `.env` da raiz, que não vai para o git.

| variável | para quê | sem ela |
|---|---|---|
| `OPENAI_API_KEY` | o agente do chat. O modelo é o `gpt-6-luna`, definido em `backend/app/agent.py` | o app funciona, e só o chat avisa que não está configurado |
| `NEXT_PUBLIC_MAPTILER_KEY` | autocomplete de cidade e posição da empresa no mapa (conta gratuita em [maptiler.com](https://www.maptiler.com/)) | a cidade vira texto livre e a empresa aparece no centro do mapa |

A chave do MapTiler entra no build: se mudar, suba de novo com `--build`.


Portas ocupadas: troque `FRONTEND_PORT` e `BACKEND_PORT` no `.env`.
