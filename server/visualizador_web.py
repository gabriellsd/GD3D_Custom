#!/usr/bin/env python3
"""API interna do administrador (proxy, conversão STEP) — não exposta na loja pública."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
import webbrowser
from pathlib import Path
from urllib.parse import unquote, urlparse

import httpx
import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

GD3D_ROOT = Path(__file__).resolve().parent.parent
PORTA_PADRAO = 8765
EXTENSOES_MODELO = {
    ".obj", ".stl", ".ply", ".glb", ".gltf", ".3mf", ".mf3", ".off", ".fbx",
    ".amf", ".gcode", ".gco", ".zip", ".step", ".stp",
}

app = FastAPI(title="GD3D Visualizador API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_pasta_modelos: Path | None = None
_produtos_dir = GD3D_ROOT / "public" / "products"
if _produtos_dir.is_dir():
    app.mount("/products", StaticFiles(directory=_produtos_dir), name="products")


@app.get("/api/proxy")
async def proxy_modelo(url: str) -> Response:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(400, "URL inválida")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=120.0) as client:
            res = await client.get(url)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Falha ao buscar URL: {exc}") from exc

    if res.status_code >= 400:
        raise HTTPException(res.status_code, "Recurso remoto não encontrado")

    nome = unquote(Path(parsed.path).name or "modelo")
    media = res.headers.get("content-type", "application/octet-stream")
    return Response(
        content=res.content,
        media_type=media,
        headers={"Content-Disposition": f'inline; filename="{nome}"'},
    )


@app.post("/api/converter-step")
async def converter_step(arquivo: UploadFile = File(...)) -> FileResponse:
    sufixo = Path(arquivo.filename or "modelo.step").suffix.lower()
    if sufixo not in (".step", ".stp"):
        raise HTTPException(400, "Envie um arquivo .step ou .stp")

    freecad = shutil.which("freecadcmd") or shutil.which("FreeCADCmd")
    if not freecad:
        raise HTTPException(
            503,
            "FreeCAD não instalado. Instale FreeCAD para converter STEP → STL.",
        )

    with tempfile.TemporaryDirectory() as tmp:
        pasta = Path(tmp)
        entrada = pasta / f"entrada{sufixo}"
        saida = pasta / "saida.stl"

        conteudo = await arquivo.read()
        entrada.write_bytes(conteudo)

        script = f'''
import FreeCAD
import Import
import Mesh
doc = FreeCAD.newDocument()
Import.insert(r"{entrada}", doc.Name)
objs = [o for o in doc.Objects if hasattr(o, "Shape")]
if not objs:
    raise RuntimeError("Nenhuma geometria no STEP")
Mesh.export(objs, r"{saida}")
FreeCAD.closeDocument(doc.Name)
'''

        try:
            subprocess.run(
                [freecad, "-c", script],
                check=True,
                capture_output=True,
                text=True,
                timeout=180,
            )
        except subprocess.CalledProcessError as exc:
            detalhe = (exc.stderr or exc.stdout or "Erro na conversão").strip()
            raise HTTPException(500, detalhe[:500]) from exc
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(504, "Conversão STEP excedeu o tempo limite") from exc

        if not saida.is_file():
            raise HTTPException(500, "Conversão não gerou STL")

        destino = pasta / "resposta.stl"
        shutil.copy(saida, destino)
        return FileResponse(destino, media_type="application/octet-stream", filename="modelo.stl")


@app.get("/modelos/{nome_arquivo:path}")
def servir_modelo(nome_arquivo: str) -> FileResponse:
    if _pasta_modelos is None:
        raise HTTPException(404, "Pasta de modelos não configurada")

    caminho = (_pasta_modelos / nome_arquivo).resolve()
    if not caminho.is_file():
        raise HTTPException(404, "Arquivo não encontrado")

    if caminho.parent != _pasta_modelos.resolve():
        raise HTTPException(403, "Acesso negado")

    if caminho.suffix.lower() not in EXTENSOES_MODELO:
        raise HTTPException(400, "Extensão não suportada")

    return FileResponse(caminho)


def criar_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="API admin do visualizador técnico GD3D")
    parser.add_argument("--porta", type=int, default=PORTA_PADRAO)
    parser.add_argument("--abrir", action="store_true")
    parser.add_argument("--pasta-modelos", type=Path, default=None)
    return parser


def main() -> int:
    global _pasta_modelos

    parser = criar_parser()
    args = parser.parse_args()

    if args.pasta_modelos:
        pasta = args.pasta_modelos.expanduser().resolve()
        if not pasta.is_dir():
            print(f"Pasta inválida: {pasta}")
            return 1
        _pasta_modelos = pasta

    vite_url = "http://127.0.0.1:5173/visualizador-avancado.html"
    api_url = f"http://127.0.0.1:{args.porta}"
    print(f"API admin: {api_url}")
    print(f"Ferramenta (Vite): npm run dev → {vite_url}")
    print("(Página interna — não linkada na loja.)")

    if args.abrir:
        webbrowser.open(vite_url)

    uvicorn.run(app, host="127.0.0.1", port=args.porta, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
