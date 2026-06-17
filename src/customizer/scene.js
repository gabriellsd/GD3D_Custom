import * as THREE from 'three';
import { load3mfObject, loadStlGeometry } from '../shop/card-preview-3d.js';
import { resolveDisplayRotation } from '../viewer/stand-up-orientation.js';
import { loadGlbObject } from '../viewer/glb-loader.js';
import { WHATSAPP_PHONE } from '../config.js';
import { formatBRL } from '../utils/format.js';

let scene, camera, renderer, modelPivot, activeMesh;
let selectedProduct = null;
const productColorListeners = new Set();
let turntableEl = null;
let loadingEl = null;
let modelErrorEl = null;
let turntableIndex = 0;
let turntableUrls = [];
let loadGeneration = 0;
let cameraDistance = 6;
let cameraDistanceMin = 2;
let cameraDistanceMax = 24;
let turntableScale = 1;
let productSpinVelocity = 0;
let isProductDragging = false;

const viewCenter = new THREE.Vector3();
const productSpinQuat = new THREE.Quaternion();
const deltaProductQuat = new THREE.Quaternion();
const rotateAxis = new THREE.Vector3();
const PRODUCT_SPIN_INERTIA = 0.94;
const PRODUCT_SPIN_MIN = 0.00015;
const ZOOM_FACTOR = 1.08;

const MATERIAL = {
  color: '#e8a317',
  roughness: 0.35,
  metalness: 0.15,
  transmission: 0,
};

const SHAPES = {
  knot: () => new THREE.TorusKnotGeometry(0.7, 0.25, 120, 16, 2, 3),
  box: () => new THREE.BoxGeometry(1.2, 1.2, 1.2, 4, 4, 4),
  sphere: () => new THREE.SphereGeometry(0.85, 48, 48),
};

function getCanvas() {
  return document.getElementById('customizer-canvas');
}

function clearModel() {
  if (!modelPivot) return;
  modelPivot.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    const mats = child.material;
    if (Array.isArray(mats)) mats.forEach((m) => m?.dispose());
    else mats?.dispose();
  });
  scene.remove(modelPivot);
  modelPivot = null;
  activeMesh = null;
}

export function initCustomizer() {
  const container = getCanvas();
  if (!container) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#141414');
  scene.fog = new THREE.FogExp2('#141414', 0.12);

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 3, 6);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setClearColor(0x141414, 1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight('#ffffff', 0.5));
  const dir1 = new THREE.DirectionalLight('#ffffff', 1.5);
  dir1.position.set(5, 10, 7);
  scene.add(dir1);
  const dir2 = new THREE.DirectionalLight('#f5d547', 0.8);
  dir2.position.set(-5, 2, -5);
  scene.add(dir2);
  const point = new THREE.PointLight('#e8a317', 1, 10);
  point.position.set(0, 3, 0);
  scene.add(point);

  bindThreeDrag();
  bindZoom(container);
  window.addEventListener('resize', onWindowResize);
  const resizeObserver = new ResizeObserver(() => onWindowResize());
  resizeObserver.observe(container);
  onWindowResize();
  animate();

  document.querySelector('[data-reset-camera]')?.addEventListener('click', resetView);
  document.querySelector('[data-request-order]')?.addEventListener('click', requestCustomOrder);
}

export function onProductColorsLoaded(listener) {
  productColorListeners.add(listener);
  return () => productColorListeners.delete(listener);
}

function resolveProductColors(colors) {
  if (colors?.length) return colors;
  return selectedProduct?.colors?.length ? selectedProduct.colors : [];
}

function publishProductColors(colors) {
  const resolved = resolveProductColors(colors);
  if (!resolved.length) {
    updateViewerColorSwatches([]);
    return;
  }
  if (selectedProduct) selectedProduct = { ...selectedProduct, colors: resolved };
  productColorListeners.forEach((fn) => fn(resolved));
  updateViewerColorSwatches(resolved);
}

function collectColorsFrom3mfObject(object) {
  const seen = new Set();
  const colors = [];

  object.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat?.color) continue;
      const hex = `#${mat.color.getHexString()}`.toUpperCase();
      if (seen.has(hex)) continue;
      seen.add(hex);
      colors.push(hex);
    }
  });

  return colors;
}

function isBambuMulticolorGroup(object) {
  let found = false;
  object.traverse((child) => {
    if (child.name?.startsWith('filament-')) found = true;
  });
  return found;
}

