/**
 * Extensões do visualizador: impressão, formatos, export, AR, etc.
 */
import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { analisarMalha, secaoAnaliseMalha } from "./analise-malha.js";
import { criarMesaImpressao } from "./mesa-impressao.js";
import { calcularAutoOrientacao, aplicarAutoOrientacao } from "./auto-orient.js";
import {
  PRESETS_MATERIAIS,
  salvarMateriaisOriginais,
  aplicarPresetMaterial,
  restaurarMateriais,
} from "./materiais-preview.js";
import { coletarPecas, renderizarArvorePecas } from "./arvore-pecas.js";
import {
  juntarMeshesModelo,
  substituirModeloJuntado,
  substituirConteudoOrientacao,
  contarPecasVisiveis,
} from "./juntar-pecas.js";
import { copiarLinkCompartilhamento, lerSessaoDaUrl } from "./sessao-share.js";
import { sincronizarToggleMesa } from "./controles-viewport.js";
import { secaoMetadadosBambu } from "./bambu-metadados.js";
import {
  analisarFacesApoio,
  secaoApoioMesa,
  centralizarNaMesa,
  alinharBaseNaMesa,
  aplicarDeslocamentoMesa,
  marcarPosicaoBaseMesa,
} from "./posicionar-na-mesa.js";

let dracoLoader = null;
let comparacaoInstancia = null;

function obterDracoLoader() {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.175.0/examples/jsm/libs/draco/gltf/");
  }
  return dracoLoader;
}

