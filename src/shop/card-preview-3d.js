import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { resolveProductAssetUrl } from '../utils/asset-url.js';
import { parseBambu3mfBuffer } from '../viewer/bambu3mfLoader.js';
import { loadGlbObject } from '../viewer/glb-loader.js';
import {
  resolveDisplayRotation,
} from '../viewer/stand-up-orientation.js';
import { buildCardPreviewFallbackHtml } from './gallery.js';
import { escapeHtml } from './sizes.js';

const CARD_SPIN_SPEED = 0.55;
const BG = '#141414';

const CARD_CAMERA = { yFactor: 0.35, distanceFactor: 2.1 };
const CARD_SCALE = 2.4;
const stlLoader = new STLLoader();

const stlGeometryCache = new Map();
const stlInflight = new Map();
const object3mfCache = new Map();
const object3mfInflight = new Map();

function productHasModel(product) {
  return Boolean(product?.modelGlbUrl || product?.model3mfUrl || product?.modelUrl);
}

/** GLB leve para web; 3MF multicolor; STL como fallback. */
function cardPreviewSource(product) {
  const glb =
    product.modelGlbUrl ||
    (product.modelUrl?.toLowerCase().endsWith('.glb') ? product.modelUrl : null);
  if (glb) return { type: 'glb', url: glb };

  const mf =
    product.model3mfUrl ||
    (product.modelUrl?.toLowerCase().endsWith('.3mf') ? product.modelUrl : null);
  if (mf) return { type: '3mf', url: mf };

  const stl = product.modelUrl?.toLowerCase().endsWith('.stl') ? product.modelUrl : null;
  if (stl) return { type: 'stl', url: stl };
  return null;
}

export function loadStlGeometry(url) {
  if (stlGeometryCache.has(url)) {
    return Promise.resolve(stlGeometryCache.get(url).clone());
  }
  if (stlInflight.has(url)) return stlInflight.get(url);

  const promise = fetch(resolveProductAssetUrl(url))
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then((buffer) => {
      const geometry = stlLoader.parse(buffer);
      geometry.computeVertexNormals();
      stlGeometryCache.set(url, geometry);
      return geometry.clone();
    })
    .finally(() => stlInflight.delete(url));

  stlInflight.set(url, promise);
  return promise;
}

export function load3mfObject(url, options = {}) {
  const cacheKey = `${url}\0${JSON.stringify(options)}`;
  if (object3mfCache.has(cacheKey)) {
    return Promise.resolve(object3mfCache.get(cacheKey).clone(true));
  }
  if (object3mfInflight.has(cacheKey)) return object3mfInflight.get(cacheKey);

  const promise = new Promise((resolve, reject) => {
    fetch(resolveProductAssetUrl(url))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buffer) => {
        const object = parseBambu3mfBuffer(buffer, options);
        object3mfCache.set(cacheKey, object);
        resolve(object.clone(true));
      })
      .catch(reject);
  }).finally(() => object3mfInflight.delete(cacheKey));

  object3mfInflight.set(cacheKey, promise);
  return promise;
}

export function prefetchCardModels(products) {
  for (const product of products) {
    const src = cardPreviewSource(product);
    if (src?.type === 'glb') loadGlbObject(src.url).catch(() => {});
    else if (src?.type === 'stl') loadStlGeometry(src.url).catch(() => {});
    else if (src?.type === '3mf') load3mfObject(src.url).catch(() => {});
  }
}

function getCard3mfRotation(product, object, source = 'print') {
  const explicit =
    product.card3mfRotation ?? product.model3mfRotation ?? product.modelRotation;
  return resolveDisplayRotation(object, explicit, { source });
}

function getCard3mfFacing(product) {
  return product.card3mfFacing ?? product.model3mfFacing ?? product.modelFacing ?? 0;
}

function fitContent(object, product, source = 'print') {
  const rot = getCard3mfRotation(product, object, source);
  object.rotation.set(rot.x ?? 0, rot.y ?? 0, rot.z ?? 0);
  object.updateMatrixWorld(true);

  const content = new THREE.Group();
  content.add(object);

  const box = new THREE.Box3().setFromObject(content);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  content.scale.setScalar(CARD_SCALE / maxDim);

  content.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(content);
  const center = fitted.getCenter(new THREE.Vector3());
  content.position.x -= center.x;
  content.position.z -= center.z;
  content.position.y -= fitted.min.y;

  const orient = new THREE.Group();
  orient.rotation.y = getCard3mfFacing(product);
  orient.add(content);

  const pivot = new THREE.Group();
  pivot.add(orient);
  return pivot;
}

function polishStlMesh(mesh, colorHex) {
  mesh.material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex || '#e8a317'),
    roughness: 0.48,
    metalness: 0.06,
    flatShading: true,
  });
}

function polishBambuMesh(mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach((mat) => {
    if (!mat?.color) return;
    mat.flatShading = true;
    mat.needsUpdate = true;
  });
}

