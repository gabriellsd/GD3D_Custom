#!/usr/bin/env python3
"""App desktop GD3D com visualizador avançado (requer Vite dev ou build)."""

from __future__ import annotations

import argparse
import threading
import webbrowser

import uvicorn
import webview

from visualizador_web import app, PORTA_PADRAO

VITE_DEV = "http://127.0.0.1:5173/visualizador-avancado.html"
VITE_PREVIEW = "http://127.0.0.1:4173/visualizador-avancado.html"


def iniciar_api(porta: int) -> None:
    uvicorn.run(app, host="127.0.0.1", port=porta, log_level="warning")


def main() -> int:
    parser = argparse.ArgumentParser(description="GD3D — visualizador desktop")
    parser.add_argument("--porta-api", type=int, default=PORTA_PADRAO)
    parser.add_argument("--url", default=VITE_DEV, help="URL do frontend Vite")
    args = parser.parse_args()

    thread = threading.Thread(target=iniciar_api, args=(args.porta_api,), daemon=True)
    thread.start()

    webview.create_window(
        "GD3D Creative — Visualizador",
        args.url,
        width=1280,
        height=800,
        min_size=(900, 600),
    )
    webview.start()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