export function initExtensoes(app) {
  const mesa = criarMesaImpressao();

  async function obterComparacao() {
    if (!comparacaoInstancia) {
      const { criarComparacao } = await import("./comparacao.js");
      comparacaoInstancia = criarComparacao(app.modelPivot, app.scene);
    }
    return comparacaoInstancia;
  }

  const estado = {
    pecas: [],
    analiseMalha: null,
    escalaMm: 1,
    presetMaterial: "padrao",
    mesaMsg: "",
    gcodeGrupo: null,
    extrasBambu: null,
    analiseApoio: null,
  };

  let overlayAtalhos = null;

  function escalaCena() {
    return app.unidadeOrigemArquivo?.(app.getFormato?.()) === "m" ? 1000 : 1;
  }

  function mmParaCena(mm) {
    return app.mmParaCena?.(mm) ?? mm;
  }

  function atualizarUiPosicaoMesa() {
    const grupo = document.getElementById("grupo-posicao-mesa");
    if (!grupo) return;
    grupo.classList.toggle("hidden", !mesa.isAtivo() || !app.getCurrentModel());
  }

  function atualizarLimitesSlidersMesa() {
    const tipo = document.getElementById("sel-mesa")?.value || "bambu_a1";
    const cfg = mesa.tipos[tipo] || mesa.tipos.bambu_a1;
    const half = Math.round(Math.min(cfg.w, cfg.d) / 2);
    for (const id of ["slider-mesa-x", "slider-mesa-z"]) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.min = String(-half);
      el.max = String(half);
      const v = parseInt(el.value, 10);
      if (v < -half) el.value = String(-half);
      if (v > half) el.value = String(half);
    }
  }

  function sincronizarSlidersPosicaoMesa(offset = { x: 0, z: 0 }) {
    const sx = document.getElementById("slider-mesa-x");
    const sz = document.getElementById("slider-mesa-z");
    const vx = document.getElementById("val-mesa-x");
    const vz = document.getElementById("val-mesa-z");
    if (sx) sx.value = String(Math.round(offset.x));
    if (sz) sz.value = String(Math.round(offset.z));
    if (vx) vx.textContent = String(Math.round(offset.x));
    if (vz) vz.textContent = String(Math.round(offset.z));
  }

  function atualizarAnaliseApoio() {
    const model = app.getCurrentModel();
    if (!model || !mesa.isAtivo()) {
      estado.analiseApoio = null;
      return;
    }
    estado.analiseApoio = analisarFacesApoio(model);
  }

  function reposicionarNaMesa(tipo = "centralizar") {
    const model = app.getCurrentModel();
    if (!model) return;

    if (tipo === "centralizar") {
      centralizarNaMesa(model);
      sincronizarSlidersPosicaoMesa({ x: 0, z: 0 });
      app.centerAndFrame?.(model, { naMesa: true });
      app.setStatus("Modelo recentrado na mesa");
    } else if (tipo === "assentar") {
      alinharBaseNaMesa(model);
      if (model.userData.mesaBasePos) {
        model.userData.mesaBasePos.y = model.position.y;
      }
      app.setStatus("Base assente na mesa");
    }

    atualizarAnaliseApoio();
    atualizarMesa();
  }

  function aplicarSliderPosicaoMesa() {
    const model = app.getCurrentModel();
    if (!model) return;
    const xmm = parseInt(document.getElementById("slider-mesa-x")?.value || "0", 10);
    const zmm = parseInt(document.getElementById("slider-mesa-z")?.value || "0", 10);
    aplicarDeslocamentoMesa(model, xmm, zmm, mmParaCena);
    sincronizarSlidersPosicaoMesa({ x: xmm, z: zmm });
    atualizarAnaliseApoio();
    atualizarMesa();
  }

  async function juntarPecasVisiveis() {
    const model = app.getCurrentModel();
    if (!model) throw new Error("Carregue um modelo primeiro.");

    (await obterComparacao()).limpar();
    const inputComp = document.getElementById("input-comparacao");
    if (inputComp) inputComp.value = "";

    const pecasAntes = contarPecasVisiveis(model);
    if (pecasAntes < 2) {
      throw new Error("São necessárias pelo menos 2 peças visíveis. Recarregue o ficheiro 3MF.");
    }

    const file = app.getModelFile?.();
    const extrasModelo = app.getModelExtras?.() || {};
    const arquivosImportados = app.getModelFiles?.() || [];
    const formato = (app.getFormato?.() || "").toUpperCase();
    const ext = file?.name?.split(".").pop()?.toLowerCase() || "";
    const eh3mf = formato === "3MF" || ext === "3mf" || ext === "mf3";
    const multiStl =
      Boolean(extrasModelo.multiStl) ||
      arquivosImportados.filter((f) => f.name?.toLowerCase().endsWith(".stl")).length >= 2;

    let montagem3mf = false;

    if (file && eh3mf) {
      app.setStatus("A montar peças do 3MF…");
      const buffer = await file.arrayBuffer();
      const { carregar3mf } = await import("./loader-3mf.js");

      const { object: montadoObj } = carregar3mf(buffer, { layout: "montado" });
      substituirConteudoOrientacao(model, montadoObj);
      model.updateMatrixWorld(true);
      montagem3mf = true;

      sincronizarSlidersPosicaoMesa({ x: 0, z: 0 });
      if (model.userData) {
        model.userData.mesaBasePos = model.position.clone();
        model.userData.mesaOffsetMm = { x: 0, z: 0 };
      }
    }

    const resultado = juntarMeshesModelo(model, {
      encaixarBbox: !montagem3mf && !multiStl,
      encaixarProximidade: multiStl,
    });

    if (!resultado.jaUnico) {
      substituirModeloJuntado(model, resultado.mesh);
      model.userData.pecasUnidas = true;
    }

    if (multiStl || montagem3mf) {
      model.position.set(0, 0, 0);
      if (model.userData) {
        model.userData.mesaOffsetMm = { x: 0, z: 0 };
        model.userData.mesaBasePos = model.position.clone();
      }
      ativarMesa(false);
    }

    estado.presetMaterial = "padrao";
    const selMaterial = document.getElementById("sel-material");
    if (selMaterial) selMaterial.value = "padrao";

    salvarMateriaisOriginais(model);
    restaurarMateriais(model);
    app.refreshModelVisual?.(model);
    estado.analiseMalha = analisarMalha(model);
    atualizarArvore();
    atualizarAnaliseApoio();
    atualizarMesa();
    app.atualizarSecaoFilamentos?.();
    app.atualizarCoresModelo?.();
    app.centerAndFrame(model, {
      naMesa: multiStl || montagem3mf ? false : mesa.isAtivo(),
    });
    let msgStatus = "Modelo já era uma única peça.";
    if (!resultado.jaUnico) {
      if (multiStl) {
        msgStatus = resultado.avisoMontagem
          ? `Montado com aviso: ${resultado.avisoMontagem}`
          : `Montado: ${pecasAntes} STL → 1 modelo.`;
      } else if (montagem3mf) {
        msgStatus = `Montado e unido: ${pecasAntes} peças → 1 modelo.`;
      } else {
        msgStatus = `Unido: ${pecasAntes} peças → 1 modelo (pecas-unidas).`;
      }
    }
    app.setStatus(msgStatus);
  }

  function atualizarMesa() {
    mesa.remover(app.modelPivot);
    if (!mesa.isAtivo() || !app.getCurrentModel()) {
      estado.mesaMsg = "";
      return;
    }
    const info = mesa.atualizar(app.modelPivot, escalaCena());
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
        titulo: "Mesa de impressão",
        itens: [["Status", estado.mesaMsg]],
      });
    }
    const apoio = secaoApoioMesa(estado.analiseApoio);
    if (apoio) secoes.push(apoio);
    return secoes;
  }

  async function carregarEstendido(file, arquivos, loaders) {
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "zip") {
      const { extrairZip } = await import("./zip-loader.js");
      const { principal, todos } = await extrairZip(file);
      return carregarEstendido(principal, todos, loaders);
    }

    if (ext === "amf") {
      const { carregarAmf } = await import("./amf-loader.js");
      const buffer = await file.arrayBuffer();
      return { object: carregarAmf(buffer), extras: {} };
    }

    if (ext === "gcode" || ext === "gco" || ext === "g") {
      const { carregarGcode, infoGcode } = await import("./gcode-loader.js");
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
      try {
        const { carregarStep } = await import("./step-loader.js");
        const buffer = await file.arrayBuffer();
        return { object: await carregarStep(buffer), extras: {} };
      } catch (err) {
        const form = new FormData();
        form.append("arquivo", file);
        const res = await fetch("/api/converter-step", { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || body.error || err.message || "Conversão STEP falhou");
        }
        const blob = await res.blob();
        const stlFile = new File([blob], file.name.replace(/\.(step|stp)$/i, ".stl"));
        return carregarEstendido(stlFile, [stlFile], loaders);
      }
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

  function ativarMesa(ativo) {
    mesa.setAtivo(ativo);
    sincronizarToggleMesa(ativo);
    atualizarLimitesSlidersMesa();
    atualizarUiPosicaoMesa();
    atualizarMesa();
    app.getFerramentas?.()?.salvarPreferencias({ mesa: ativo });
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
    if (extras.bambuImpressao || extras.formato === "3MF") {
      ativarMesa(true);
    }
    estado.analiseApoio =
      mesa.isAtivo() || extras.formato === "3MF"
        ? analisarFacesApoio(object)
        : null;
    atualizarLimitesSlidersMesa();
    sincronizarSlidersPosicaoMesa({ x: 0, z: 0 });
    atualizarUiPosicaoMesa();
    atualizarArvore();
    return secoesExtras();
  }

  function onModelCleared() {
    void obterComparacao().then((c) => c.limpar());
    mesa.remover(app.modelPivot);
    estado.pecas = [];
    estado.analiseMalha = null;
    estado.mesaMsg = "";
    estado.gcodeGrupo = null;
    estado.extrasBambu = null;
    estado.analiseApoio = null;
    atualizarUiPosicaoMesa();
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
    app.setStatus(`Escala aplicada: maior dimensão ≈ ${valorMm} mm`);
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
    app.setStatus("Sessão restaurada da URL");
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
        atualizarLimitesSlidersMesa();
        atualizarMesa();
      });
    }

    document.getElementById("btn-recentrar-mesa")?.addEventListener("click", () => {
      reposicionarNaMesa("centralizar");
    });

    document.getElementById("btn-assentar-mesa")?.addEventListener("click", () => {
      reposicionarNaMesa("assentar");
    });

    for (const id of ["slider-mesa-x", "slider-mesa-z"]) {
      document.getElementById(id)?.addEventListener("input", () => {
        const sx = document.getElementById("slider-mesa-x");
        const sz = document.getElementById("slider-mesa-z");
        document.getElementById("val-mesa-x").textContent = sx?.value ?? "0";
        document.getElementById("val-mesa-z").textContent = sz?.value ?? "0";
        aplicarSliderPosicaoMesa();
      });
    }

    document.getElementById("chk-mesa")?.addEventListener("change", (e) => {
      ativarMesa(e.target.checked);
    });

    document.getElementById("chk-mesa-overlay")?.addEventListener("change", (e) => {
      ativarMesa(e.target.checked);
    });

    document.getElementById("btn-auto-orient")?.addEventListener("click", () => {
      const model = app.getCurrentModel();
      if (!model) return;
      const q = calcularAutoOrientacao(model);
      aplicarAutoOrientacao(app.modelPivot, q);
      if (mesa.isAtivo()) {
        centralizarNaMesa(model);
        sincronizarSlidersPosicaoMesa({ x: 0, z: 0 });
      }
      app.centerAndFrame(model, { naMesa: mesa.isAtivo() });
      atualizarAnaliseApoio();
      atualizarMesa();
      app.setStatus("Auto-orientação aplicada");
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
        app.setStatus("Informe uma escala válida em mm", true);
        return;
      }
      aplicarEscala(v);
    });

    document.getElementById("btn-png-alpha")?.addEventListener("click", async () => {
      const { capturarPngTransparente } = await import("./export-media.js");
      const cam = app.getFerramentas?.()?.cameraAtiva?.() ?? app.camera;
      capturarPngTransparente(app.renderer, app.scene, cam);
      app.setStatus("PNG com fundo transparente salvo");
    });

    document.getElementById("btn-gif-giro")?.addEventListener("click", async () => {
      const { exportarGifGiro } = await import("./export-media.js");
      const cam = app.getFerramentas?.()?.cameraAtiva?.() ?? app.camera;
      app.setStatus("Gerando vídeo...");
      try {
        await exportarGifGiro({
          renderer: app.renderer,
          scene: app.scene,
          camera: cam,
          modelPivot: app.modelPivot,
          onProgress: (a, b) => app.setStatus(`Vídeo: quadro ${a}/${b}`),
        });
        app.setStatus("Vídeo WebM salvo");
      } catch (err) {
        app.setStatus(`Vídeo: ${err.message}`, true);
      }
    });

    document.getElementById("btn-compartilhar")?.addEventListener("click", async () => {
      try {
        const prefs = app.getFerramentas?.()?.lerPreferencias?.() || {};
        const url = await copiarLinkCompartilhamento({ prefs, bgIndex: prefs.bgIndex });
        app.setStatus("Link copiado para a área de transferência");
      } catch {
        app.setStatus("Não foi possível copiar o link", true);
      }
    });

    document.getElementById("sel-tema")?.addEventListener("change", (e) => {
      aplicarTema(e.target.value);
    });

    document.getElementById("sel-modo-comparacao")?.addEventListener("change", async (e) => {
      (await obterComparacao()).setModo(e.target.value);
    });

    document.getElementById("slider-opacidade-comp")?.addEventListener("input", async (e) => {
      (await obterComparacao()).setOpacidade(parseFloat(e.target.value));
    });

    document.getElementById("input-comparacao")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const resultado = await app.carregarObjetoBruto(file);
        const ext = file.name.split(".").pop().toLowerCase();
        const modelo =
          app.criarContainerModelo?.(resultado.object, ext) ?? resultado.object;
        const comparacao = await obterComparacao();
        comparacao.definirModelo(
          modelo,
          document.getElementById("sel-modo-comparacao")?.value || "ghost"
        );
        app.setStatus(`Comparação: ${file.name}`);
      } catch (err) {
        app.setStatus(`Comparação: ${err.message}`, true);
      }
      e.target.value = "";
    });

    document.getElementById("btn-juntar-pecas")?.addEventListener("click", async () => {
      try {
        await juntarPecasVisiveis();
      } catch (err) {
        app.setStatus(err.message, true);
      }
    });

    document.getElementById("btn-limpar-comparacao")?.addEventListener("click", async () => {
      (await obterComparacao()).limpar();
      app.setStatus("Comparação removida");
    });

    document.getElementById("slider-gcode-camada")?.addEventListener("input", async (e) => {
      if (!estado.gcodeGrupo) return;
      const { aplicarCamadaGcode } = await import("./gcode-loader.js");
      aplicarCamadaGcode(estado.gcodeGrupo, parseInt(e.target.value, 10));
    });

    import("./ar-xr.js").then(({ suportaAr, iniciarAr }) => {
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
    reposicionarNaMesa,
    setExtrasBambu(meta) {
      estado.extrasBambu = meta;
    },
  };
}