function buildMeshFromStlGeometry(geometry, product) {
  geometry.center();
  const mesh = new THREE.Mesh(geometry);
  polishStlMesh(mesh, product.modelColor);

  const wrap = new THREE.Group();
  wrap.add(mesh);
  const rot = getCard3mfRotation(product, wrap, 'print');
  wrap.rotation.set(rot.x ?? 0, rot.y ?? 0, rot.z ?? 0);
  wrap.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  wrap.scale.setScalar(CARD_SCALE / maxDim);
  wrap.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(wrap);
  const center = fitted.getCenter(new THREE.Vector3());
  wrap.position.x -= center.x;
  wrap.position.z -= center.z;
  wrap.position.y -= fitted.min.y;

  const meshWrap = new THREE.Group();
  meshWrap.add(wrap);

  const orient = new THREE.Group();
  orient.rotation.y = getCard3mfFacing(product);
  orient.add(meshWrap);

  const pivot = new THREE.Group();
  pivot.add(orient);
  return pivot;
}

class CardPreview3D {
  constructor(host, product) {
    this.host = host;
    this.product = product;
    this.visible = false;
    this.spinEnabled = false;
    this.spinLoopActive = false;
    this.disposed = false;
    this.modelPivot = null;
    this.spinRoot = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.spinClock = new THREE.Clock();

    this.load();
  }

  ensureRenderer() {
    if (this.renderer || this.disposed) return;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 1.2, 4.2);

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'low-power',
    });
    this.renderer.setClearColor(0x141414, 1);
    this.renderer.setPixelRatio(1);
    this.renderer.domElement.className = 'store-card-3d-canvas';
    this.host.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight('#ffffff', 0.55));
    const key = new THREE.DirectionalLight('#ffffff', 1.2);
    key.position.set(4, 8, 6);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#f5d547', 0.5);
    fill.position.set(-4, 2, -4);
    this.scene.add(fill);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
  }

  resize() {
    if (this.disposed || !this.renderer) return;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w < 1 || h < 1) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.spinEnabled && this.canAnimate()) {
      if (!this.spinLoopActive) this.syncSpinAnimation({ force: true });
    } else if (!this.spinEnabled) {
      this.renderFrame();
    }
  }

  renderFrame() {
    if (this.disposed || !this.renderer || !this.modelPivot) return;
    this.renderer.render(this.scene, this.camera);
  }

  setSpinEnabled(enabled) {
    if (this.disposed) return;
    this.spinEnabled = Boolean(enabled);
    this.host.classList.toggle('is-spinning', this.spinEnabled);

    const preview = this.host.closest('.store-card-preview');
    preview?.classList.toggle('is-spinning', this.spinEnabled);

    const btn = preview?.querySelector('[data-card-3d-spin]');
    if (btn) {
      btn.setAttribute('aria-pressed', String(this.spinEnabled));
      btn.classList.toggle('is-active', this.spinEnabled);
      btn.title = this.spinEnabled ? 'Voltar à foto' : 'Ver em 3D com rotação';
    }

    if (this.spinEnabled) {
      if (this.spinRoot) this.spinRoot.rotation.y = 0;
      if (this.visible) this.syncSpinAnimation();
    } else {
      this.stopSpinAnimation();
      this.renderFrame();
    }
  }

  setVisible(visible) {
    this.visible = visible;
    if (!visible) {
      this.stopSpinAnimation();
      return;
    }
    this.renderFrame();
    if (this.spinEnabled) this.syncSpinAnimation();
  }

  canAnimate() {
    return Boolean(this.visible && this.spinEnabled && this.modelPivot && this.renderer);
  }

  syncSpinAnimation({ force = false } = {}) {
    if (this.disposed || !this.renderer) return;

    if (!this.canAnimate()) {
      this.stopSpinAnimation();
      return;
    }

    if (this.spinLoopActive && !force) return;

    this.stopSpinAnimation();
    this.spinLoopActive = true;
    this.spinClock.start();

    this.renderer.setAnimationLoop(() => {
      if (this.disposed || !this.canAnimate()) {
        this.stopSpinAnimation();
        this.renderFrame();
        return;
      }

      const dt = Math.min(this.spinClock.getDelta(), 0.05);
      this.modelPivot.rotation.y += CARD_SPIN_SPEED * dt;
      this.renderer.render(this.scene, this.camera);
    });
  }

  stopSpinAnimation() {
    this.spinLoopActive = false;
    this.renderer?.setAnimationLoop(null);
  }

  showModel(pivot) {
    if (this.disposed) return;
    this.ensureRenderer();

    if (this.spinRoot) {
      this.scene.remove(this.spinRoot);
      this.spinRoot = null;
    }

    this.spinRoot = new THREE.Group();
    this.spinRoot.add(pivot);
    this.modelPivot = this.spinRoot;
    this.scene.add(this.spinRoot);

    const box = new THREE.Box3().setFromObject(this.spinRoot);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const center = box.getCenter(new THREE.Vector3());
    this.camera.position.set(
      center.x,
      center.y + maxDim * CARD_CAMERA.yFactor,
      center.z + maxDim * CARD_CAMERA.distanceFactor
    );
    this.camera.lookAt(center);

    this.host.classList.add('is-loaded');
    this.renderFrame();
    if (this.spinEnabled && this.visible) {
      this.syncSpinAnimation({ force: true });
    }
  }

  load() {
    if (this.disposed || this.loading) return;
    this.loading = true;

    const product = this.product;
    const src = cardPreviewSource(product);
    if (!src) {
      this.fallbackToImages();
      return;
    }

    const task =
      src.type === 'glb'
        ? loadGlbObject(src.url).then((object) => fitContent(object, product, 'gltf'))
        : src.type === 'stl'
        ? loadStlGeometry(src.url).then((geometry) => buildMeshFromStlGeometry(geometry, product))
        : load3mfObject(src.url).then((object) => {
            object.traverse((child) => {
              if (!child.isMesh) return;
              child.geometry?.computeVertexNormals();
              polishBambuMesh(child);
            });
            return fitContent(object, product, 'print');
          });

    task
      .then((pivot) => {
        this.loading = false;
        this.showModel(pivot);
      })
      .catch(() => {
        this.loading = false;
        if (src.type === '3mf' && product.modelUrl?.toLowerCase().endsWith('.stl')) {
          loadStlGeometry(product.modelUrl)
            .then((geometry) => this.showModel(buildMeshFromStlGeometry(geometry, product)))
            .catch(() => this.fallbackToImages());
          return;
        }
        this.fallbackToImages();
      });
  }

  fallbackToImages() {
    if (this.disposed) return;
    const preview = this.host.closest('.store-card-preview');
    if (!preview) return;
    const html = buildCardPreviewFallbackHtml(this.product);
    if (!html) return;
    preview.innerHTML = html;
    preview.dispatchEvent(new CustomEvent('card-preview-fallback', { bubbles: true }));
  }

  dispose() {
    this.disposed = true;
    this.stopSpinAnimation();
    this.resizeObserver?.disconnect();

    if (this.spinRoot && this.scene) {
      this.spinRoot.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose();
        const mats = child.material;
        if (Array.isArray(mats)) mats.forEach((m) => m?.dispose());
        else mats?.dispose();
      });
      this.scene.remove(this.spinRoot);
    }

    this.spinRoot = null;
    this.modelPivot = null;

    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}

