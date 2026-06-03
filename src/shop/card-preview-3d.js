import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { resolveProductAssetUrl } from '../utils/asset-url.js';
import { loadBambuPaint3mf } from '../viewer/bambu3mfLoader.js';
import { buildCardPreviewFallbackHtml } from './gallery.js';

const CARD_SPIN_SPEED = 0.55;
const BG = '#141414';

/** Pose padrão dos cards (vista traseira 3/4, igual em todos). */
const CARD_3MF_ROTATION = { x: 0, y: 0, z: 0 };
const CARD_3MF_FACING = Math.PI;
const CARD_CAMERA = { yFactor: 0.35, distanceFactor: 2.1 };
const CARD_SCALE = 2.4;
const stlLoader = new STLLoader();

const stlGeometryCache = new Map();
const stlInflight = new Map();
const object3mfCache = new Map();
const object3mfInflight = new Map();

function productHasModel(product) {
  return Boolean(product?.model3mfUrl || product?.modelUrl);
}

/** Cards preferem 3MF multicolor; STL só como fallback. */
function cardPreviewSource(product) {
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

export function load3mfObject(url) {
  if (object3mfCache.has(url)) {
    return Promise.resolve(object3mfCache.get(url).clone(true));
  }
  if (object3mfInflight.has(url)) return object3mfInflight.get(url);

  const promise = new Promise((resolve, reject) => {
    loadBambuPaint3mf(
      url,
      (object) => {
        object3mfCache.set(url, object);
        resolve(object.clone(true));
      },
      undefined,
      reject
    );
  }).finally(() => object3mfInflight.delete(url));

  object3mfInflight.set(url, promise);
  return promise;
}

export function prefetchCardModels(products) {
  for (const product of products) {
    const src = cardPreviewSource(product);
    if (src?.type === 'stl') loadStlGeometry(src.url).catch(() => {});
    else if (src?.type === '3mf') load3mfObject(src.url).catch(() => {});
  }
}

function getCard3mfRotation(product) {
  return product.card3mfRotation ?? CARD_3MF_ROTATION;
}

function getCard3mfFacing(product) {
  if (product.card3mfFacing != null) return product.card3mfFacing;
  return CARD_3MF_FACING;
}

/** Normaliza eixo horizontal (cada 3MF vem com X/Z trocados). */
function autoAlignCardYaw(content) {
  content.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(content).getSize(new THREE.Vector3());
  if (size.z >= size.x) {
    content.rotation.y += Math.PI / 2;
  }
}

function fitContent(object, product) {
  const rot = getCard3mfRotation(product);
  object.rotation.set(rot.x ?? 0, rot.y ?? 0, rot.z ?? 0);

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

  autoAlignCardYaw(content);

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

  const rotX = product.modelRotation?.x ?? -Math.PI / 2;
  mesh.rotation.set(rotX, product.modelRotation?.y ?? 0, product.modelRotation?.z ?? 0);

  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  mesh.scale.setScalar(CARD_SCALE / maxDim);
  mesh.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(mesh);
  const center = fitted.getCenter(new THREE.Vector3());
  mesh.position.x -= center.x;
  mesh.position.z -= center.z;
  mesh.position.y -= fitted.min.y;

  const meshWrap = new THREE.Group();
  meshWrap.add(mesh);
  autoAlignCardYaw(meshWrap);

  const orient = new THREE.Group();
  orient.rotation.y = getCard3mfFacing(product);
  orient.add(meshWrap);

  const pivot = new THREE.Group();
  pivot.add(orient);
  return pivot;
}

class CardPreview3D {
  constructor(host, product, { keepAnimating = false } = {}) {
    this.host = host;
    this.product = product;
    this.keepAnimating = keepAnimating;
    this.visible = keepAnimating;
    this.running = false;
    this.disposed = false;
    this.modelPivot = null;
    this.raf = 0;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  }

  setVisible(visible) {
    if (this.keepAnimating) {
      this.visible = true;
      this.startLoop();
      return;
    }
    this.visible = visible;
    if (visible) this.startLoop();
    else this.stopLoop();
  }

  shouldAnimate() {
    return Boolean(this.modelPivot && this.renderer && (this.keepAnimating || this.visible));
  }

  startLoop() {
    if (this.running || this.disposed) return;
    this.running = true;
    const tick = () => {
      if (!this.running || this.disposed) return;
      this.raf = requestAnimationFrame(tick);
      if (!this.shouldAnimate()) return;
      if (!this.reduceMotion) {
        this.modelPivot.rotation.y += CARD_SPIN_SPEED * 0.016;
      }
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  stopLoop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  showModel(pivot) {
    if (this.disposed) return;
    this.ensureRenderer();
    this.modelPivot = pivot;
    this.scene.add(pivot);

    const box = new THREE.Box3().setFromObject(pivot);
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
    this.renderer.render(this.scene, this.camera);
    this.startLoop();
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
      src.type === 'stl'
        ? loadStlGeometry(src.url).then((geometry) => buildMeshFromStlGeometry(geometry, product))
        : load3mfObject(src.url).then((object) => {
            object.traverse((child) => {
              if (!child.isMesh) return;
              child.geometry?.computeVertexNormals();
              polishBambuMesh(child);
            });
            return fitContent(object, product);
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
    this.stopLoop();
    this.resizeObserver?.disconnect();

    if (this.modelPivot && this.scene) {
      this.modelPivot.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose();
        const mats = child.material;
        if (Array.isArray(mats)) mats.forEach((m) => m?.dispose());
        else mats?.dispose();
      });
      this.scene.remove(this.modelPivot);
    }

    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}

const instances = new WeakMap();

export function productSupportsCard3d(product) {
  return productHasModel(product);
}

export function buildCard3dHostHtml() {
  return '<div class="store-card-3d-host" data-card-3d></div>';
}

function isPreviewVisible(previewEl) {
  const rect = previewEl.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > -120 &&
    rect.top < window.innerHeight + 120
  );
}

function ensureCardPreview(host, product, keepAnimating = false) {
  let instance = instances.get(host);
  if (!instance) {
    instance = new CardPreview3D(host, product, { keepAnimating });
    instances.set(host, instance);
  }
  instance.setVisible(true);
  return instance;
}

export function bindCardPreview3d(container, products, { eager = false } = {}) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const hosts = container.querySelectorAll('[data-card-3d]');
  if (!hosts.length) return;

  prefetchCardModels(products);

  if (eager) {
    hosts.forEach((host) => {
      const card = host.closest('[data-product-id]');
      const product = byId.get(Number(card?.dataset.productId));
      if (product) ensureCardPreview(host, product, true);
    });
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const host = entry.target.matches('[data-card-3d]')
          ? entry.target
          : entry.target.querySelector('[data-card-3d]');
        if (!host) continue;

        const card = host.closest('[data-product-id]');
        const product = byId.get(Number(card?.dataset.productId));
        if (!product || !productHasModel(product)) continue;

        if (entry.isIntersecting) {
          ensureCardPreview(host, product, false);
        } else {
          instances.get(host)?.setVisible(false);
        }
      }
    },
    { rootMargin: '160px', threshold: 0.01 }
  );

  hosts.forEach((host) => {
    const preview = host.closest('.store-card-preview');
    if (!preview) return;
    observer.observe(preview);

    const card = host.closest('[data-product-id]');
    const product = byId.get(Number(card?.dataset.productId));
    if (product && isPreviewVisible(preview)) {
      ensureCardPreview(host, product, false);
    }
  });

  return () => observer.disconnect();
}
