/**
 * Extensões do visualizador: formatos, export, etc.
 */
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { extrairZip } from "./zip-loader.js";
import { carregarAmf } from "./amf-loader.js";
import { carregarGcode, aplicarCamadaGcode, infoGcode } from "./gcode-loader.js";
import { analisarMalha, secaoAnaliseMalha } from "./analise-malha.js";
import { capturarPngTransparente, exportarGifGiro } from "./export-media.js";
import { secaoMetadadosBambu } from "./bambu-metadados.js";

let dracoLoader = null;

function obterDracoLoader() {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.175.0/examples/jsm/libs/draco/gltf/");
  }
  return dracoLoader;
}

export function initExtensoes(app) {
  const estado = {
    analiseMalha: null,
    gcodeGrupo: null,
    extrasBambu: null,
  };

  let overlayAtalhos = null;

  function secoesExtras() {
    const secoes = [];
    if (estado.analiseMalha) secoes.push(secaoAnaliseMalha(estado.analiseMalha));
    if (estado.extrasBambu) {
      const s = secaoMetadadosBambu(estado.extrasBambu);
      if (s) secoes.push(s);
    }
    return secoes;
  }

  async function carregarEstendido(file, arquivos, loaders) {
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "zip") {
      const { principal, todos } = await extrairZip(file);
      return carregarEstendido(principal, todos, loaders);
    }

    if (ext === "amf") {
      const buffer = await file.arrayBuffer();
      return { object: carregarAmf(buffer), extras: {} };
    }

    if (ext === "gcode" || ext === "gco" || ext === "g") {
      const buffer = await file.arrayBuffer();
      const object = carregarGcode(buffer);
      estado.gcodeGrupo = object;
      const info = infoGcode(object);
      const slider = document.getElementById("slider-gcode-camada");
      if (slider) {
        slider.min = 0;
        slider.max = Math.max(0, info.camadas - 1);
        slider.value = info.camadas - 1;
      }
      document.getElementById("secao-gcode")?.classList.remove("hidden");
      return { object, extras: { gcode: info } };
    }

    if (ext === "step" || ext === "stp") {
      const form = new FormData();
      form.append("arquivo", file);
      const res = await fetch("/api/converter-step", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Conversão STEP falhou");
      }
      const blob = await res.blob();
      const stlFile = new File([blob], file.name.replace(/\.(step|stp)$/i, ".stl"));
      return carregarEstendido(stlFile, [stlFile], loaders);
    }

    if (ext === "glb" || ext === "gltf") {
      const url = URL.createObjectURL(file);
      try {
        const loader = loaders.gltfLoader;
        loader.setDRACOLoader(obterDracoLoader());
        const gltf = await loader.loadAsync(url);
        return { object: gltf.scene, extras: { gltf } };
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    return null;
  }

  function onModelLoaded(object, extras = {}) {
    document.getElementById("secao-gcode")?.classList.toggle("hidden", !extras.gcode);
    estado.gcodeGrupo = extras.gcode ? object : null;
    estado.extrasBambu = extras.bambuImpressao || null;
    estado.analiseMalha = analisarMalha(object);
    return secoesExtras();
  }

  function onModelCleared() {
    estado.analiseMalha = null;
    estado.gcodeGrupo = null;
    estado.extrasBambu = null;
    document.getElementById("secao-gcode")?.classList.add("hidden");
  }

  function mostrarAtalhos() {
    if (overlayAtalhos) {
      overlayAtalhos.remove();
      overlayAtalhos = null;
      return;
    }
    overlayAtalhos = document.createElement("div");
    overlayAtalhos.className = "overlay-atalhos";
    overlayAtalhos.innerHTML = `
      <div class="overlay-atalhos-box">
        <h3>Atalhos</h3>
        <ul>
          <li><kbd>R</kbd> Resetar câmera</li>
          <li><kbd>F</kbd> Tela cheia</li>
          <li><kbd>S</kbd> Captura de tela</li>
          <li><kbd>?</kbd> Esta ajuda</li>
          <li><kbd>Esc</kbd> Sair da tela cheia</li>
        </ul>
        <button type="button" class="btn btn-secundario" id="fechar-atalhos">Fechar</button>
      </div>`;
    document.body.appendChild(overlayAtalhos);
    overlayAtalhos.addEventListener("click", (e) => {
      if (e.target === overlayAtalhos || e.target.id === "fechar-atalhos") {
        overlayAtalhos.remove();
        overlayAtalhos = null;
      }
    });
  }

  function aplicarTema(tema) {
    document.body.dataset.tema = tema;
    localStorage.setItem("visualizador3d-tema", tema);
  }

  function bindUi() {
    aplicarTema(localStorage.getItem("visualizador3d-tema") || "escuro");

    document.getElementById("btn-png-alpha")?.addEventListener("click", () => {
      const cam = app.getFerramentas?.()?.cameraAtiva?.() ?? app.camera;
      capturarPngTransparente(app.renderer, app.scene, cam);
      app.setStatus("PNG com fundo transparente salvo");
    });

    document.getElementById("btn-gif-giro")?.addEventListener("click", async () => {
      const cam = app.getFerramentas?.()?.cameraAtiva?.() ?? app.camera;
      app.setStatus("Gerando vídeo...");
      try {
        await exportarGifGiro({
          renderer: app.renderer,
          scene: app.scene,
          camera: cam,
          modelPivot: app.modelPivot,
          orbit: app.getOrbitControl?.(),
          onProgress: (a, b) => app.setStatus(`Vídeo: quadro ${a}/${b}`),
        });
        app.setStatus("Vídeo WebM salvo");
      } catch (err) {
        app.setStatus(`Vídeo: ${err.message}`, true);
      }
    });

    document.getElementById("slider-gcode-camada")?.addEventListener("input", (e) => {
      if (!estado.gcodeGrupo) return;
      aplicarCamadaGcode(estado.gcodeGrupo, parseInt(e.target.value, 10));
    });

    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, select, textarea")) return;
      if (e.key === "?") {
        e.preventDefault();
        mostrarAtalhos();
      }
    });
  }

  return {
    bindUi,
    carregarEstendido,
    onModelLoaded,
    onModelCleared,
    secoesExtras,
    setExtrasBambu(meta) {
      estado.extrasBambu = meta;
    },
  };
}