const instances = new WeakMap();

export function productSupportsCard3d(product) {
  return productHasModel(product);
}

export function buildCard3dPreviewHtml(product) {
  const src = product.previewImage || product.previewImages?.[0];
  const imgHtml = src
    ? `<img src="${src}" alt="${escapeHtml(product.name)}" class="store-card-photo store-card-photo--static" loading="lazy" draggable="false" />`
    : '';

  return `${imgHtml}<div class="store-card-3d-host" data-card-3d></div>
    <button type="button" class="store-card-3d-spin-btn" data-card-3d-spin aria-pressed="false" title="Ver em 3D com rotação">
      <i class="fa-solid fa-rotate" aria-hidden="true"></i>
    </button>`;
}

function ensureCardPreview(host, product) {
  let instance = instances.get(host);
  if (!instance) {
    instance = new CardPreview3D(host, product);
    instances.set(host, instance);
  }
  instance.setVisible(true);
  return instance;
}

function deactivateCard3d(preview, host) {
  const instance = instances.get(host);
  if (instance) {
    instance.dispose();
    instances.delete(host);
  }

  host.classList.remove('is-loaded', 'is-spinning');
  host.replaceChildren();

  preview.classList.remove('is-3d-active', 'is-spinning');

  const btn = preview.querySelector('[data-card-3d-spin]');
  if (btn) {
    btn.setAttribute('aria-pressed', 'false');
    btn.classList.remove('is-active');
    btn.title = 'Ver em 3D com rotação';
  }
}

function bindCardSpinToggles(container, byId) {
  const onSpinClick = (e) => {
    const btn = e.target.closest('[data-card-3d-spin]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const preview = btn.closest('.store-card-preview');
    const host = preview?.querySelector('[data-card-3d]');
    if (!preview || !host) return;

    const card = preview.closest('[data-product-id]');
    const product = byId.get(Number(card?.dataset.productId));
    if (!product) return;

    if (preview.classList.contains('is-3d-active')) {
      deactivateCard3d(preview, host);
      return;
    }

    preview.classList.add('is-3d-active');
    const instance = ensureCardPreview(host, product);
    instance.setSpinEnabled(true);
    instance.syncSpinAnimation({ force: true });
  };

  container.addEventListener('click', onSpinClick, true);
  return () => container.removeEventListener('click', onSpinClick, true);
}

export function bindCardPreview3d(container, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  if (!container.querySelector('[data-card-3d]')) return;

  prefetchCardModels(products.filter(productHasModel));
  return bindCardSpinToggles(container, byId);
}
