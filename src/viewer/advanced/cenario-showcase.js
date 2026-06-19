/**
 * Estúdio GD3D — foto do estúdio como fundo + sombra sob o modelo.
 * Imagem: public/viewer/cenarios/estudio-gd3d.png
 */
import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

const ASSETS = {
  fundo: "/viewer/cenarios/estudio-gd3d.png",
  hdri: "/viewer/cenarios/hdri/studio_small_09_1k.hdr",
};

const FALLBACK_HDR =
  "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr";

/** @type {THREE.Texture | null} */
let cacheFundo = null;
/** @type {THREE.Texture | null} */
let cacheHdr = null;
/** @type {Promise<void> | null} */
let cacheCarregamento = null;

async function carregarFundo() {
  const tex = await new THREE.TextureLoader().loadAsync(ASSETS.fundo);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

async function carregarHdr() {
  const rgbe = new RGBELoader();
  try {
    const tex = await rgbe.loadAsync(ASSETS.hdri);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    return tex;
  } catch {
    const tex = await rgbe.loadAsync(FALLBACK_HDR);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    return tex;
  }
}

/** Apenas sombra — a mesa já está na foto de fundo. */
function criarSombraMesa() {
  const g = new THREE.Group();
  g.name = "sombra-mesa";

  const sombra = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShadowMaterial({ opacity: 0.22, color: 0x000000 })
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.receiveShadow = true;
  g.add(sombra);

  return g;
}

export function criarCenarioShowcase(app) {
  const root = new THREE.Group();
  root.name = "cenario-showcase";
  root.visible = false;
  app.scene.add(root);

  let sombraInst = null;
  let pmrem = null;
  let envMap = null;
  let ativo = false;
  let carregando = false;

  let cenaBackup = null;
  let luzBackup = null;
  let bgIndexBackup = null;

  const sombraTpl = criarSombraMesa();

  function garantirPmrem() {
    if (!pmrem) pmrem = new THREE.PMREMGenerator(app.renderer);
    return pmrem;
  }

  async function carregarAssets() {
    if (cacheFundo && cacheHdr) return;

    if (!cacheCarregamento) {
      cacheCarregamento = (async () => {
        [cacheFundo, cacheHdr] = await Promise.all([carregarFundo(), carregarHdr()]);
      })().finally(() => {
        cacheCarregamento = null;
      });
    }

    await cacheCarregamento;
  }

  function removerSombra() {
    if (sombraInst) {
      root.remove(sombraInst);
      sombraInst = null;
    }
  }

  function posicionarSombra(box, size) {
    removerSombra();
    sombraInst = sombraTpl.clone(true);

    const cx = (box.min.x + box.max.x) * 0.5;
    const cz = (box.min.z + box.max.z) * 0.5;
    const baseY = box.min.y;
    const largura = Math.max(size.x, size.z) * 1.1;

    sombraInst.scale.set(largura, largura * 0.85, 1);
    sombraInst.position.set(cx, baseY - 0.001, cz);
    root.add(sombraInst);
  }

  function configurarSombrasModelo(ligar) {
    app.modelPivot?.traverse((c) => {
      if (c.isMesh) c.castShadow = ligar;
    });
  }

  function backupCena() {
    if (cenaBackup) return;
    const scene = app.scene;
    cenaBackup = {
      environment: scene.environment,
      background: scene.background,
      backgroundBlurriness: scene.backgroundBlurriness,
      backgroundIntensity: scene.backgroundIntensity,
      environmentIntensity: scene.environmentIntensity,
      toneMapping: app.renderer.toneMapping,
      toneMappingExposure: app.renderer.toneMappingExposure,
    };
  }

  function aplicarCena() {
    backupCena();
    if (!cacheFundo || !cacheHdr) return;

    const gen = garantirPmrem();
    if (envMap) envMap.dispose();
    envMap = gen.fromEquirectangular(cacheHdr).texture;

    const scene = app.scene;
    scene.background = cacheFundo;
    scene.environment = envMap;
    scene.backgroundBlurriness = 0;
    scene.backgroundIntensity = 1;
    scene.environmentIntensity = 0.68;

    app.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    app.renderer.toneMappingExposure = 0.98;
  }

  function restaurarCena() {
    if (!cenaBackup) return;
    const scene = app.scene;
    scene.environment = cenaBackup.environment;
    scene.background = cenaBackup.background;
    scene.backgroundBlurriness = cenaBackup.backgroundBlurriness;
    scene.backgroundIntensity = cenaBackup.backgroundIntensity;
    scene.environmentIntensity = cenaBackup.environmentIntensity;
    app.renderer.toneMapping = cenaBackup.toneMapping;
    app.renderer.toneMappingExposure = cenaBackup.toneMappingExposure;
    cenaBackup = null;
    if (envMap) {
      envMap.dispose();
      envMap = null;
    }
  }

  function configurarLuz(estudio) {
    const hemi = app.getHemiLight?.();
    const dir = app.getDirLight?.();
    const renderer = app.renderer;
    if (!hemi || !dir || !renderer) return;

    if (estudio) {
      if (!luzBackup) {
        luzBackup = {
          hemiInt: hemi.intensity,
          hemiColor: hemi.color.getHex(),
          hemiGround: hemi.groundColor.getHex(),
          dirInt: dir.intensity,
          dirColor: dir.color.getHex(),
          dirPos: dir.position.clone(),
        };
      }
      hemi.intensity = 0.38;
      hemi.color.set(0xfff5e8);
      hemi.groundColor.set(0x222222);
      dir.intensity = 1.05;
      dir.color.set(0xffe4c4);
      dir.position.set(0.5, 5, 4);
      dir.castShadow = true;
      dir.shadow.mapSize.set(2048, 2048);
      dir.shadow.camera.near = 0.05;
      dir.shadow.camera.far = 800;
      dir.shadow.bias = -0.00006;
      dir.shadow.normalBias = 0.01;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } else if (luzBackup) {
      hemi.intensity = luzBackup.hemiInt;
      hemi.color.setHex(luzBackup.hemiColor);
      hemi.groundColor.setHex(luzBackup.hemiGround);
      dir.intensity = luzBackup.dirInt;
      dir.color.setHex(luzBackup.dirColor);
      dir.position.copy(luzBackup.dirPos);
      dir.castShadow = false;
      luzBackup = null;
      renderer.shadowMap.enabled = false;
    }
  }

  function ajustarSombraDirecional() {
    const dir = app.getDirLight?.();
    if (!dir || !app.getCurrentModel()) return;
    const box = new THREE.Box3().setFromObject(app.modelPivot);
    const center = box.getCenter(new THREE.Vector3());
    const span = box.getSize(new THREE.Vector3()).length();
    dir.target.position.copy(center);
    const s = span * 0.48;
    dir.shadow.camera.left = -s;
    dir.shadow.camera.right = s;
    dir.shadow.camera.top = s;
    dir.shadow.camera.bottom = -s;
    dir.shadow.camera.updateProjectionMatrix();
  }

  function restaurarFundo() {
    if (bgIndexBackup != null) {
      app.aplicarPreferenciaFundo?.(bgIndexBackup);
      bgIndexBackup = null;
    }
  }

  function montarCena() {
    if (!ativo || !app.getCurrentModel()) {
      root.visible = false;
      return;
    }

    const box = new THREE.Box3().setFromObject(app.modelPivot);
    const size = box.getSize(new THREE.Vector3());
    if (size.lengthSq() === 0) return;

    posicionarSombra(box, size);
    root.visible = true;
    configurarSombrasModelo(true);
    ajustarSombraDirecional();
  }

  function atualizar() {
    if (!ativo) montarCena();
  }

  async function setAtivo(valor) {
    if (carregando) return;
    ativo = valor;

    if (!valor) {
      root.visible = false;
      removerSombra();
      configurarSombrasModelo(false);
      configurarLuz(false);
      restaurarCena();
      restaurarFundo();
      return;
    }

    if (!app.getCurrentModel()) {
      ativo = false;
      app.setStatus?.("Carregue um modelo para usar o estúdio", true);
      return;
    }

    carregando = true;
    app.setStatus?.("Carregando estúdio GD3D…");
    try {
      bgIndexBackup = app.getBgIndex?.() ?? null;
      await carregarAssets();
      aplicarCena();
      configurarLuz(true);
      montarCena();
      app.setStatus?.("Estúdio GD3D");
    } catch (err) {
      ativo = false;
      root.visible = false;
      removerSombra();
      restaurarCena();
      restaurarFundo();
      configurarLuz(false);
      app.setStatus?.(`Estúdio: ${err.message}`, true);
    } finally {
      carregando = false;
    }
  }

  function dispose() {
    setAtivo(false);
    if (pmrem) {
      pmrem.dispose();
      pmrem = null;
    }
    app.scene.remove(root);
  }

  return {
    setAtivo,
    atualizar,
    getAtivo: () => ativo,
    isCarregando: () => carregando,
    dispose,
  };
}
