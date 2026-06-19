/**
 * Ferramentas avançadas do visualizador 3D.
 */
import * as THREE from "three";
import {
  analisarFilamentosBambu,
  aplicarVisibilidadeSuportes,
  modeloTemSuportesBambu,
} from "./bambu-3mf.js";
import { criarCenarioShowcase } from "./cenario-showcase.js";

const CHAVE_PREFS = "visualizador3d-prefs";
const PREFS_PADRAO = {
  cores: true,
  giroAuto: false,
  bbox: false,
  ortografico: false,
  regua: false,
  suportes: false,
  grade: false,
  eixos: false,
  medidas: false,
  cenarioMesa: false,
  luz: 1.1,
  bgIndex: 0,
};

const VELOCIDADE_INERCIA = 0.94;
const INERCIA_MIN = 0.00015;
const GIRO_AUTO_VEL = 0.006;

export function initFerramentas(app) {
  const estado = {
    inercia: 0,
    arrastando: false,
    giroAuto: false,
    bbox: false,
    ortografico: false,
    regua: false,
    mixer: null,
    acaoAnimacao: null,
    animando: false,
    reguaPontos: [],
    filamentos: [],
    filtroCor: null,
    carregando: false,
    mostrarSuportes: false,
    temSuportes: false,
    grade: false,
    eixos: false,
    medidas: false,
    cenarioMesa: false,
  };

  let bboxHelper = null;
  let cenario = null;
  let gradeHelper = null;
  let axesHelper = null;
  let medidasOverlay = null;
  let reguaLinha = null;
  let reguaMarcadores = null;
  let reguaLabel = null;
  let perspCamera = app.camera;
  let orthoCamera = null;
  let hemiLight = null;
  let dirLight = null;

  const overlay = document.getElementById("loading-overlay");
  const painelAnim = document.getElementById("painel-animacao");
  const btnAnim = document.getElementById("btn-animacao");

  function setLoading(ativo, texto = "Carregando...") {
    estado.carregando = ativo;
    if (!overlay) return;
    overlay.classList.toggle("hidden", !ativo);
    const msg = overlay.querySelector(".loading-text");
    if (msg) msg.textContent = texto;
  }

  function criarOrtho() {
    const w = app.container.clientWidth || 800;
    const h = app.container.clientHeight || 600;
    const aspect = w / h;
    const half = app.getCameraDistance() * 0.55;
    orthoCamera = new THREE.OrthographicCamera(
      -half * aspect,
      half * aspect,
      half,
      -half,
      0.01,
      100000
    );
    orthoCamera.position.copy(perspCamera.position);
    orthoCamera.lookAt(app.getCentroVisao());
    orthoCamera.updateProjectionMatrix();
  }

  function cameraAtiva() {
    return estado.ortografico && orthoCamera ? orthoCamera : perspCamera;
  }

  function sincronizarCameras() {
    if (!orthoCamera) return;
    orthoCamera.position.copy(perspCamera.position);
    orthoCamera.quaternion.copy(perspCamera.quaternion);
    const w = app.container.clientWidth || 800;
    const h = app.container.clientHeight || 600;
    const aspect = w / h;
    const half = app.getCameraDistance() * 0.55;
    orthoCamera.left = -half * aspect;
    orthoCamera.right = half * aspect;
    orthoCamera.top = half;
    orthoCamera.bottom = -half;
    orthoCamera.updateProjectionMatrix();
  }

  function atualizarBbox() {
    if (bboxHelper) {
      app.scene.remove(bboxHelper);
      bboxHelper = null;
    }
    if (!estado.bbox || !app.getCurrentModel()) return;
    const box = new THREE.Box3().setFromObject(app.modelPivot);
    bboxHelper = new THREE.Box3Helper(box, 0xe8a317);
    app.scene.add(bboxHelper);
  }

  function removerGrade() {
    if (!gradeHelper) return;
    app.scene.remove(gradeHelper);
    gradeHelper.geometry.dispose();
    const mats = gradeHelper.material;
    if (Array.isArray(mats)) mats.forEach((m) => m.dispose());
    else mats?.dispose();
    gradeHelper = null;
  }

  function atualizarGrade() {
    removerGrade();
    if (!estado.grade || !app.getCurrentModel() || estado.cenarioMesa) return;

    app.assentarModelosNaGrade?.();

    const box = new THREE.Box3().setFromObject(app.getCurrentModel());
    const size = box.getSize(new THREE.Vector3());
    const cell = app.unidadeParaCena(0.01);
    const span = Math.max(size.x, size.z, cell * 4) * 1.4;
    const divisions = Math.min(40, Math.max(8, Math.ceil(span / cell)));
    const gridSize = divisions * cell;

    gradeHelper = new THREE.GridHelper(gridSize, divisions, 0x585b70, 0x313244);
    gradeHelper.position.set(
      (box.min.x + box.max.x) * 0.5,
      0,
      (box.min.z + box.max.z) * 0.5
    );
    app.scene.add(gradeHelper);
  }

  function removerEixos() {
    if (!axesHelper) return;
    app.scene.remove(axesHelper);
    axesHelper.dispose();
    axesHelper = null;
  }

  function atualizarEixos() {
    removerEixos();
    if (!estado.eixos || !app.getCurrentModel()) return;

    const box = new THREE.Box3().setFromObject(app.modelPivot);
    const size = box.getSize(new THREE.Vector3());
    const len = Math.max(size.x, size.y, size.z) * 0.55;
    axesHelper = new THREE.AxesHelper(len);
    axesHelper.position.copy(box.getCenter(new THREE.Vector3()));
    app.scene.add(axesHelper);
  }

  function alvosMedidas() {
    const sel = app.getItensSelecionados3d?.() ?? [];
    if (sel.length) return sel;
    const model = app.getCurrentModel();
    if (!model || app.temVariosModelosNaCena?.()) return [];
    const grupos = app.getGruposItems?.() ?? [];
    if (grupos.length === 1) return [grupos[0].object3d];
    return model.children.length === 1 ? [model.children[0]] : [];
  }

  function resumoMedidasModelo() {
    const alvos = alvosMedidas();
    if (!alvos.length || !app.analisarGeometria || !app.converterMedidas || !app.getFormato) {
      return null;
    }

    const caixa = new THREE.Box3();
    const geoAcum = {
      malhas: 0,
      geometrias: 0,
      vertices: 0,
      triangulos: 0,
      volume: 0,
      tamanho: new THREE.Vector3(),
      centro: new THREE.Vector3(),
      diagonal: 0,
    };

    for (const obj of alvos) {
      obj.updateMatrixWorld(true);
      caixa.expandByObject(obj);
      const geo = app.analisarGeometria(obj);
      geoAcum.malhas += geo.malhas;
      geoAcum.geometrias += geo.geometrias;
      geoAcum.vertices += geo.vertices;
      geoAcum.triangulos += geo.triangulos;
      geoAcum.volume += geo.volume ?? 0;
    }

    geoAcum.tamanho = caixa.getSize(new THREE.Vector3());
    geoAcum.centro = caixa.getCenter(new THREE.Vector3());
    geoAcum.diagonal = geoAcum.tamanho.length();

    const formato = alvos[0].userData.formato ?? app.getFormato();
    const conv = app.converterMedidas(geoAcum, formato);
    const mm = (v) => Math.round(v * 1000);
    const dim = `${mm(conv.tamanhoM.x)} × ${mm(conv.tamanhoM.y)} × ${mm(conv.tamanhoM.z)} mm`;
    const vol = conv.volumeM3 > 0 ? app.formatarVolume?.(conv.volumeM3, conv.unidade) ?? "" : "";
    const tris = geoAcum.triangulos.toLocaleString("pt-BR");
    const rotulo =
      alvos.length > 1 ? `${alvos.length} modelos · ${dim}` : dim;
    return { dim: rotulo, vol, tris };
  }

  function atualizarMedidasOverlay() {
    if (!medidasOverlay) {
      medidasOverlay = document.createElement("div");
      medidasOverlay.className = "medidas-overlay hidden";
      medidasOverlay.setAttribute("aria-live", "polite");
      document.querySelector(".viewer")?.appendChild(medidasOverlay);
    }

    if (!alvosMedidas().length) {
      medidasOverlay.classList.add("hidden");
      return;
    }

    const resumo = resumoMedidasModelo();
    if (!resumo) {
      medidasOverlay.classList.add("hidden");
      return;
    }

    medidasOverlay.innerHTML = `
      <strong>${resumo.dim}</strong>
      ${resumo.vol ? `<span>${resumo.vol}</span>` : ""}
      <span>${resumo.tris} triângulos</span>`;
    medidasOverlay.classList.remove("hidden");
  }

  function atualizarAuxiliaresVisuais() {
    atualizarGrade();
    atualizarEixos();
    atualizarMedidasOverlay();
    cenario?.atualizar();
  }

  async function copiarMedidasModelo() {
    const resumo = resumoMedidasModelo();
    if (!resumo) {
      app.setStatus("Carregue um modelo primeiro", true);
      return;
    }
    const texto = `${resumo.dim} · ${resumo.vol} · ${resumo.tris} triângulos`;
    try {
      await navigator.clipboard.writeText(texto);
      app.setStatus("Dimensões copiadas");
    } catch {
      app.setStatus("Não foi possível copiar", true);
    }
  }

  function resetarPan() {
    app.setPanOffset(0, 0, 0);
    app.setStatus("Pan resetado");
  }

  function limparAuxiliaresVisuais() {
    removerGrade();
    removerEixos();
    cenario?.setAtivo(false);
    estado.cenarioMesa = false;
    const chkCenario = document.getElementById("chk-cenario-mesa");
    if (chkCenario) chkCenario.checked = false;
    if (medidasOverlay) {
      medidasOverlay.classList.add("hidden");
    }
  }

  function limparVisualRegua() {
    if (reguaLinha) {
      app.scene.remove(reguaLinha);
      reguaLinha.geometry.dispose();
      reguaLinha.material.dispose();
      reguaLinha = null;
    }
    if (reguaMarcadores) {
      app.scene.remove(reguaMarcadores);
      reguaMarcadores.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
      reguaMarcadores = null;
    }
    if (reguaLabel) {
      reguaLabel.remove();
      reguaLabel = null;
    }
  }

  function limparRegua() {
    estado.reguaPontos = [];
    limparVisualRegua();
  }

  function atualizarRegua() {
    limparVisualRegua();
    if (estado.reguaPontos.length === 0) return;

    reguaMarcadores = new THREE.Group();
    const esfera = new THREE.SphereGeometry(
      app.unidadeParaCena(0.002),
      12,
      12
    );
    estado.reguaPontos.forEach((p) => {
      const m = new THREE.Mesh(
        esfera,
        new THREE.MeshBasicMaterial({ color: 0xf9e2af })
      );
      m.position.copy(p);
      reguaMarcadores.add(m);
    });
    app.scene.add(reguaMarcadores);

    if (estado.reguaPontos.length === 2) {
      const [p1, p2] = estado.reguaPontos;
      const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      reguaLinha = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color: 0xf9e2af })
      );
      app.scene.add(reguaLinha);

      const dist = p1.distanceTo(p2);
      const metros = app.cenaParaMetros(dist);
      reguaLabel = document.createElement("div");
      reguaLabel.className = "regua-label";
      reguaLabel.textContent = app.formatarDistancia(metros);
      document.querySelector(".viewer").appendChild(reguaLabel);
      atualizarLabelRegua();
    }
  }

  function atualizarLabelRegua() {
    if (!reguaLabel || estado.reguaPontos.length < 2) return;
    const meio = new THREE.Vector3()
      .addVectors(estado.reguaPontos[0], estado.reguaPontos[1])
      .multiplyScalar(0.5);
    meio.project(cameraAtiva());
    const w = app.container.clientWidth;
    const h = app.container.clientHeight;
    const x = (meio.x * 0.5 + 0.5) * w;
    const y = (-meio.y * 0.5 + 0.5) * h;
    reguaLabel.style.left = `${x}px`;
    reguaLabel.style.top = `${y}px`;
  }

  function raycast(event) {
    const rect = app.canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, cameraAtiva());
    return ray.intersectObject(app.modelPivot, true);
  }

  function aplicarFiltroCor(hex) {
    if (!app.getCurrentModel()) return;
    if (hex === null) {
      estado.filtroCor = null;
    } else {
      estado.filtroCor = estado.filtroCor === hex ? null : hex;
    }

    app.getCurrentModel().traverse((c) => {
      if (!c.isMesh) return;
      if (!estado.filtroCor) {
        c.visible = true;
        return;
      }
      let corMesh = null;
      if (c.name?.startsWith("filament-")) {
        corMesh = c.material?.color
          ? `#${c.material.color.getHexString()}`.toUpperCase()
          : null;
      } else if (c.material?.color) {
        corMesh = `#${c.material.color.getHexString()}`.toUpperCase();
      }
      c.visible = corMesh === estado.filtroCor;
    });

    document.querySelectorAll(".cor-modelo-swatch").forEach((el) => {
      el.classList.toggle("ativo", el.dataset.hex === estado.filtroCor);
    });
    app.setStatus(
      estado.filtroCor
        ? `Filtrando cor ${estado.filtroCor}`
        : "Todas as cores visíveis"
    );
  }

  function rotuloFilamento(f) {
    if (f.nome) return `${f.nome} (${f.hex})`;
    return `Filamento ${f.slot} (${f.hex})`;
  }

  function montarSecaoFilamentosDeObject(object) {
    const bambu = object?.userData?.bambuExtras ?? object?.userData?.extras?.bambu;
    const filamentos = analisarFilamentosBambu(object, bambu);
    if (!filamentos.length) return null;

    const totalTris = filamentos.reduce((s, f) => s + f.triangles, 0);
    const itens = filamentos.map((f) => {
      const pct = totalTris ? ((f.triangles / totalTris) * 100).toFixed(1) : "0";
      return [
        rotuloFilamento(f),
        `${pct}% · ${f.triangles.toLocaleString("pt-BR")} triângulos`,
      ];
    });

    return { titulo: "Filamentos", itens };
  }

  function montarSecaoFilamentos() {
    if (!estado.filamentos.length) return null;

    const totalTris = estado.filamentos.reduce((s, f) => s + f.triangles, 0);
    const itens = estado.filamentos.map((f) => {
      const pct = totalTris ? ((f.triangles / totalTris) * 100).toFixed(1) : "0";
      return [
        rotuloFilamento(f),
        `${pct}% · ${f.triangles.toLocaleString("pt-BR")} triângulos`,
      ];
    });

    if (estado.temSuportes) {
      itens.push([
        "Suportes",
        estado.mostrarSuportes ? "Visíveis" : "Ocultos",
      ]);
    }

    return { titulo: "Filamentos", itens };
  }

  function atualizarToggleSuportes() {
    const linha = document.getElementById("linha-suportes");
    if (!linha) return;
    linha.classList.toggle("hidden", !estado.temSuportes);
  }

  function aplicarSuportes() {
    if (!app.getCurrentModel()) return;
    aplicarVisibilidadeSuportes(app.getCurrentModel(), estado.mostrarSuportes);
  }

  function lerPreferencias() {
    try {
      return { ...PREFS_PADRAO, ...JSON.parse(localStorage.getItem(CHAVE_PREFS) || "{}") };
    } catch {
      return { ...PREFS_PADRAO };
    }
  }

  function salvarPreferencias(parcial) {
    try {
      const atual = lerPreferencias();
      localStorage.setItem(
        CHAVE_PREFS,
        JSON.stringify({ ...atual, ...parcial })
      );
    } catch {
      /* ignore */
    }
  }

  function dispararChange(id) {
    const el = document.getElementById(id);
    if (el) el.dispatchEvent(new Event("change"));
  }

  function aplicarPreferencias() {
    const prefs = lerPreferencias();

    const chk = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.checked = val;
    };

    chk("chk-cores", prefs.cores);
    chk("chk-giro-auto", prefs.giroAuto);
    chk("chk-bbox", prefs.bbox);
    chk("chk-ortografico", prefs.ortografico);
    chk("chk-regua", prefs.regua);
    chk("chk-suportes", prefs.suportes);
    chk("chk-grade", prefs.grade);
    chk("chk-eixos", prefs.eixos);
    chk("chk-cenario-mesa", prefs.cenarioMesa);

    const sliderLuz = document.getElementById("slider-luz");
    if (sliderLuz) sliderLuz.value = prefs.luz;

    app.aplicarPreferenciaCores?.(prefs.cores);
    app.aplicarPreferenciaFundo?.(prefs.bgIndex);

    dispararChange("chk-giro-auto");
    dispararChange("chk-bbox");
    dispararChange("chk-ortografico");
    dispararChange("chk-regua");
    dispararChange("chk-grade");
    dispararChange("chk-eixos");
    dispararChange("chk-cenario-mesa");
    dispararChange("slider-luz");
  }

    function definirVista(tipo) {
    app.resetarRotacao();
    app.setPanOffset(0, 0, 0);

    const elev = Math.PI / 2 - 0.2;
    const presets = {
      frente: { theta: 0, phi: elev },
      tras: { theta: Math.PI, phi: elev },
      topo: { theta: 0, phi: 0.12 },
      fundo: { theta: 0, phi: Math.PI - 0.12 },
      direita: { theta: Math.PI / 2, phi: elev },
      lateral: { theta: Math.PI / 2, phi: elev },
      esquerda: { theta: -Math.PI / 2, phi: elev },
      iso: { theta: Math.PI / 4, phi: Math.PI / 2 - 0.45 },
    };

    const dest = presets[tipo] || presets.iso;
    app.setOrbitAngles(dest.theta, dest.phi);
    sincronizarCameras();

    document.querySelectorAll(".btn-vista.is-ativa").forEach((b) => b.classList.remove("is-ativa"));
    document.querySelector(`.btn-vista[data-vista="${tipo}"]`)?.classList.add("is-ativa");

    const rotulos = {
      frente: "Frente",
      tras: "Trás",
      topo: "Topo",
      fundo: "Fundo",
      direita: "Direita",
      esquerda: "Esquerda",
      lateral: "Lateral",
      iso: "Isométrica",
    };
    app.setStatus(`Vista: ${rotulos[tipo] || tipo}`);
  }

  function prepararCaptura() {
    cenario?.atualizar();
    sincronizarCameras();
  }

  function capturarTela() {
    prepararCaptura();
    app.renderer.render(app.scene, cameraAtiva());
    const link = document.createElement("a");
    link.download = estado.cenarioMesa
      ? `estudio-gd3d-${Date.now()}.png`
      : `visualizador-${Date.now()}.png`;
    link.href = app.canvas.toDataURL("image/png");
    link.click();
    app.setStatus(estado.cenarioMesa ? "Captura do estúdio salva" : "Captura de tela salva");
  }

  function pararAnimacao() {
    if (estado.mixer) {
      estado.mixer.stopAllAction();
      estado.mixer = null;
    }
    estado.acaoAnimacao = null;
    estado.animando = false;
    if (painelAnim) painelAnim.classList.add("hidden");
  }

  function iniciarAnimacaoClips(clips, alvo) {
    pararAnimacao();
    if (!clips?.length || !alvo) return;
    estado.mixer = new THREE.AnimationMixer(alvo);
    estado.acaoAnimacao = estado.mixer.clipAction(clips[0]);
    estado.acaoAnimacao.play();
    estado.animando = true;
    if (painelAnim) painelAnim.classList.remove("hidden");
    if (btnAnim) btnAnim.textContent = "Pausar animação";
  }

  function iniciarAnimacaoGltf(gltf) {
    if (!gltf?.animations?.length) return;
    iniciarAnimacaoClips(gltf.animations, gltf.scene);
  }

  function tick(delta) {
    if (estado.giroAuto && app.getCurrentModel() && !estado.arrastando) {
      app.addOrbitTheta(GIRO_AUTO_VEL);
    }

    if (
      !estado.arrastando &&
      Math.abs(estado.inercia) > INERCIA_MIN &&
      app.getCurrentModel()
    ) {
      app.addOrbitTheta(estado.inercia);
      estado.inercia *= VELOCIDADE_INERCIA;
    }

    if (estado.mixer) estado.mixer.update(delta);
    if (estado.bbox && !estado.arrastando) atualizarBbox();
    if (estado.reguaPontos.length === 2) atualizarLabelRegua();
  }

  function onPointerDown(event) {
    if (estado.regua && event.button === 0 && !event.shiftKey) {
      const hits = raycast(event);
      if (hits.length) {
        const ponto = hits[0].point.clone();
        if (estado.reguaPontos.length >= 2) estado.reguaPontos = [];
        estado.reguaPontos.push(ponto);
        atualizarRegua();
        if (estado.reguaPontos.length === 1) {
          app.setStatus("Régua: selecione o segundo ponto");
        } else if (estado.reguaPontos.length >= 2) {
          const dist = estado.reguaPontos[0].distanceTo(estado.reguaPontos[1]);
          app.setStatus(`Distância: ${app.formatarDistancia(app.cenaParaMetros(dist))}`);
        }
      }
      return true;
    }
    estado.arrastando = true;
    estado.inercia = 0;
    return false;
  }

  function onPointerUp() {
    estado.arrastando = false;
    if (estado.bbox) atualizarBbox();
  }

  function onPointerMoveDrag(dx) {
    if (!estado.arrastando || estado.regua) return;
    estado.inercia = -dx * app.getVelocidadeRotacao() * 0.35;
  }

  function onModelLoaded(object, extras, geo, formato) {
    estado.filamentos = analisarFilamentosBambu(object, extras.bambu);
    estado.filtroCor = null;
    estado.temSuportes = modeloTemSuportesBambu(object);
    estado.mostrarSuportes = document.getElementById("chk-suportes")?.checked ?? false;
    atualizarToggleSuportes();
    aplicarSuportes();
    pararAnimacao();
    if (extras.gltf) iniciarAnimacaoGltf(extras.gltf);
    else if (extras.animacoes) {
      iniciarAnimacaoClips(extras.animacoes.clips, extras.animacoes.alvo);
    }

    atualizarBbox();
    atualizarAuxiliaresVisuais();

    return montarSecaoFilamentos();
  }

  function onModelCleared() {
    pararAnimacao();
    limparRegua();
    limparAuxiliaresVisuais();
    estado.filamentos = [];
    estado.filtroCor = null;
    estado.temSuportes = false;
    atualizarToggleSuportes();
    if (bboxHelper) {
      app.scene.remove(bboxHelper);
      bboxHelper = null;
    }
  }

  function bindUi() {
    const viewer = document.querySelector(".viewer");

    document.getElementById("btn-screenshot")?.addEventListener("click", capturarTela);
    document.getElementById("btn-fullscreen")?.addEventListener("click", () => {
      document.documentElement.requestFullscreen?.();
    });
    document.getElementById("btn-copiar-medidas")?.addEventListener("click", () => {
      copiarMedidasModelo();
    });
    document.getElementById("btn-reset-pan")?.addEventListener("click", resetarPan);

    document.getElementById("chk-giro-auto")?.addEventListener("change", (e) => {
      estado.giroAuto = e.target.checked;
      salvarPreferencias({ giroAuto: e.target.checked });
    });
    document.getElementById("chk-bbox")?.addEventListener("change", (e) => {
      estado.bbox = e.target.checked;
      atualizarBbox();
      salvarPreferencias({ bbox: e.target.checked });
    });
    document.getElementById("chk-ortografico")?.addEventListener("change", (e) => {
      estado.ortografico = e.target.checked;
      if (estado.ortografico) {
        criarOrtho();
        sincronizarCameras();
      }
      salvarPreferencias({ ortografico: e.target.checked });
      app.setStatus(estado.ortografico ? "Projeção ortográfica" : "Projeção perspectiva");
    });
    document.getElementById("chk-regua")?.addEventListener("change", (e) => {
      estado.regua = e.target.checked;
      if (!estado.regua) limparRegua();
      salvarPreferencias({ regua: e.target.checked });
      app.setStatus(estado.regua ? "Régua: clique em dois pontos" : "Régua desativada");
    });
    document.getElementById("chk-grade")?.addEventListener("change", (e) => {
      estado.grade = e.target.checked;
      if (e.target.checked) app.assentarModelosNaGrade?.();
      atualizarGrade();
      salvarPreferencias({ grade: e.target.checked });
    });
    document.getElementById("chk-eixos")?.addEventListener("change", (e) => {
      estado.eixos = e.target.checked;
      atualizarEixos();
      salvarPreferencias({ eixos: e.target.checked });
    });
    document.getElementById("chk-cenario-mesa")?.addEventListener("change", async (e) => {
      estado.cenarioMesa = e.target.checked;
      if (!cenario) cenario = criarCenarioShowcase(app);
      await cenario.setAtivo(e.target.checked);
      if (!cenario.getAtivo()) {
        e.target.checked = false;
        estado.cenarioMesa = false;
        salvarPreferencias({ cenarioMesa: false });
        return;
      }
      if (e.target.checked && estado.grade) {
        estado.grade = false;
        const chkGrade = document.getElementById("chk-grade");
        if (chkGrade) chkGrade.checked = false;
        removerGrade();
      }
      salvarPreferencias({ cenarioMesa: e.target.checked });
    });
    document.getElementById("chk-suportes")?.addEventListener("change", (e) => {
      estado.mostrarSuportes = e.target.checked;
      aplicarSuportes();
      salvarPreferencias({ suportes: e.target.checked });
      app.atualizarSecaoFilamentos?.();
      app.setStatus(estado.mostrarSuportes ? "Suportes visíveis" : "Suportes ocultos");
    });

    document.getElementById("slider-luz")?.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      if (hemiLight) hemiLight.intensity = v;
      if (dirLight) dirLight.intensity = v * 0.85;
      salvarPreferencias({ luz: v });
    });
    document.querySelectorAll("[data-vista]").forEach((btn) => {
      btn.addEventListener("click", () => definirVista(btn.dataset.vista));
    });

    document.getElementById("btn-vista-centrar")?.addEventListener("click", () => {
      if (app.getCurrentModel()) {
        app.resetOrbitFrontal?.();
        app.centerAndFrame(app.getCurrentModel());
      }
    });

    btnAnim?.addEventListener("click", () => {
      if (!estado.acaoAnimacao) return;
      if (estado.animando) {
        estado.acaoAnimacao.paused = true;
        estado.animando = false;
        btnAnim.textContent = "Reproduzir animação";
      } else {
        estado.acaoAnimacao.paused = false;
        estado.animando = true;
        btnAnim.textContent = "Pausar animação";
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.fullscreenElement) {
        document.exitFullscreen?.();
        return;
      }
      if (e.target.matches("input, select, textarea")) return;
      if (e.key === "r" || e.key === "R") {
        if (app.getCurrentModel()) app.centerAndFrame(app.getCurrentModel());
      } else if (e.key === "f" || e.key === "F") {
        document.documentElement.requestFullscreen?.();
      } else if (e.key === "s" || e.key === "S") {
        capturarTela();
      }
    });

    const params = new URLSearchParams(location.search);
    const modeloUrl = params.get("modelo");
    if (modeloUrl && !params.get("produto")) {
      const fetchUrl = /^https?:\/\//i.test(modeloUrl)
        ? `/api/proxy?url=${encodeURIComponent(modeloUrl)}`
        : modeloUrl;
      fetch(fetchUrl)
        .then((r) => {
          if (!r.ok) throw new Error("Modelo não encontrado");
          return r.blob();
        })
        .then((blob) => {
          const nome = decodeURIComponent(modeloUrl.split("/").pop() || "modelo");
          app.loadFile(new File([blob], nome));
        })
        .catch((err) => app.setStatus(`URL: ${err.message}`, true));
    }

    aplicarPreferencias();
    setLoading(false);
  }

  return {
    bindUi,
    tick,
    setLoading,
    onPointerDown,
    onPointerUp,
    onPointerMoveDrag,
    onModelLoaded,
    onModelCleared,
    aplicarFiltroCor,
    cameraAtiva,
    sincronizarCameras,
    prepararCaptura,
    isCenarioAtivo: () => estado.cenarioMesa,
    setLights(h, d) {
      hemiLight = h;
      dirLight = d;
      if (dirLight) {
        app.scene.add(dirLight.target);
      }
    },
    getHemiLight: () => hemiLight,
    getDirLight: () => dirLight,
    getEstado: () => estado,
    getSecaoFilamentos: () => montarSecaoFilamentos(),
    getSecaoFilamentosDeObject: (object) => montarSecaoFilamentosDeObject(object),
    salvarPreferencias,
    lerPreferencias,
    aplicarPreferencias,
    atualizarToggleSuportes,
    desativarGiroAuto() {
      estado.giroAuto = false;
      const el = document.getElementById('chk-giro-auto');
      if (el) el.checked = false;
      salvarPreferencias({ giroAuto: false });
    },
    atualizarBbox,
    aplicarSuportes,
    atualizarAuxiliaresVisuais,
  };
}