function updateViewerColorSwatches(colors) {
  const wrap = document.getElementById('viewer-colors-wrap');
  const row = document.getElementById('viewer-colors');
  if (!wrap || !row) return;

  if (!colors?.length) {
    wrap.classList.add('hidden');
    row.innerHTML = '';
    return;
  }

  wrap.classList.remove('hidden');
  row.innerHTML = colors
    .map(
      (hex) =>
        `<span class="viewer-color-swatch" style="background-color:${hex}" title="${hex}"></span>`
    )
    .join('');
}

export function selectProduct(product) {
  selectedProduct = product;
  const generation = ++loadGeneration;
  hideModelError();
  updateViewerLabel(product);
  updateViewerColorSwatches(product.colors);

  if (product.modelGlbUrl || product.model3mfUrl || product.modelUrl) {
    hideTurntable();
    loadModel3d(product, generation);
    return;
  }

  if (product.previewImages?.length) {
    showTurntable(product.previewImages);
    return;
  }

  hideTurntable();
  loadGeometricModel(product.shape3d || 'box');
}

function updateViewerLabel(product) {
  const hint = document.getElementById('viewer-drag-hint');
  if (hint) {
    if (product.model3mfUrl || product.modelUrl) hint.textContent = 'A carregar modelo 3D…';
    else if (product.previewImages?.length) {
      hint.textContent = 'Arraste ↔ para ver outros ângulos · roda do rato para zoom';
    } else hint.textContent = 'Roda do rato para zoom';
  }
}

function setViewerHint3d() {
  const hint = document.getElementById('viewer-drag-hint');
  if (hint) hint.textContent = 'Arraste em qualquer direção para rodar o produto · roda para zoom';
}

function isTurntableVisible() {
  return turntableEl?.style.display === 'flex';
}

function getModelCenter() {
  if (!modelPivot) return viewCenter.set(0, 0.5, 0);
  new THREE.Box3().setFromObject(modelPivot).getCenter(viewCenter);
  return viewCenter;
}

function hasProductModel3d() {
  return Boolean(
    selectedProduct?.modelGlbUrl || selectedProduct?.model3mfUrl || selectedProduct?.modelUrl
  );
}

function getProductRotateSpeed() {
  const width = getCanvas()?.clientWidth || 800;
  return (Math.PI * 2) / width;
}

function resetProductView() {
  productSpinQuat.identity();
  productSpinVelocity = 0;
  applyProductRotation();
}

function applyProductRotation() {
  if (!modelPivot) return;
  modelPivot.quaternion.copy(productSpinQuat);
}

function createModelPivot(content, facingY = 0) {
  const orientGroup = new THREE.Group();
  orientGroup.rotation.y = facingY;
  orientGroup.add(content);

  modelPivot = new THREE.Group();
  modelPivot.add(orientGroup);
  modelPivot.position.y = 0.05;
  resetProductView();
  scene.add(modelPivot);
}

function applyCameraPosition() {
  if (!camera) return;
  const center = getModelCenter();
  camera.position.set(center.x, center.y + cameraDistance * 0.18, center.z + cameraDistance);
  camera.lookAt(center);
}

function applyTurntableScale() {
  const img = turntableEl?.querySelector('.viewer-turntable-img');
  if (img) img.style.transform = `scale(${turntableScale})`;
}

function zoomView(deltaY) {
  const zoomIn = deltaY < 0;

  if (isTurntableVisible()) {
    turntableScale = THREE.MathUtils.clamp(
      turntableScale * (zoomIn ? ZOOM_FACTOR : 1 / ZOOM_FACTOR),
      0.65,
      2.5
    );
    applyTurntableScale();
    return;
  }

  if (!modelPivot) return;

  cameraDistance = THREE.MathUtils.clamp(
    cameraDistance * (zoomIn ? 1 / ZOOM_FACTOR : ZOOM_FACTOR),
    cameraDistanceMin,
    cameraDistanceMax
  );
  applyCameraPosition();
}

