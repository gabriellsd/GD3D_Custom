/**
 * Ferramentas avançadas do visualizador 3D.
 */
import * as THREE from "three";
import {
  analisarFilamentosBambu,
  aplicarVisibilidadeSuportes,
  modeloTemSuportesBambu,
} from "./bambu-3mf.js";

const CHAVE_PREFS = "visualizador3d-prefs";
const PREFS_PADRAO = {
  cores: true,
  wireframe: false,
  giroAuto: false,
  sombra: false,
  bbox: false,
  referencia: false,
  ortografico: false,
  overhangs: false,
  regua: false,
  planoCorte: false,
  suportes: false,
  mesa: false,
  presetMaterial: "padrao",
  luz: 1.1,
  bgIndex: 0,
};

const VELOCIDADE_INERCIA = 0.94;
const INERCIA_MIN = 0.00015;
const GIRO_AUTO_VEL = 0.004;
const CHAVE_RECENTES = "visualizador3d-recentes";
const MAX_RECENTES = 8;
const DB_NOME = "visualizador3d";
const DB_VERSAO = 1;
const DB_LOJA = "arquivos";
const MAX_RECENTE_BYTES = 60 * 1024 * 1024;

function abrirDbRecentes() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_LOJA)) {
        req.result.createObjectStore(DB_LOJA, { keyPath: "nome" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function salvarArquivoRecente(arquivo) {
  const db = await abrirDbRecentes();
  try {
    const dados = await arquivo.arrayBuffer();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_LOJA, "readwrite");
      tx.objectStore(DB_LOJA).put({
        nome: arquivo.name,
        formato: arquivo.name.split(".").pop().toLowerCase(),
        tamanho: arquivo.size,
        modificado: arquivo.lastModified,
        tipo: arquivo.type || "",
        dados,
        data: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function lerArquivoRecente(nome) {
  const db = await abrirDbRecentes();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_LOJA, "readonly");
      const req = tx.objectStore(DB_LOJA).get(nome);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function limparArquivosRecentesExceto(nomes) {
  const db = await abrirDbRecentes();
  try {
    const permitidos = new Set(nomes);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_LOJA, "readwrite");
      const loja = tx.objectStore(DB_LOJA);
      const req = loja.getAllKeys();
      req.onsuccess = () => {
        for (const chave of req.result) {
          if (!permitidos.has(chave)) loja.delete(chave);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function escapeHtml(texto) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

export function initFerramentas(app) {
  const estado = {
    inercia: 0,
    arrastando: false,
    giroAuto: false,
    sombra: false,
    bbox: false,
    referencia: false,
    ortografico: false,
    overhangs: false,
    regua: false,
    planoCorte: false,
    clipAltura: 0,
    anguloOverhang: 45,
    mixer: null,
    acaoAnimacao: null,
    animando: false,
    reguaPontos: [],
    filamentos: [],
    filtroCor: null,
    meshOverhangBackup: new Map(),
    carregando: false,
    mostrarSuportes: false,
    temSuportes: false,
  };

  let bboxHelper = null;
  let chao = null;
  let cuboRef = null;
  let reguaLinha = null;
  let reguaMarcadores = null;
  let reguaLabel = null;
  let perspCamera = app.camera;
  let orthoCamera = null;
  let hemiLight = null;
  let dirLight = null;

  const overlay = document.getElementById("loading-overlay");
  const listaRecentes = document.getElementById("lista-recentes");
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

  function configurarSombras(ativo) {
    app.renderer.shadowMap.enabled = ativo;
    if (!chao) {
      const geo = new THREE.PlaneGeometry(200, 200);
      const mat = new THREE.ShadowMaterial({ opacity: 0.25 });
      chao = new THREE.Mesh(geo, mat);
      chao.rotation.x = -Math.PI / 2;
      chao.receiveShadow = true;
      chao.visible = false;
      app.scene.add(chao);
    }
    chao.visible = ativo;
    if (dirLight) dirLight.castShadow = ativo;
    app.getCurrentModel()?.traverse((c) => {
      if (c.isMesh) c.castShadow = ativo;
    });
  }

  function atualizarBbox() {
    if (!estado.bbox || !app.getCurrentModel()) {
      if (bboxHelper) {
        bboxHelper.geometry?.dispose();
        app.scene.remove(bboxHelper);
        bboxHelper = null;
      }
      return;
    }
    const box = new THREE.Box3().setFromObject(app.modelPivot);
    if (!bboxHelper) {
      bboxHelper = new THREE.Box3Helper(box, 0xe8a317);
      app.scene.add(bboxHelper);
    } else {
      bboxHelper.box.copy(box);
    }
  }

  function atualizarReferencia() {
    if (cuboRef) {
      app.scene.remove(cuboRef);
      cuboRef.geometry.dispose();
      cuboRef.material.dispose();
      cuboRef = null;
    }
    if (!estado.referencia || !app.getCurrentModel()) return;
    const escala = app.unidadeParaCena(0.01);
    const geo = new THREE.BoxGeometry(escala, escala, escala);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf9e2af,
      transparent: true,
      opacity: 0.85,
    });
    cuboRef = new THREE.Mesh(geo, mat);
    const box = new THREE.Box3().setFromObject(app.modelPivot);
    cuboRef.position.set(box.min.x, box.min.y + escala / 2, box.min.z);
    app.scene.add(cuboRef);
  }

  function aplicarPlanoCorte() {
    const ativo = estado.planoCorte;
    const plane = ativo
      ? new THREE.Plane(new THREE.Vector3(0, -1, 0), -estado.clipAltura)
      : null;
    app.renderer.localClippingEnabled = ativo;
    app.getCurrentModel()?.traverse((c) => {
      if (!c.isMesh || !c.material) return;
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      mats.forEach((m) => {
        m.clippingPlanes = plane ? [plane] : [];
        m.clipShadows = true;
        m.needsUpdate = true;
      });
    });
  }

  function restaurarOverhangs() {
    estado.meshOverhangBackup.forEach((backup, uuid) => {
      const mesh = app.getCurrentModel()?.getObjectByProperty("uuid", uuid);
      if (!mesh) return;
      if (mesh.geometry !== backup.geo) mesh.geometry.dispose();
      mesh.geometry = backup.geo;
      mesh.material = backup.mat;
    });
    estado.meshOverhangBackup.clear();
  }

  function aplicarOverhangs() {
    restaurarOverhangs();
    if (!estado.overhangs || !app.getCurrentModel()) return;

    const limite = Math.cos((estado.anguloOverhang * Math.PI) / 180);
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const matNormal = new THREE.Matrix3();

    app.getCurrentModel().traverse((mesh) => {
      if (!mesh.isMesh || !mesh.geometry) return;
      estado.meshOverhangBackup.set(mesh.uuid, {
        geo: mesh.geometry,
        mat: mesh.material,
      });

      const geo = mesh.geometry;
      const pos = geo.attributes.position;
      if (!pos) return;

      const cores = new Float32Array(pos.count * 3);
      const corBase = mesh.material?.color
        ? mesh.material.color.clone()
        : new THREE.Color(0x89b4fa);
      const corOver = new THREE.Color(0xf38ba8);
      matNormal.getNormalMatrix(mesh.matrixWorld);

      const processar = (i0, i1, i2) => {
        a.fromBufferAttribute(pos, i0);
        b.fromBufferAttribute(pos, i1);
        c.fromBufferAttribute(pos, i2);
        b.sub(a);
        c.sub(a);
        normal.crossVectors(b, c).normalize();
        normal.applyMatrix3(matNormal).normalize();
        const ehOverhang = normal.dot(up) < limite;
        const cor = ehOverhang ? corOver : corBase;
        for (const idx of [i0, i1, i2]) {
          cores[idx * 3] = cor.r;
          cores[idx * 3 + 1] = cor.g;
          cores[idx * 3 + 2] = cor.b;
        }
      };

      if (geo.index) {
        for (let i = 0; i < geo.index.count; i += 3) {
          processar(
            geo.index.getX(i),
            geo.index.getX(i + 1),
            geo.index.getX(i + 2)
          );
        }
      } else {
        for (let i = 0; i < pos.count; i += 3) {
          processar(i, i + 1, i + 2);
        }
      }

      const novaGeo = geo.clone();
      novaGeo.setAttribute("color", new THREE.BufferAttribute(cores, 3));
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.6,
        metalness: 0.1,
        wireframe: app.getWireframe(),
      });
      mesh.geometry = novaGeo;
      mesh.material = mat;
    });
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
    estado.filtroCor = estado.filtroCor === hex ? null : hex;

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
    chk("chk-wireframe", prefs.wireframe);
    chk("chk-giro-auto", prefs.giroAuto);
    chk("chk-sombra", prefs.sombra);
    chk("chk-bbox", prefs.bbox);
    chk("chk-referencia", prefs.referencia);
    chk("chk-ortografico", prefs.ortografico);
    chk("chk-overhangs", prefs.overhangs);
    chk("chk-regua", prefs.regua);
    chk("chk-plano-corte", prefs.planoCorte);
    chk("chk-suportes", prefs.suportes);
    chk("chk-mesa", prefs.mesa);
    chk("chk-mesa-overlay", prefs.mesa);
    const selMat = document.getElementById("sel-material");
    if (selMat && prefs.presetMaterial) selMat.value = prefs.presetMaterial;

    const sliderLuz = document.getElementById("slider-luz");
    if (sliderLuz) sliderLuz.value = prefs.luz;

    app.aplicarPreferenciaCores?.(prefs.cores);
    app.aplicarPreferenciaWireframe?.(prefs.wireframe);
    app.aplicarPreferenciaFundo?.(prefs.bgIndex);

    dispararChange("chk-giro-auto");
    dispararChange("chk-sombra");
    dispararChange("chk-bbox");
    dispararChange("chk-referencia");
    dispararChange("chk-ortografico");
    dispararChange("chk-overhangs");
    dispararChange("chk-regua");
    dispararChange("chk-plano-corte");
    dispararChange("chk-mesa");
    dispararChange("slider-luz");
  }

    function definirVista(tipo) {
    app.resetarRotacao();
    app.setPanOffset(0, 0, 0);
    const d = app.getCameraDistance();
    const c = app.getCentroVisao();
    const inclinacao = d * 0.18;

    const destinos = {
      frente: [0, inclinacao, d],
      tras: [0, inclinacao, -d],
      topo: [0, d, 0],
      fundo: [0, -d, 0],
      direita: [d, inclinacao, 0],
      lateral: [d, inclinacao, 0],
      esquerda: [-d, inclinacao, 0],
      iso: [d * 0.65, d * 0.65 + inclinacao, d * 0.65],
    };

    const dest = destinos[tipo] || destinos.iso;
    perspCamera.position.set(c.x + dest[0], c.y + dest[1], c.z + dest[2]);
    perspCamera.lookAt(c.x, c.y, c.z);
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

  function capturarTela() {
    app.renderer.render(app.scene, cameraAtiva());
    const link = document.createElement("a");
    link.download = `visualizador-${Date.now()}.png`;
    link.href = app.canvas.toDataURL("image/png");
    link.click();
    app.setStatus("Captura de tela salva");
  }

  async function salvarRecente(arquivo) {
    try {
      const entrada = {
        nome: arquivo.name,
        formato: arquivo.name.split(".").pop().toLowerCase(),
        tamanho: arquivo.size,
        data: Date.now(),
        emCache: false,
      };

      if (arquivo.size <= MAX_RECENTE_BYTES) {
        try {
          await salvarArquivoRecente(arquivo);
          entrada.emCache = true;
        } catch {
          entrada.emCache = false;
        }
      }

      const lista = JSON.parse(localStorage.getItem(CHAVE_RECENTES) || "[]");
      const filtrada = lista.filter((i) => i.nome !== entrada.nome);
      filtrada.unshift(entrada);
      const mantidos = filtrada.slice(0, MAX_RECENTES);
      localStorage.setItem(CHAVE_RECENTES, JSON.stringify(mantidos));
      await limparArquivosRecentesExceto(mantidos.map((i) => i.nome));
      renderizarRecentes();
    } catch {
      /* ignore */
    }
  }

  async function abrirRecente(nome) {
    const registro = await lerArquivoRecente(nome);
    if (!registro?.dados) {
      app.setStatus(
        `Abra "${nome}" novamente pelo botão Abrir modelo para guardar em cache`,
        true
      );
      return;
    }
    const file = new File([registro.dados], registro.nome, {
      type: registro.tipo,
      lastModified: registro.modificado || Date.now(),
    });
    app.loadFile(file);
  }

  function renderizarRecentes() {
    if (!listaRecentes) return;
    const lista = JSON.parse(localStorage.getItem(CHAVE_RECENTES) || "[]");
    if (!lista.length) {
      listaRecentes.innerHTML = '<p class="info-vazio">Nenhum recente</p>';
      return;
    }
    listaRecentes.innerHTML = lista
      .map(
        (i) =>
          `<button type="button" class="btn-recente" data-nome="${escapeHtml(i.nome)}" title="${escapeHtml(i.nome)}">${escapeHtml(i.nome)}</button>`
      )
      .join("");
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
      const dq = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        GIRO_AUTO_VEL
      );
      app.getRotacaoQuat().premultiply(dq);
      app.aplicarRotacao();
    }

    if (
      !estado.arrastando &&
      Math.abs(estado.inercia) > INERCIA_MIN &&
      app.getCurrentModel()
    ) {
      const dq = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        estado.inercia
      );
      app.getRotacaoQuat().premultiply(dq);
      app.aplicarRotacao();
      estado.inercia *= VELOCIDADE_INERCIA;
    }

    if (estado.mixer) estado.mixer.update(delta);
    if (estado.bbox) atualizarBbox();
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

    const box = new THREE.Box3().setFromObject(app.modelPivot);
    estado.clipAltura = box.max.y;
    const slider = document.getElementById("slider-plano-corte");
    if (slider) {
      slider.min = box.min.y;
      slider.max = box.max.y;
      slider.value = estado.clipAltura;
    }

    configurarSombras(estado.sombra);
    atualizarBbox();
    atualizarReferencia();
    aplicarPlanoCorte();
    if (estado.overhangs) aplicarOverhangs();

    return montarSecaoFilamentos();
  }

  function onModelCleared() {
    pararAnimacao();
    restaurarOverhangs();
    limparRegua();
    estado.filamentos = [];
    estado.filtroCor = null;
    estado.temSuportes = false;
    atualizarToggleSuportes();
    if (bboxHelper) {
      bboxHelper.geometry?.dispose();
      app.scene.remove(bboxHelper);
      bboxHelper = null;
    }
    if (cuboRef) {
      app.scene.remove(cuboRef);
      cuboRef.geometry?.dispose();
      cuboRef.material?.dispose();
      cuboRef = null;
    }
  }

  function bindUi() {
    const viewer = document.querySelector(".viewer");

    document.getElementById("btn-screenshot")?.addEventListener("click", capturarTela);
    document.getElementById("btn-fullscreen")?.addEventListener("click", () => {
      document.documentElement.requestFullscreen?.();
    });

    document.getElementById("chk-giro-auto")?.addEventListener("change", (e) => {
      estado.giroAuto = e.target.checked;
      salvarPreferencias({ giroAuto: e.target.checked });
    });
    document.getElementById("chk-sombra")?.addEventListener("change", (e) => {
      estado.sombra = e.target.checked;
      configurarSombras(estado.sombra);
      salvarPreferencias({ sombra: e.target.checked });
    });
    document.getElementById("chk-bbox")?.addEventListener("change", (e) => {
      estado.bbox = e.target.checked;
      atualizarBbox();
      salvarPreferencias({ bbox: e.target.checked });
    });
    document.getElementById("chk-referencia")?.addEventListener("change", (e) => {
      estado.referencia = e.target.checked;
      atualizarReferencia();
      salvarPreferencias({ referencia: e.target.checked });
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
    document.getElementById("chk-overhangs")?.addEventListener("change", (e) => {
      estado.overhangs = e.target.checked;
      if (estado.overhangs) aplicarOverhangs();
      else restaurarOverhangs();
      salvarPreferencias({ overhangs: e.target.checked });
    });
    document.getElementById("chk-regua")?.addEventListener("change", (e) => {
      estado.regua = e.target.checked;
      if (!estado.regua) limparRegua();
      salvarPreferencias({ regua: e.target.checked });
      app.setStatus(estado.regua ? "Régua: clique em dois pontos" : "Régua desativada");
    });
    document.getElementById("chk-plano-corte")?.addEventListener("change", (e) => {
      estado.planoCorte = e.target.checked;
      aplicarPlanoCorte();
      salvarPreferencias({ planoCorte: e.target.checked });
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
    document.getElementById("slider-plano-corte")?.addEventListener("input", (e) => {
      estado.clipAltura = parseFloat(e.target.value);
      aplicarPlanoCorte();
    });
    document.querySelectorAll("[data-vista]").forEach((btn) => {
      btn.addEventListener("click", () => definirVista(btn.dataset.vista));
    });

    document.getElementById("btn-vista-centrar")?.addEventListener("click", () => {
      if (app.getCurrentModel()) app.centerAndFrame(app.getCurrentModel());
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
      } else if (e.key === "w" || e.key === "W") {
        const chk = document.getElementById("chk-wireframe");
        if (chk) {
          chk.checked = !chk.checked;
          chk.dispatchEvent(new Event("change"));
        }
      } else if (e.key === "f" || e.key === "F") {
        document.documentElement.requestFullscreen?.();
      } else if (e.key === "s" || e.key === "S") {
        capturarTela();
      }
    });

    listaRecentes?.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-recente");
      if (!btn?.dataset.nome) return;
      abrirRecente(btn.dataset.nome).catch((err) => {
        app.setStatus(`Erro ao abrir recente: ${err.message}`, true);
      });
    });

    const params = new URLSearchParams(location.search);
    const modeloUrl = params.get("modelo");
    if (modeloUrl && !params.get("sessao") && !params.get("produto")) {
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

    renderizarRecentes();
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
    salvarRecente,
    aplicarFiltroCor,
    cameraAtiva,
    sincronizarCameras,
    setLights(h, d) {
      hemiLight = h;
      dirLight = d;
      if (dirLight) {
        dirLight.shadow.mapSize.set(1024, 1024);
      }
    },
    getEstado: () => estado,
    getSecaoFilamentos: () => montarSecaoFilamentos(),
    salvarPreferencias,
    lerPreferencias,
    aplicarPreferencias,
    atualizarToggleSuportes,
    aplicarSuportes,
  };
}
