"""API REST do backend do Orbital.

Quem chama é o frontend (Next), do servidor para o servidor, pela rede do
compose: `http://backend:8000`. A porta publicada no Mac (127.0.0.1:8000)
existe para testar com curl.
"""

import os
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.agent import AgentError, ask
from app.empresa import Categoria, EmpresaNoRadar, EmpresaProposta

app = FastAPI(title="Orbital — backend de agentes")


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    
    messages: list[Message] = Field(min_length=1, max_length=20)
    company: str | None = Field(default=None, max_length=200)
    categories: list[Categoria] = Field(default_factory=list, max_length=50)
    companies: list[EmpresaNoRadar] = Field(default_factory=list, max_length=2000)

    @model_validator(mode="after")
    def ends_with_user(self):
        # A pergunta a responder é sempre a última mensagem, e uma conversa
        # que começa pela resposta não faz sentido.
        if self.messages[0].role != "user" or self.messages[-1].role != "user":
            raise ValueError("a conversa deve começar e terminar com uma mensagem do usuário")
        return self


class Source(BaseModel):
    title: str
    url: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]
    # Preenchida quando o usuário pediu para adicionar uma empresa: o frontend
    # mostra e grava pelo caminho de sempre, depois da confirmação.
    proposal: EmpresaProposta | None = None


@app.get("/")
def status():
    # Endpoint leve: alvo do healthcheck do compose. Diz também se a chave foi
    # configurada, para o diagnóstico não depender de gastar uma pergunta.
    return {"status": "ok", "openai_key": bool(os.getenv("OPENAI_API_KEY"))}


# `def` e não `async def`: o SDK usado é o síncrono, e o FastAPI roda funções
# síncronas numa thread à parte — uma pergunta demorada não trava as outras.
@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    try:
        return ask(
            [m.model_dump() for m in request.messages],
            request.company,
            request.categories,
            request.companies,
        )
    except AgentError as e:
        raise HTTPException(status_code=e.status, detail=e.message)