function bindZoom(container) {
  container.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomView(e.deltaY);
    },
    { passive: false }
  );

  let pinchStart = 0;
  container.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 2) pinchStart = getTouchDistance(e.touches);
    },
    { passive: true }
  );
  container.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length !== 2 || pinchStart <= 0) return;
      const dist = getTouchDistance(e.touches);
      const delta = pinchStart - dist;
      if (Math.abs(delta) > 2) {
        zoomView(delta);
        pinchStart = dist;
      }
      e.preventDefault();
    },
    { passive: false }
  );
  container.addEventListener('touchend', () => {
    pinchStart = 0;
  });
}

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function ensureLoading() {
  const container = getCanvas();
  if (!container) return null;
  if (!loadingEl) {
    loadingEl = document.createElement('div');
    loadingEl.className = 'viewer-loading';
    loadingEl.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin text-brand-500 text-2xl"></i><span class="text-xs text-slate-400 mt-2">A carregar modelo 3D…</span>';
    container.appendChild(loadingEl);
  }
  return loadingEl;
}

function setLoading(visible) {
  const el = ensureLoading();
  if (el) el.style.display = visible ? 'flex' : 'none';
}

function loadModel3d(product, generation) {
  const urlGlb =
    product.modelGlbUrl ||
    (product.modelUrl?.toLowerCase().endsWith('.glb') ? product.modelUrl : null);
  const url3mf =
    product.model3mfUrl ||
    (product.modelUrl?.toLowerCase().endsWith('.3mf') ? product.modelUrl : null);

  if (urlGlb) {
    loadGlbModel(product, urlGlb, generation);
  } else if (url3mf) {
    load3mfModel(product, url3mf, generation);
  } else {
    loadStlModel(product, generation);
  }
}

function onModelLoadError(product, generation) {
  if (generation !== loadGeneration) return;
  setLoading(false);
  console.warn('Visualizador: falha ao carregar modelo 3D', {
    id: product.id,
    model3mfUrl: product.model3mfUrl,
    modelUrl: product.modelUrl,
  });

  if (product.modelGlbUrl || product.model3mfUrl || product.modelUrl) {
    showModelError();
    const hint = document.getElementById('viewer-drag-hint');
    if (hint) hint.textContent = 'Modelo 3D indisponível — use «Tentar novamente» ou atualize a página (Ctrl+F5)';
    return;
  }

  if (product.previewImages?.length) {
    showTurntable(product.previewImages);
    const hint = document.getElementById('viewer-drag-hint');
    if (hint) hint.textContent = 'Arraste ↔ ou ↕ para ver outros ângulos';
  } else {
    hideTurntable();
    loadGeometricModel(product.shape3d || 'box');
  }
}

function loadGlbModel(product, url, generation) {
  setLoading(true);
  hideModelError();

  loadGlbObject(url)
    .then((object) => {
      if (generation !== loadGeneration) return;
      setLoading(false);
      hideTurntable();
      hideModelError();
      applyGlbObject(object, product);
      setViewerHint3d();
    })
    .catch((err) => {
      if (generation !== loadGeneration) return;
      console.warn('Visualizador: GLB', err);
      const url3mf = product.model3mfUrl;
      if (url3mf) {
        load3mfModel(product, url3mf, generation);
        return;
      }
      if (product.modelUrl?.toLowerCase().endsWith('.stl')) {
        loadStlModel(product, generation);
        return;
      }
      onModelLoadError(product, generation);
    });
}

function applyGlbObject(object, product) {
  clearModel();
  activeMesh = null;

  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.computeVertexNormals();
    polishMeshMaterial(child);
  });

  const rot = resolveDisplayRotation(object, product.modelRotation, { source: 'gltf' });
  object.rotation.set(rot.x ?? 0, rot.y ?? 0, rot.z ?? 0);
  object.updateMatrixWorld(true);

  const content = new THREE.Group();
  content.add(object);

  const box = new THREE.Box3().setFromObject(content);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  content.scale.setScalar(2.8 / maxDim);

  content.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(content);
  const center = fitted.getCenter(new THREE.Vector3());
  content.position.x -= center.x;
  content.position.z -= center.z;
  content.position.y -= fitted.min.y;

  const facing = product.modelFacing ?? 0;
  createModelPivot(content, facing);
  fitCameraToMesh();
  publishProductColors([]);
}

function load3mfModel(product, url, generation) {
  setLoading(true);
  hideModelError();

  load3mfObject(url)
    .then((object) => {
      if (generation !== loadGeneration) return;
      setLoading(false);
      hideTurntable();
      hideModelError();
      try {
        apply3mfObject(object, product);
        setViewerHint3d();
      } catch (err) {
        console.warn('Visualizador: erro ao montar 3MF', err);
        if (product.modelUrl?.toLowerCase().endsWith('.stl')) {
          loadStlModel(product, generation);
          return;
        }
        onModelLoadError(product, generation);
      }
    })
    .catch((err) => {
      if (generation !== loadGeneration) return;
      console.warn('Visualizador: 3MF', err);
      if (product.modelUrl?.toLowerCase().endsWith('.stl')) {
        loadStlModel(product, generation);
        return;
      }
      onModelLoadError(product, generation);
    });
}

