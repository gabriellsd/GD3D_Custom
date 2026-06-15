/**
 * ExtensÃµes do visualizador: impressÃ£o, formatos, export, AR, etc.
 */
import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { extrairZip } from "./zip-loader.js";
import { carregarAmf } from "./amf-loader.js";
import { carregarGcode, aplicarCamadaGcode, infoGcode } from "./gcode-loader.js";
import { analisarMalha, secaoAnaliseMalha } from "./analise-malha.js";
import { criarMesaImpressao } from "./mesa-impressao.js";
import { calcularAutoOrientacao, aplicarAutoOrientacao } from "./auto-orient.js";
import {
  PRESETS_MATERIAIS,
  salvarMateriaisOriginais,
  aplicarPresetMaterial,
  restaurarMateriais,
} from "./materiais-preview.js";
import { capturarPngTransparente, exportarGifGiro } from "./export-media.js";
import { coletarPecas, renderizarArvorePecas } from "./arvore-pecas.js";
import { criarComparacao } from "./comparacao.js";
import { copiarLinkCompartilhamento, lerSessaoDaUrl } from "./sessao-share.js";
import { suportaAr, iniciarAr } from "./ar-xr.js";
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
  const mesa = criarMesaImpressao();
  const comparacao = criarComparacao(app.modelPivot, app.scene);

  const estado = {
    pecas: [],
    analiseMalha: null,
    escalaMm: 1,
    presetMaterial: "padrao",
    mesaMsg: "",
    gcodeGrupo: null,
    extrasBambu: null,
  };

  let overlayAtalhos = null;

  function escalaCena() {
    return app.unidadeOrigemArquivo?.(app.getFormato?.()) === "m" ? 1000 : 1;
  }

  function atualizarMesa() {
    mesa.remover(app.scene);
    if (!mesa.isAtivo() || !app.getCurrentModel()) {
      estado.mesaMsg = "";
      return;
    }
    const info = mesa.atualizar(app.scene, app.modelPivot, escalaCena());
    estado.mesaMsg = info?.mensagem || "";
    const el = document.getElementById("mesa-status");
    if (el) {
      el.textContent = estado.mesaMsg;
      el.className = info?.overflow ? "aviso-erro" : "aviso-ok";
    }
  }

  function atualizarArvore() {
    const model = app.getCurrentModel();
    estado.pecas = model ? coletarPecas(model) : [];
    renderizarArvorePecas(document.getElementById("arvore-pecas"), estado.pecas);
  }

  function secoesExtras() {
    const secoes = [];
    if (estado.analiseMalha) secoes.push(secaoAnaliseMalha(estado.analiseMalha));
    if (estado.extrasBambu) {
      const s = secaoMetadadosBambu(estado.extrasBambu);
      if (s) secoes.push(s);
    }
    if (estado.mesaMsg && mesa.isAtivo()) {
      secoes.push({
        titulo: "Mesa de impressÃ£o",
        itens: [["Status", estado.mesaMsg]],
      });
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
        throw new Error(err.detail || "ConversÃ£o STEP falhou");
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
    salvarMateriaisOriginais(object);
    if (estado.presetMaterial !== "padrao") {
      aplicarPresetMaterial(object, estado.presetMaterial);
    }
    atualizarArvore();
    atualizarMesa();
    return secoesExtras();
  }

  function onModelCleared() {
    comparacao.limpar();
    mesa.remover(app.scene);
    estado.pecas = [];
    estado.analiseMalha = null;
    estado.mesaMsg = "";
    estado.gcodeGrupo = null;
    estado.extrasBambu = null;
    document.getElementById("secao-gcode")?.classList.add("hidden");
    renderizarArvorePecas(document.getElementById("arvore-pecas"), []);
  }

  function aplicarEscala(valorMm) {
    const model = app.getCurrentModel();
    if (!model || !valorMm) return;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxAtual = Math.max(size.x, size.y, size.z);
    if (maxAtual <= 0) return;
    const alvo = valorMm / escalaCena();
    const fator = alvo / maxAtual;
    model.scale.multiplyScalar(fator);
    app.centerAndFrame(model);
    atualizarMesa();
    app.setStatus(`Escala aplicada: maior dimensÃ£o â‰ˆ ${valorMm} mm`);
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
          <li><kbd>R</kbd> Resetar cÃ¢mera</li>
          <li><kbd>W</kbd> Wireframe</li>
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

  function restaurarSessao() {
    const sessao = lerSessaoDaUrl();
    if (!sessao) return;
    const ferr = app.getFerramentas?.();
    if (sessao.prefs) ferr?.salvarPreferencias(sessao.prefs);
    ferr?.aplicarPreferencias?.();
    if (sessao.bgIndex != null) app.aplicarPreferenciaFundo?.(sessao.bgIndex);
    app.setStatus("SessÃ£o restaurada da URL");
  }

  function bindUi() {
    aplicarTema(localStorage.getItem("visualizador3d-tema") || "escuro");
    restaurarSessao();

    const selMesa = document.getElementById("sel-mesa");
    if (selMesa) {
      selMesa.innerHTML = Object.entries(mesa.tipos)
        .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
        .join("");
      selMesa.addEventListener("change", () => {
        mesa.setTipo(selMesa.value);
        atualizarMesa();
      });
    }

    document.getElementById("chk-mesa")?.addEventListener("change", (e) => {
      mesa.setAtivo(e.target.checked);
      atualizarMesa();
      app.getFerramentas?.()?.salvarPreferencias({ mesa: e.target.checked });
    });

    document.getElementById("btn-auto-orient")?.addEventListener("click", () => {
      const model = app.getCurrentModel();
      if (!model) return;
      const q = calcularAutoOrientacao(model);
      aplicarAutoOrientacao(app.modelPivot, q);
      app.centerAndFrame(model);
      atualizarMesa();
      app.setStatus("Auto-orientaÃ§Ã£o aplicada");
    });

    document.getElementById("sel-material")?.addEventListener("change", (e) => {
      estado.presetMaterial = e.target.value;
      const model = app.getCurrentModel();
      if (!model) return;
      if (estado.presetMaterial === "padrao") restaurarMateriais(model);
      else aplicarPresetMaterial(model, estado.presetMaterial);
      app.getFerramentas?.()?.salvarPreferencias({ presetMaterial: estado.presetMaterial });
    });

    if (document.getElementById("sel-material")) {
      document.getElementById("sel-material").innerHTML = Object.entries(PRESETS_MATERIAIS)
        .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
        .join("");
    }

    document.getElementById("btn-escala")?.addEventListener("click", () => {
      const input = document.getElementById("input-escala-mm");
      const v = parseFloat(input?.value);
      if (!v || v <= 0) {
        app.setStatus("Informe uma escala vÃ¡lida em mm", true);
        return;
      }
      aplicarEscala(v);
    });

    document.getElementById("btn-png-alpha")?.addEventListener("click", () => {
      const cam = app.getFerramentas?.()?.cameraAtiva?.() ?? app.camera;
      capturarPngTransparente(app.renderer, app.scene, cam);
      app.setStatus("PNG com fundo transparente salvo");
    });

    document.getElementById("btn-gif-giro")?.addEventListener("click", async () => {
      const cam = app.getFerramentas?.()?.cameraAtiva?.() ?? app.camera;
      app.setStatus("Gerando vÃ­deo...");
      try {
        await exportarGifGiro({
          renderer: app.renderer,
          scene: app.scene,
          camera: cam,
          modelPivot: app.modelPivot,
          onProgress: (a, b) => app.setStatus(`VÃ­deo: quadro ${a}/${b}`),
        });
        app.setStatus("VÃ­deo WebM salvo");
      } catch (err) {
        app.setStatus(`VÃ­deo: ${err.message}`, true);
      }
    });

    document.getElementById("btn-compartilhar")?.addEventListener("click", async () => {
      try {
        const prefs = app.getFerramentas?.()?.lerPreferencias?.() || {};
        const url = await copiarLinkCompartilhamento({ prefs, bgIndex: prefs.bgIndex });
        app.setStatus("Link copiado para a Ã¡rea de transferÃªncia");
      } catch {
        app.setStatus("NÃ£o foi possÃ­vel copiar o link", true);
      }
    });

    document.getElementById("sel-tema")?.addEventListener("change", (e) => {
      aplicarTema(e.target.value);
    });

    document.getElementById("sel-modo-comparacao")?.addEventListener("change", (e) => {
      comparacao.setModo(e.target.value);
    });

    document.getElementById("slider-opacidade-comp")?.addEventListener("input", (e) => {
      comparacao.setOpacidade(parseFloat(e.target.value));
    });

    document.getElementById("input-comparacao")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const resultado = await app.carregarObjetoBruto(file);
        const ext = file.name.split(".").pop().toLowerCase();
        const modelo =
          app.criarContainerModelo?.(resultado.object, ext) ?? resultado.object;
        comparacao.definirModelo(
          modelo,
          document.getElementById("sel-modo-comparacao")?.value || "ghost"
        );
        app.setStatus(`ComparaÃ§Ã£o: ${file.name}`);
      } catch (err) {
        app.setStatus(`ComparaÃ§Ã£o: ${err.message}`, true);
      }
      e.target.value = "";
    });

    document.getElementById("btn-limpar-comparacao")?.addEventListener("click", () => {
      comparacao.limpar();
      app.setStatus("ComparaÃ§Ã£o removida");
    });

    document.getElementById("slider-gcode-camada")?.addEventListener("input", (e) => {
      if (!estado.gcodeGrupo) return;
      aplicarCamadaGcode(estado.gcodeGrupo, parseInt(e.target.value, 10));
    });

    suportaAr().then((ok) => {
      const btn = document.getElementById("btn-ar");
      if (!btn) return;
      btn.classList.toggle("hidden", !ok);
      btn.addEventListener("click", () => {
        iniciarAr({
          renderer: app.renderer,
          scene: app.scene,
          modelPivot: app.modelPivot,
          onStatus: app.setStatus,
        }).catch((err) => app.setStatus(err.message, true));
      });
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
    atualizarMesa,
    setExtrasBambu(meta) {
      estado.extrasBambu = meta;
    },
  };
}