function polishMeshMaterial(mesh) {
  const tune = (mat) => {
    if (!mat) return;
    if (mesh.geometry?.attributes?.color) {
      mat.vertexColors = true;
    }
    if ('roughness' in mat) mat.roughness = Math.min(mat.roughness ?? 0.5, 0.48);
    if ('metalness' in mat) mat.metalness = Math.min(mat.metalness ?? 0, 0.06);
    mat.needsUpdate = true;
  };

  if (Array.isArray(mesh.material)) mesh.material.forEach(tune);
  else tune(mesh.material);
}

/** Mantém cores definidas pelo loader Bambu (MeshPhongMaterial por filamento). */
function polishBambuMaterials(mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach((mat) => {
    if (!mat?.color) return;
    mat.flatShading = true;
    mat.needsUpdate = true;
  });
}

function apply3mfObject(object, product) {
  clearModel();
  activeMesh = null;

  const isBambuMulticolor = isBambuMulticolorGroup(object);

  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.computeVertexNormals();
    if (isBambuMulticolor) polishBambuMaterials(child);
    else polishMeshMaterial(child);
  });

  const rot = resolveDisplayRotation(object, product.model3mfRotation, { source: 'print' });
  object.rotation.set(rot.x ?? 0, rot.y ?? 0, rot.z ?? 0);
  object.updateMatrixWorld(true);

  const content = new THREE.Group();
  content.add(object);

  const box = new THREE.Box3().setFromObject(content);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  content.scale.setScalar(2.8 / maxDim);

  content.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(content);
  const center = fitted.getCenter(new THREE.Vector3());
  content.position.x -= center.x;
  content.position.z -= center.z;
  content.position.y -= fitted.min.y;

  const facing = product.model3mfFacing ?? product.modelFacing ?? 0;
  createModelPivot(content, facing);
  fitCameraToMesh();
  const meshColors = isBambuMulticolor ? collectColorsFrom3mfObject(object) : [];
  publishProductColors(meshColors);
}

function loadStlModel(product, generation) {
  setLoading(true);
  hideModelError();

  loadStlGeometry(product.modelUrl)
    .then((geometry) => {
      if (generation !== loadGeneration) return;
      setLoading(false);
      hideTurntable();
      hideModelError();
      applyStlGeometry(
        geometry,
        product.modelColor || MATERIAL.color,
        product.modelRotation,
        product.modelFacing ?? 0
      );
      setViewerHint3d();
    })
    .catch((err) => {
      if (generation !== loadGeneration) return;
      console.warn('Visualizador: STL', err);
      onModelLoadError(product, generation);
    });
}

function applyStlGeometry(geometry, colorHex, rotation = {}, facingY = 0) {
  clearModel();

  geometry.center();
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(colorHex),
    roughness: 0.45,
    metalness: 0.05,
    clearcoat: 0.2,
    clearcoatRoughness: 0.3,
  });

  modelPivot = new THREE.Group();
  activeMesh = new THREE.Mesh(geometry, material);

  const wrap = new THREE.Group();
  wrap.add(activeMesh);
  const rot = resolveDisplayRotation(wrap, rotation, { source: 'print' });
  wrap.rotation.set(rot.x ?? 0, rot.y ?? 0, rot.z ?? 0);
  wrap.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  wrap.scale.setScalar(2.8 / maxDim);

  wrap.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(wrap);
  const center = fitted.getCenter(new THREE.Vector3());
  wrap.position.x -= center.x;
  wrap.position.z -= center.z;
  wrap.position.y -= fitted.min.y;

  createModelPivot(wrap, facingY);
  fitCameraToMesh();
  publishProductColors([colorHex.startsWith('#') ? colorHex.toUpperCase() : `#${colorHex}`.toUpperCase()]);
}

function fitCameraToMesh() {
  const target = modelPivot || activeMesh;
  if (!target || !camera) return;
  const box = new THREE.Box3().setFromObject(target);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  cameraDistance = maxDim * 2.2;
  cameraDistanceMin = cameraDistance * 0.35;
  cameraDistanceMax = cameraDistance * 3.5;
  resetProductView();
  applyCameraPosition();
}

function rotateProduct(dx, dy) {
  if (!modelPivot || !hasProductModel3d()) return;

  const speed = getProductRotateSpeed();

  deltaProductQuat.setFromAxisAngle(rotateAxis.set(0, 1, 0), -dx * speed);
  productSpinQuat.premultiply(deltaProductQuat);

  deltaProductQuat.setFromAxisAngle(rotateAxis.set(1, 0, 0), -dy * speed);
  productSpinQuat.premultiply(deltaProductQuat);

  productSpinVelocity = -dx * speed * 0.4;
  applyProductRotation();
}

function tickProductInertia() {
  if (
    !modelPivot ||
    !hasProductModel3d() ||
    isProductDragging ||
    Math.abs(productSpinVelocity) < PRODUCT_SPIN_MIN
  ) {
    return;
  }

  deltaProductQuat.setFromAxisAngle(rotateAxis.set(0, 1, 0), productSpinVelocity);
  productSpinQuat.premultiply(deltaProductQuat);
  productSpinVelocity *= PRODUCT_SPIN_INERTIA;
  applyProductRotation();
}

function ensureTurntable() {
  const container = getCanvas();
  if (!container) return null;

  if (!turntableEl) {
    turntableEl = document.createElement('div');
    turntableEl.id = 'viewer-turntable';
    turntableEl.className = 'viewer-turntable';
    turntableEl.innerHTML =
      '<img class="viewer-turntable-img" alt="" draggable="false" /><p class="viewer-turntable-dots"></p>';
    container.appendChild(turntableEl);
    bindTurntableDrag(turntableEl);
  }
  return turntableEl;
}

function showTurntable(urls) {
  turntableUrls = urls;
  turntableIndex = 0;
  turntableScale = 1;

  if (renderer?.domElement) renderer.domElement.style.display = 'none';
  const el = ensureTurntable();
  if (!el) return;

  el.style.display = 'flex';
  const img = el.querySelector('.viewer-turntable-img');
  img.src = urls[0];
  img.alt = selectedProduct?.name || 'Produto';
  img.style.transform = 'scale(1)';

  const dots = el.querySelector('.viewer-turntable-dots');
  dots.textContent = urls.map((_, i) => (i === 0 ? '●' : '○')).join(' ');
}

function hideTurntable() {
  if (turntableEl) turntableEl.style.display = 'none';
  if (renderer?.domElement && modelErrorEl?.style.display !== 'flex') {
    renderer.domElement.style.display = 'block';
  }
}

function ensureModelError() {
  const container = getCanvas();
  if (!container) return null;

  if (!modelErrorEl) {
    modelErrorEl = document.createElement('div');
    modelErrorEl.className = 'viewer-model-error';
    modelErrorEl.innerHTML = `
      <i class="fa-solid fa-triangle-exclamation text-amber-500 text-2xl" aria-hidden="true"></i>
      <p class="text-sm text-slate-300 mt-2 text-center max-w-xs">Não foi possível carregar o modelo 3D.</p>
      <p class="text-[10px] text-slate-500 mt-1 text-center">Confirme <code class="text-slate-400">npm run products:sync</code> e recarregue (Ctrl+F5).</p>
      <button type="button" class="viewer-model-error-retry mt-4 px-4 py-2 text-sm font-bold rounded-lg bg-brand-500 hover:bg-brand-400 text-brand-900 transition">
        Tentar novamente
      </button>`;
    modelErrorEl.querySelector('.viewer-model-error-retry')?.addEventListener('click', () => {
      if (selectedProduct) selectProduct(selectedProduct);
    });
    container.appendChild(modelErrorEl);
  }
  return modelErrorEl;
}

function showModelError() {
  hideTurntable();
  if (renderer?.domElement) renderer.domElement.style.display = 'none';
  const el = ensureModelError();
  if (el) el.style.display = 'flex';
}

function hideModelError() {
  if (modelErrorEl) modelErrorEl.style.display = 'none';
  if (renderer?.domElement && turntableEl?.style.display !== 'flex') {
    renderer.domElement.style.display = 'block';
  }
}

function bindTurntableDrag(el) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startIndex = 0;

  const onStart = (x, y) => {
    if (turntableUrls.length < 2) return;
    dragging = true;
    startX = x;
    startY = y;
    startIndex = turntableIndex;
  };

  const onMove = (x, y) => {
    if (!dragging) return;
    const dx = x - startX;
    const dy = y - startY;

    if (Math.abs(dx) >= Math.abs(dy) * 0.6) {
      const step = Math.round(dx / 48);
      const next = (startIndex - step + turntableUrls.length * 10) % turntableUrls.length;
      if (next !== turntableIndex) {
        turntableIndex = next;
        el.querySelector('.viewer-turntable-img').src = turntableUrls[turntableIndex];
        const dots = el.querySelector('.viewer-turntable-dots');
        dots.textContent = turntableUrls
          .map((_, i) => (i === turntableIndex ? '●' : '○'))
          .join(' ');
      }
    }
  };

  const onEnd = () => {
    dragging = false;
  };

  el.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
  el.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', onEnd);
  el.addEventListener(
    'touchstart',
    (e) => onStart(e.touches[0].clientX, e.touches[0].clientY),
    { passive: true }
  );
  el.addEventListener('touchmove', (e) => onMove(e.touches[0].clientX, e.touches[0].clientY), {
    passive: true,
  });
  el.addEventListener('touchend', onEnd);
}

function bindThreeDrag() {
  const el = renderer.domElement;
  let prev = { x: 0, y: 0 };

  const move = (x, y) => {
    if (!isProductDragging || !modelPivot) return;
    rotateProduct(x - prev.x, y - prev.y);
    prev = { x, y };
  };

  const end = (e) => {
    if (!isProductDragging) return;
    isProductDragging = false;
    if (e?.pointerId != null) el.releasePointerCapture(e.pointerId);
  };

  el.addEventListener('pointerdown', (e) => {
    if (
      e.button !== 0 ||
      turntableEl?.style.display === 'flex' ||
      !modelPivot ||
      !hasProductModel3d()
    ) {
      return;
    }
    isProductDragging = true;
    productSpinVelocity = 0;
    prev = { x: e.clientX, y: e.clientY };
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  el.addEventListener('pointermove', (e) => {
    if (!isProductDragging) return;
    move(e.clientX, e.clientY);
    e.preventDefault();
  });

  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function loadGeometricModel(shapeType) {
  clearModel();

  const createGeometry = SHAPES[shapeType] || SHAPES.box;
  const geometry = createGeometry();
  const flatShading = shapeType === 'box';

  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(MATERIAL.color),
    roughness: MATERIAL.roughness,
    metalness: MATERIAL.metalness,
    clearcoat: 0.4,
    clearcoatRoughness: 0.2,
    transmission: MATERIAL.transmission,
    thickness: 0.5,
    flatShading,
  });

  activeMesh = new THREE.Mesh(geometry, material);
  activeMesh.position.y = 0.1;
  createModelPivot(activeMesh, 0);
  fitCameraToMesh();
}

function animate() {
  requestAnimationFrame(animate);
  tickProductInertia();
  renderer?.render(scene, camera);
}

function onWindowResize() {
  const container = getCanvas();
  if (!container || !camera || !renderer) return;

  const width = container.clientWidth;
  const height = container.clientHeight;
  if (width < 1 || height < 1) return;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

export function resetView() {
  if (selectedProduct?.previewImages?.length && turntableEl?.style.display === 'flex') {
    turntableIndex = 0;
    turntableScale = 1;
    const img = turntableEl?.querySelector('.viewer-turntable-img');
    if (img) {
      img.src = selectedProduct.previewImages[0];
      img.style.transform = 'scale(1)';
    }
    const dots = turntableEl?.querySelector('.viewer-turntable-dots');
    if (dots) {
      dots.textContent = selectedProduct.previewImages.map((_, i) => (i === 0 ? '●' : '○')).join(' ');
    }
    return;
  }
  resetProductView();
  fitCameraToMesh();
}

export function requestCustomOrder() {
  const name = selectedProduct?.name || 'Produto da loja';
  const price = selectedProduct ? formatBRL(selectedProduct.price) : '';

  const msg =
    `🎨 *INTERESSE EM PROJETO À MEDIDA — GD3D* 🎨\n\n` +
    `Explorei o visualizador 3D e tenho interesse:\n\n` +
    `📦 *Produto:* ${name}\n` +
    (price ? `💰 *Referência:* ${price}\n\n` : '\n') +
    `_Por favor, confirma disponibilidade e detalhes de envio!_`;

  window.open(`https://api.whatsapp.com/send?phone=${WHATSAPP_PHONE}&text=${encodeURIComponent(msg)}`, '_blank');
}
