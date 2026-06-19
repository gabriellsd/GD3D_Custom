import { initShell } from '../layout/shell.js';
import { requireRole } from '../auth/client.js';
import { initGd3dProduto } from "../viewer/advanced/gd3d-produto.js";
import * as THREE from "three";
    import { STLLoader } from "three/addons/loaders/STLLoader.js";
    import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
    import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
    import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
    import { carregarFbx, revogarUrlsFbx } from "../viewer/advanced/fbx-loader-helper.js";
    import { OFFLoader } from "../viewer/advanced/off-loader.js";
    import { carregar3mf } from "../viewer/advanced/loader-3mf.js";
    import { initFerramentas } from "../viewer/advanced/ferramentas.js";
    import { initExtensoes } from "../viewer/advanced/extensoes.js";
    import { montarControlesViewport } from "../viewer/advanced/controles-viewport.js";
    import { initPublicarProduto } from "../viewer/advanced/publicar-produto.js";
    import { analisarFilamentosBambu } from "../viewer/advanced/bambu-3mf.js";
    import { initPainelItems, nomeGrupoImportacao } from "../viewer/advanced/painel-items.js";
    import { renderViewerAsideNav } from "../layout/header.js";
    import { extrairCoresDoObject, metaBambuDoObject, extrairCoresDo3mfBuffer, materialFilamentoBambu, aplicarPolygonOffsetFilamento, normalizarHexCor } from "../viewer/advanced/cores-modelo.js";
    import {
      limparEditorCores,
      registarCoresOriginais,
      listarFilamentosEditaveis,
      aplicarCorMesh,
      restaurarCorMesh,
      restaurarTodasCores,
      aplicarOverrideMaterial,
      temCustomizacoesCores,
    } from "../viewer/advanced/editor-cores.js";
    import {
      exportar3mfComCores,
      extensao3mf,
      coletarCoresParaExportacao,
    } from "../viewer/advanced/exportar-3mf-cores.js";
    import { criarSeletorCor } from "../viewer/advanced/seletor-cor.js";
    import { detectarPecasSeparaveis, filamentosSubPeca, subItensPainelPeca } from "../viewer/advanced/pecas-modelo.js";
    import { detectarBandejas3mfBuffer } from "../viewer/advanced/bambu-bandejas.js";

(async () => {
    await initShell({ page: 'viewer-advanced', title: 'Visualizador técnico — GD3D Creative' });
    document.getElementById("viewer-aside-nav")?.insertAdjacentHTML("beforeend", renderViewerAsideNav());
    const user = await requireRole('admin');
    if (!user) return;
    document.body.classList.add('viewer-advanced-active');

    const container = document.getElementById("canvas-container");
    const placeholder = document.getElementById("placeholder");
    const statusEl = document.getElementById("status");
    const infoPanel = document.getElementById("info-panel");

    const backgrounds = [0x080808, 0x141414, 0xffffff, 0x2d2d2d];
    let bgIndex = 0;
    let usarCores = true;
    let currentModel = null;
    let itensSelecionados3d = [];
    let helpersSelecao = [];
    const seletorCor = criarSeletorCor();
    let meshUuidPickerAberto = null;
    const materiaisOriginais = new Map();
    const meshComCorVertice = new Set();
    const COR_PADRAO = 0xe8a317;
    let cameraDistance = 5;
    let minCameraDistance = 0.05;

    /** Órbita esférica: theta=0 → câmara em +Z (frente do modelo). */
    const orbit = {
      theta: 0,
      phi: Math.PI / 2 - 0.2,
      minPhi: 0.1,
      maxPhi: Math.PI - 0.1,
    };

    const ZOOM_SENS = 0.001;
    const ZOOM_MAX = 50000;
    const panOffset = new THREE.Vector3();
    const centroVisao = new THREE.Vector3();
    const eixoCameraDireita = new THREE.Vector3();
    const eixoCameraCima = new THREE.Vector3();
    const rotacaoQuat = new THREE.Quaternion();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgrounds[bgIndex]);

    const modelPivot = new THREE.Group();
    scene.add(modelPivot);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 100000);

    function resetOrbitFrontal() {
      orbit.theta = 0;
      orbit.phi = Math.PI / 2 - 0.2;
    }

    function posicionarCameraOrbita(alvoX, alvoY, alvoZ) {
      const r = cameraDistance;
      const sinPhi = Math.sin(orbit.phi);
      camera.position.set(
        alvoX + r * sinPhi * Math.sin(orbit.theta),
        alvoY + r * Math.cos(orbit.phi),
        alvoZ + r * sinPhi * Math.cos(orbit.theta)
      );
      camera.lookAt(alvoX, alvoY, alvoZ);
    }

    function getCentroModelo() {
      if (itensSelecionados3d.length) {
        const caixa = new THREE.Box3();
        for (const obj of itensSelecionados3d) {
          obj.updateMatrixWorld(true);
          caixa.expandByObject(obj);
        }
        caixa.getCenter(centroVisao);
        return centroVisao;
      }
      if (!currentModel) return centroVisao.set(0, 0, 0);
      new THREE.Box3().setFromObject(modelPivot).getCenter(centroVisao);
      return centroVisao;
    }

    function updateCamera() {
      getCentroModelo();
      posicionarCameraOrbita(
        centroVisao.x + panOffset.x,
        centroVisao.y + panOffset.y,
        centroVisao.z + panOffset.z
      );
    }

    updateCamera();

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      logarithmicDepthBuffer: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x3a3a4a, 1.1);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(4, 6, 5);
    scene.add(dirLight);

    const drag = {
      active: false,
      panning: false,
      manipulouObjeto: false,
      lastX: 0,
      lastY: 0,
    };

    const pick = {
      raio: new THREE.Raycaster(),
      mouse: new THREE.Vector2(),
      downX: 0,
      downY: 0,
      offsetArrasto: new THREE.Vector3(),
      pontoPlano: new THREE.Vector3(),
      planoArrasto: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      pivotLocal: new THREE.Vector3(),
      eixoLocalX: new THREE.Vector3(),
      eixoLocalY: new THREE.Vector3(),
      quatDelta: new THREE.Quaternion(),
      offsetRotacao: new THREE.Vector3(),
      centroMundo: new THREE.Vector3(),
      posMundo: new THREE.Vector3(),
      qWorld: new THREE.Quaternion(),
      qParentWorld: new THREE.Quaternion(),
      qRotY: new THREE.Quaternion(),
      qRotX: new THREE.Quaternion(),
      hitArrastoInicio: null,
      yBaseArrasto: 0,
      posicoesArrastoInicio: [],
      pivotsRotacao: [],
      aguardarSelecaoCtrl: false,
    };

    const canvas = renderer.domElement;

    function velocidadeOrbita() {
      const largura = container.clientWidth || 800;
      return (Math.PI * 1.15) / largura;
    }

    function velocidadeRotacaoObjeto() {
      return velocidadeOrbita() * 2.4;
    }

    function aplicarRotacao() {
      modelPivot.quaternion.copy(rotacaoQuat);
    }

    function resetarRotacao() {
      rotacaoQuat.identity();
      aplicarRotacao();
    }

    function orbitarCamera(dx, dy) {
      const sens = velocidadeOrbita();
      orbit.theta -= dx * sens;
      orbit.phi = THREE.MathUtils.clamp(orbit.phi - dy * sens, orbit.minPhi, orbit.maxPhi);
      updateCamera();
    }

    function addOrbitTheta(delta) {
      orbit.theta += delta;
      updateCamera();
    }

    function setOrbitAngles(theta, phi) {
      orbit.theta = theta;
      orbit.phi = THREE.MathUtils.clamp(phi, orbit.minPhi, orbit.maxPhi);
      updateCamera();
    }

    function criarContainerModelo(object, ext) {
      const orientacao = new THREE.Group();
      const extNorm = (ext || "").toLowerCase();
      if (
        extNorm === "stl" ||
        extNorm === "ply" ||
        extNorm === "3mf" ||
        extNorm === "mf3" ||
        extNorm === "gcode" ||
        extNorm === "gco" ||
        extNorm === "g"
      ) {
        orientacao.rotation.x = -Math.PI / 2;
      }
      orientacao.add(object);

      const containerModelo = new THREE.Group();
      containerModelo.add(orientacao);
      return containerModelo;
    }

    canvas.addEventListener("contextmenu", (event) => event.preventDefault());

    let ferramentas = null;
    let extensoes = null;
    let painelItems = null;
    let ultimoFormato = "STL";
    let ultimoArquivoFile = null;
    let ultimoArquivosImportados = null;
    let publicarProduto = null;
    let secaoFilamentosCache = null;
    let secaoExtensoesCache = null;
    let fbxUrlsAtivas = [];
    const gltfLoader = new GLTFLoader();

    function encontrarGrupoImportacao(object) {
      let node = object;
      while (node && node.parent !== currentModel) {
        node = node.parent;
      }
      return node?.parent === currentModel ? node : null;
    }

    function temVariosModelosNaCena() {
      return (currentModel?.children?.length ?? 0) > 1;
    }

    function manipularSelecionadoNaCena() {
      return Boolean(itensSelecionados3d.length && temVariosModelosNaCena());
    }

    function podeGirarSelecionadoNaCena() {
      return itensSelecionados3d.length > 0;
    }

    function atualizarHelpersSelecao() {
      for (const helper of helpersSelecao) helper.update?.();
    }

    function ajustarZoomAosItensSelecionados() {
      if (!itensSelecionados3d.length) return;
      const caixa = new THREE.Box3();
      for (const obj of itensSelecionados3d) {
        obj.updateMatrixWorld(true);
        caixa.expandByObject(obj);
      }
      const size = caixa.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      minCameraDistance = maxDim * 0.12;
      camera.near = Math.max(maxDim * 0.002, 0.01);
      camera.far = Math.max(maxDim * 200, 1000);
      camera.updateProjectionMatrix();
    }

    function definirItensSelecionados(object3ds) {
      itensSelecionados3d = object3ds?.length ? [...object3ds] : [];
      for (const helper of helpersSelecao) scene.remove(helper);
      helpersSelecao = [];

      if (itensSelecionados3d.length) {
        for (const obj of itensSelecionados3d) {
          const helper = new THREE.BoxHelper(obj, 0xe8a317);
          scene.add(helper);
          helpersSelecao.push(helper);
        }
        ajustarZoomAosItensSelecionados();
        const n = itensSelecionados3d.length;
        if (temVariosModelosNaCena()) {
          setStatus(
            n === 1
              ? `Selecionado: ${itensSelecionados3d[0].name} · arrastar girar · Shift+arrastar mover · Ctrl+clique multi`
              : `${n} modelos selecionados · arrastar girar · Shift+arrastar mover`
          );
        } else {
          setStatus(
            `Selecionado: ${itensSelecionados3d[0].name} · arrastar girar no próprio eixo`
          );
        }
      }

      updateCamera();
      ferramentas?.atualizarAuxiliaresVisuais?.();
      atualizarCoresUi();
      atualizarPainelInfo();
    }

    function rotacionarEmTornoDoCentro(obj, deltaQ, centroMundo) {
      pick.centroMundo.copy(centroMundo);
      obj.getWorldPosition(pick.posMundo);

      pick.posMundo.sub(pick.centroMundo).applyQuaternion(deltaQ).add(pick.centroMundo);

      if (obj.parent) {
        obj.parent.worldToLocal(pick.posMundo);
      }
      obj.position.copy(pick.posMundo);

      obj.getWorldQuaternion(pick.qWorld);
      pick.qWorld.premultiply(deltaQ);

      if (obj.parent) {
        obj.parent.getWorldQuaternion(pick.qParentWorld);
        pick.qParentWorld.invert().multiply(pick.qWorld);
        obj.quaternion.copy(pick.qParentWorld);
      } else {
        obj.quaternion.copy(pick.qWorld);
      }
    }

    function noSemRotacao(node) {
      if (!node) return true;
      const { x, y, z } = node.quaternion;
      return x * x + y * y + z * z < 1e-8;
    }

    function cadeiaSemRotacaoAteCena(obj) {
      let node = obj.parent;
      while (node) {
        if (!noSemRotacao(node)) return false;
        node = node.parent;
      }
      return true;
    }

    function iniciarRotacaoSelecionados() {
      pick.pivotsRotacao = itensSelecionados3d.map((obj) => {
        obj.updateMatrixWorld(true);
        const centroMundo = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
        const pivotLocal = centroMundo.clone();
        if (obj.parent) obj.parent.worldToLocal(pivotLocal);
        return {
          obj,
          centroMundo: centroMundo.clone(),
          pivotLocal,
          rapido: cadeiaSemRotacaoAteCena(obj),
        };
      });
    }

    function rotacionarEmTornoDoPivotLocal(obj, deltaQ, pivotLocal) {
      pick.offsetRotacao.copy(obj.position).sub(pivotLocal);
      pick.offsetRotacao.applyQuaternion(deltaQ);
      obj.position.copy(pivotLocal).add(pick.offsetRotacao);
      obj.quaternion.premultiply(deltaQ);
    }

    function intersetarPlanoArrasto(event, yBase) {
      atualizarMouseNDC(event);
      pick.raio.setFromCamera(pick.mouse, camera);
      pick.planoArrasto.set(pick.eixoLocalY.set(0, 1, 0), -yBase);
      return pick.raio.ray.intersectPlane(pick.planoArrasto, pick.pontoPlano)
        ? pick.pontoPlano.clone()
        : null;
    }

    function iniciarArrastoNoPlano(event) {
      const ref = itensSelecionados3d[0];
      if (!ref) return false;
      ref.updateMatrixWorld(true);
      pick.yBaseArrasto = new THREE.Box3().setFromObject(ref).min.y;
      const hit = intersetarPlanoArrasto(event, pick.yBaseArrasto);
      if (!hit) return false;
      pick.hitArrastoInicio = hit;
      pick.posicoesArrastoInicio = itensSelecionados3d.map((obj) => ({
        obj,
        pos: obj.position.clone(),
      }));
      return true;
    }

    function moverSelecionadoNoPlano(event) {
      const ref = itensSelecionados3d[0];
      if (!ref || !pick.hitArrastoInicio || !pick.posicoesArrastoInicio.length) return;
      const hit = intersetarPlanoArrasto(event, pick.yBaseArrasto);
      if (!hit) return;
      const delta = hit.sub(pick.hitArrastoInicio);
      for (const item of pick.posicoesArrastoInicio) {
        item.obj.position.copy(item.pos).add(delta);
      }
      drag.manipulouObjeto = true;
    }

    function girarSelecionado(dx, dy) {
      if (!pick.pivotsRotacao.length) return;
      const sens = velocidadeRotacaoObjeto();

      camera.updateMatrixWorld();
      eixoCameraDireita.setFromMatrixColumn(camera.matrix, 0);

      pick.qRotY.setFromAxisAngle(pick.eixoLocalY.set(0, 1, 0), -dx * sens);
      pick.qRotX.setFromAxisAngle(eixoCameraDireita, -dy * sens);
      pick.quatDelta.copy(pick.qRotY).multiply(pick.qRotX);

      for (const item of pick.pivotsRotacao) {
        if (item.rapido) {
          rotacionarEmTornoDoPivotLocal(item.obj, pick.quatDelta, item.pivotLocal);
        } else {
          rotacionarEmTornoDoCentro(item.obj, pick.quatDelta, item.centroMundo);
        }
      }
      drag.manipulouObjeto = true;
    }

    function atualizarMouseNDC(event) {
      const rect = canvas.getBoundingClientRect();
      pick.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pick.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function selecionarGrupoNaCena(event) {
      if (!currentModel) return;
      atualizarMouseNDC(event);
      pick.raio.setFromCamera(pick.mouse, camera);
      const hits = pick.raio.intersectObject(currentModel, true);
      if (!hits.length) {
        if (!(event.ctrlKey || event.metaKey)) {
          definirItensSelecionados([]);
          painelItems?.limparSelecao?.();
        }
        return;
      }
      const grupo = encontrarGrupoImportacao(hits[0].object);
      if (!grupo) return;
      painelItems?.selecionarPorObject3d?.(grupo, {
        ctrlKey: event.ctrlKey || event.metaKey,
      });
    }

    canvas.addEventListener("pointerdown", (event) => {
      if (ferramentas?.onPointerDown(event)) return;

      if (event.button === 0 && (event.ctrlKey || event.metaKey)) {
        pick.aguardarSelecaoCtrl = true;
        pick.downX = event.clientX;
        pick.downY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
        return;
      }

      pick.aguardarSelecaoCtrl = false;

      drag.manipulouObjeto = false;

      if (event.button === 0 && !event.shiftKey) {
        drag.active = true;
        drag.panning = false;
      } else if (event.button === 0 && event.shiftKey) {
        drag.active = true;
        drag.panning = true;
      } else if (event.button === 2) {
        drag.active = true;
        drag.panning = true;
      } else {
        return;
      }

      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      pick.downX = event.clientX;
      pick.downY = event.clientY;

      if (drag.panning && manipularSelecionadoNaCena()) {
        iniciarArrastoNoPlano(event);
      } else if (!drag.panning && podeGirarSelecionadoNaCena()) {
        iniciarRotacaoSelecionados();
      } else {
        pick.pivotsRotacao = [];
      }

      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointerup", (event) => {
      if (pick.aguardarSelecaoCtrl && event.button === 0) {
        pick.aguardarSelecaoCtrl = false;
        if (Math.hypot(event.clientX - pick.downX, event.clientY - pick.downY) < 6) {
          selecionarGrupoNaCena(event);
        }
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
        return;
      }

      if (
        drag.active &&
        !drag.panning &&
        event.button === 0 &&
        Math.hypot(event.clientX - pick.downX, event.clientY - pick.downY) < 6
      ) {
        selecionarGrupoNaCena(event);
      }

      const manipulouObjeto = drag.manipulouObjeto;
      drag.active = false;
      drag.panning = false;
      drag.manipulouObjeto = false;
      pick.pivotsRotacao = [];
      ferramentas?.onPointerUp();
      if (manipulouObjeto) {
        atualizarHelpersSelecao();
        ferramentas?.atualizarAuxiliaresVisuais?.();
        updateCamera();
      }
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!drag.active) return;

      const eventos = event.getCoalescedEvents?.().length
        ? event.getCoalescedEvents()
        : [event];
      let dx = 0;
      let dy = 0;
      for (const ev of eventos) {
        dx += ev.clientX - drag.lastX;
        dy += ev.clientY - drag.lastY;
        drag.lastX = ev.clientX;
        drag.lastY = ev.clientY;
      }

      if (drag.panning) {
        if (manipularSelecionadoNaCena()) {
          moverSelecionadoNoPlano(event);
        } else {
          camera.updateMatrixWorld();
          eixoCameraDireita.setFromMatrixColumn(camera.matrix, 0);
          eixoCameraCima.setFromMatrixColumn(camera.matrix, 1);
          const factor = cameraDistance * 0.0015;
          panOffset.addScaledVector(eixoCameraDireita, -dx * factor);
          panOffset.addScaledVector(eixoCameraCima, dy * factor);
          updateCamera();
        }
        return;
      }

      if (podeGirarSelecionadoNaCena()) {
        girarSelecionado(dx, dy);
        return;
      }

      orbitarCamera(dx, dy);
      ferramentas?.onPointerMoveDrag(dx);
    });

    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        let delta = event.deltaY;
        if (event.deltaMode === 1) delta *= 16;
        else if (event.deltaMode === 2) delta *= 100;
        const escala = Math.exp(-delta * ZOOM_SENS);
        cameraDistance = THREE.MathUtils.clamp(
          cameraDistance * escala,
          minCameraDistance,
          ZOOM_MAX
        );
        updateCamera();
      },
      { passive: false }
    );

    function resize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 1 || h < 1) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      ferramentas?.sincronizarCameras();
    }
    window.addEventListener("resize", resize);
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => resize()).observe(container);
    }
    resize();

    const relogio = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      const delta = relogio.getDelta();
      ferramentas?.tick(delta);
      const cam = ferramentas?.cameraAtiva() ?? camera;
      renderer.render(scene, cam);
    }
    animate();

    function setStatus(msg, isError = false) {
      statusEl.textContent = msg;
      statusEl.className = isError ? "status error" : "status";
    }

    function setPainelPosModelo(visible) {
      document.getElementById("painel-pos-modelo")?.classList.toggle("hidden", !visible);
      document.getElementById("barra-tool-publicar")?.classList.toggle("hidden", !visible);
    }

    function clearModel() {
      if (currentModel) {
        modelPivot.remove(currentModel);
        currentModel.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material.dispose();
          }
        });
        currentModel = null;
        materiaisOriginais.clear();
        meshComCorVertice.clear();
        limparCoresModelo();
        limparEditorCores();
        ferramentas?.onModelCleared();
        extensoes?.onModelCleared();
        secaoFilamentosCache = null;
        secaoExtensoesCache = null;
        revogarUrlsFbx(fbxUrlsAtivas);
        fbxUrlsAtivas = [];
        ultimoArquivoFile = null;
        ultimoArquivosImportados = null;
        publicarProduto?.onModelCleared();
        setPainelPosModelo(false);
      }
      definirItensSelecionados([]);
      painelItems?.resetEstado();
    }

    function ensureItemsRoot() {
      if (!currentModel) {
        currentModel = new THREE.Group();
        currentModel.name = "items-root";
        modelPivot.add(currentModel);
      }
      return currentModel;
    }

    function sincronizarAposItemsAlterados() {
      if (!painelItems?.temItems()) {
        clearModel();
        placeholder.classList.remove("hidden");
        infoPanel.innerHTML = "";
        setStatus("Modelo removido");
        return;
      }
      if (!currentModel) return;
      organizarModelosNaCena(currentModel);
      currentModel.updateMatrixWorld(true);
      const geo = analisarGeometria(currentModel);
      const caixa = new THREE.Box3().setFromObject(currentModel);
      geo.tamanho = caixa.getSize(new THREE.Vector3());
      geo.centro = caixa.getCenter(new THREE.Vector3());
      geo.diagonal = geo.tamanho.length();
      enquadrarCena(currentModel, { resetView: false });
      if (ferramentas?.getEstado?.().grade) assentarModelosNaGrade();
      atualizarPainelInfo();
      extensoes?.onModelLoaded(currentModel, {
        ...ultimoExtras,
        bambuImpressao: ultimoExtras?.bambu?.bambuImpressao,
        formato: ultimoFormato,
      });
      atualizarCoresUi();
      ferramentas?.atualizarAuxiliaresVisuais?.();
    }

    function setPanOffset(x, y, z) {
      panOffset.set(x, y, z);
      updateCamera();
    }

    function unidadeParaCena(metros) {
      const fator = unidadeOrigemArquivo(ultimoFormato) === "m" ? 1 : 1000;
      return metros * fator;
    }

    function cenaParaMetros(valor) {
      const fator = unidadeOrigemArquivo(ultimoFormato) === "m" ? 1 : 0.001;
      return valor * fator;
    }

    function mmParaCena(mm) {
      return unidadeOrigemArquivo(ultimoFormato) === "m" ? mm * 0.001 : mm;
    }

    function formatarDistancia(metros) {
      const medidas = escolherUnidadeExibicao(metros);
      return formatarMedida(metros, medidas);
    }

    let ultimoArquivoMeta = null;
    let ultimoExtras = {};

    function assentarModelosNaGrade() {
      if (!currentModel) return;
      currentModel.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(currentModel);
      const deltaY = -box.min.y;
      if (Math.abs(deltaY) > 1e-9) {
        currentModel.position.y += deltaY;
        currentModel.updateMatrixWorld(true);
      }
    }

    function geoDeObject3d(object3d) {
      const geo = analisarGeometria(object3d);
      object3d.updateMatrixWorld(true);
      const caixa = new THREE.Box3().setFromObject(object3d);
      geo.tamanho = caixa.getSize(new THREE.Vector3());
      geo.centro = caixa.getCenter(new THREE.Vector3());
      geo.diagonal = geo.tamanho.length();
      return geo;
    }

    function montarSecoesSelecao(alvos) {
      if (alvos.length === 1) {
        const obj = alvos[0];
        const meta = obj.userData.arquivoMeta ?? ultimoArquivoMeta;
        const extras = obj.userData.extras ?? ultimoExtras;
        const formato = obj.userData.formato ?? ultimoFormato;
        const geo = geoDeObject3d(obj);
        const secoes = montarSecoes(meta, geo, extras);
        const secFil = ferramentas?.getSecaoFilamentosDeObject?.(obj);
        if (secFil) secoes.push(secFil);
        return secoes;
      }

      const caixa = new THREE.Box3();
      const geo = {
        malhas: 0,
        geometrias: 0,
        vertices: 0,
        triangulos: 0,
        indexadas: 0,
        naoIndexadas: 0,
        comNormais: 0,
        comUv: 0,
        comCores: 0,
        grupos: 0,
        materiais: 0,
        texturas: 0,
        area: 0,
        volume: 0,
      };
      const nomes = [];

      for (const obj of alvos) {
        obj.updateMatrixWorld(true);
        caixa.expandByObject(obj);
        const g = analisarGeometria(obj);
        geo.malhas += g.malhas;
        geo.geometrias += g.geometrias;
        geo.vertices += g.vertices;
        geo.triangulos += g.triangulos;
        geo.indexadas += g.indexadas;
        geo.naoIndexadas += g.naoIndexadas;
        geo.comNormais += g.comNormais;
        geo.comUv += g.comUv;
        geo.comCores += g.comCores;
        geo.grupos += g.grupos;
        geo.materiais += g.materiais;
        geo.texturas += g.texturas;
        geo.area += g.area ?? 0;
        geo.volume += g.volume ?? 0;
        nomes.push(obj.name || obj.userData.arquivoMeta?.nome || "Modelo");
      }

      geo.tamanho = caixa.getSize(new THREE.Vector3());
      geo.centro = caixa.getCenter(new THREE.Vector3());
      geo.diagonal = geo.tamanho.length();

      const meta = {
        nome: nomes.join(", "),
        formato: [...new Set(alvos.map((o) => o.userData.formato).filter(Boolean))].join(" + ") || ultimoFormato,
        tamanho: "—",
        mime: "—",
        modificado: "—",
        ficheiros: nomes,
        pecas: alvos.length,
      };

      const secoes = montarSecoes(meta, geo, {});
      secoes.unshift({
        titulo: "Seleção",
        itens: [["Modelos", String(alvos.length)], ["Nomes", nomes.join(", ")]],
      });
      return secoes;
    }

    function atualizarPainelInfo() {
      if (!currentModel || !painelItems?.temItems()) {
        limparPainel();
        return;
      }

      let alvos = itensSelecionados3d.length ? [...itensSelecionados3d] : null;

      if (!alvos?.length) {
        if (temVariosModelosNaCena()) {
          infoPanel.innerHTML =
            '<p class="info-vazio">Selecione um modelo para ver as informações</p>';
          return;
        }
        const grupos = painelItems.getGrupos?.() ?? [];
        if (grupos.length === 1) alvos = [grupos[0].object3d];
      }

      if (!alvos?.length) {
        infoPanel.innerHTML =
          '<p class="info-vazio">Selecione um modelo para ver as informações</p>';
        return;
      }

      renderizarPainel(montarSecoesSelecao(alvos));
    }

    function montarSecoesUltimo(geo) {
      const secoes = montarSecoes(ultimoArquivoMeta, geo, ultimoExtras);
      if (secaoFilamentosCache) secoes.push(secaoFilamentosCache);
      if (secaoExtensoesCache?.length) secoes.push(...secaoExtensoesCache);
      return secoes;
    }

    function disporNaHorizontal(pai) {
      const filhos = [...pai.children];
      if (filhos.length <= 1) return;

      const medidas = filhos.map((filho) => {
        filho.position.set(0, 0, 0);
        filho.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(filho);
        const center = box.getCenter(new THREE.Vector3());
        filho.position.x -= center.x;
        filho.position.y -= box.min.y;
        filho.position.z -= center.z;
        filho.updateMatrixWorld(true);
        box.setFromObject(filho);
        return { filho, largura: box.getSize(new THREE.Vector3()).x || 0.001 };
      });

      let cursor = 0;
      const gap = Math.max(medidas[0]?.largura * 0.12, 0.005);
      for (const { filho, largura } of medidas) {
        filho.position.x += cursor + largura * 0.5;
        cursor += largura + gap;
      }

      pai.updateMatrixWorld(true);
      const boxPai = new THREE.Box3().setFromObject(pai);
      const cx = (boxPai.min.x + boxPai.max.x) * 0.5;
      const cz = (boxPai.min.z + boxPai.max.z) * 0.5;
      filhos.forEach((f) => {
        f.position.x -= cx;
        f.position.z -= cz;
      });
    }

    function organizarModelosNaCena(root) {
      if (!root) return;
      for (const grupo of root.children) {
        if (grupo.children.length > 1) disporNaHorizontal(grupo);
      }
      if (root.children.length > 1) disporNaHorizontal(root);
    }

    function enquadrarCena(object, { resetView = true } = {}) {
      if (!object) return;
      organizarModelosNaCena(object);

      object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      object.position.sub(center);

      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      minCameraDistance = maxDim * 0.12;
      camera.near = Math.max(maxDim * 0.002, 0.01);
      camera.far = Math.max(maxDim * 200, 1000);
      camera.updateProjectionMatrix();
      if (resetView) {
        cameraDistance = maxDim * 2.2;
        panOffset.set(0, 0, 0);
        resetarRotacao();
        resetOrbitFrontal();
      } else {
        cameraDistance = Math.max(cameraDistance, maxDim * 2.2);
      }
      updateCamera();
      ferramentas?.atualizarAuxiliaresVisuais?.();
    }

    function centerAndFrame(object) {
      enquadrarCena(object, { resetView: true });
    }

    const vetorA = new THREE.Vector3();
    const vetorB = new THREE.Vector3();
    const vetorC = new THREE.Vector3();
    const vetorAb = new THREE.Vector3();
    const vetorAc = new THREE.Vector3();

    function formatarNumero(valor, casas = 2) {
      return Number(valor).toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: casas,
      });
    }

    function formatarTamanho(bytes) {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${formatarNumero(bytes / 1024, 1)} KB`;
      return `${formatarNumero(bytes / (1024 * 1024), 2)} MB`;
    }

    function formatarData(timestamp) {
      return new Date(timestamp).toLocaleString("pt-BR");
    }

    function unidadeOrigemArquivo(formato) {
      const f = formato.toUpperCase();
      if (f === "GLB" || f === "GLTF") return "m";
      return "mm";
    }

    async function lerMetadados3mf(arquivo) {
      const buffer = await arquivo.arrayBuffer();
      const texto = new TextDecoder().decode(new Uint8Array(buffer));
      const metadados = {};

      const titulo = texto.match(/<metadata name="Title">([^<]*)<\/metadata>/i);
      if (titulo) metadados.titulo = titulo[1].trim();

      const autor = texto.match(/<metadata name="Designer">([^<]*)<\/metadata>/i);
      if (autor) metadados.autor = autor[1].trim();

      const descricao = texto.match(/<metadata name="Description">([^<]*)<\/metadata>/i);
      if (descricao) metadados.descricao = descricao[1].trim();

      const objetos = (texto.match(/<object /g) || []).length;
      if (objetos > 0) metadados.objetos3mf = objetos;

      return metadados;
    }

    function paraMetros(valor, origem) {
      if (origem === "m") return valor;
      if (origem === "mm") return valor / 1000;
      if (origem === "cm") return valor / 100;
      return valor;
    }

    function escolherUnidadeExibicao(maiorDimensaoMetros) {
      return maiorDimensaoMetros >= 1 ? "m" : "cm";
    }

    function formatarMedida(valorMetros, unidade, casas = 2) {
      if (unidade === "m") {
        return `${formatarNumero(valorMetros, casas)} m`;
      }
      return `${formatarNumero(valorMetros * 100, casas)} cm`;
    }

    function formatarArea(areaMetrosQuadrados, unidade) {
      if (unidade === "m") {
        return `${formatarNumero(areaMetrosQuadrados, 4)} m²`;
      }
      return `${formatarNumero(areaMetrosQuadrados * 10000, 2)} cm²`;
    }

    function formatarVolume(volumeMetrosCubicos, unidade) {
      if (unidade === "m") {
        return `${formatarNumero(volumeMetrosCubicos, 6)} m³`;
      }
      return `${formatarNumero(volumeMetrosCubicos * 1000000, 2)} cm³`;
    }

    function converterMedidas(geo, formato) {
      const origem = unidadeOrigemArquivo(formato);
      const fator = origem === "m" ? 1 : 0.001;

      const tamanhoM = {
        x: geo.tamanho.x * fator,
        y: geo.tamanho.y * fator,
        z: geo.tamanho.z * fator,
      };
      const centroM = {
        x: geo.centro.x * fator,
        y: geo.centro.y * fator,
        z: geo.centro.z * fator,
      };
      const diagonalM = geo.diagonal * fator;
      const areaM2 = geo.areaSuperficie * fator * fator;
      const volumeM3 = geo.volume * fator * fator * fator;
      const maiorDim = Math.max(tamanhoM.x, tamanhoM.y, tamanhoM.z);
      const unidade = escolherUnidadeExibicao(maiorDim);

      return {
        origem,
        unidade,
        tamanhoM,
        centroM,
        diagonalM,
        areaM2,
        volumeM3,
        maiorDim,
      };
    }

    function areaTriangulo(geometria, i0, i1, i2) {
      const pos = geometria.attributes.position;
      vetorA.fromBufferAttribute(pos, i0);
      vetorB.fromBufferAttribute(pos, i1);
      vetorC.fromBufferAttribute(pos, i2);
      vetorAb.subVectors(vetorB, vetorA);
      vetorAc.subVectors(vetorC, vetorA);
      return vetorAb.cross(vetorAc).length() * 0.5;
    }

    function volumeTriangulo(geometria, i0, i1, i2) {
      const pos = geometria.attributes.position;
      vetorA.fromBufferAttribute(pos, i0);
      vetorB.fromBufferAttribute(pos, i1);
      vetorC.fromBufferAttribute(pos, i2);
      return vetorA.dot(vetorB.cross(vetorC)) / 6;
    }

    function analisarGeometria(object) {
      let vertices = 0;
      let triangulos = 0;
      let malhas = 0;
      let geometrias = 0;
      let areaSuperficie = 0;
      let volume = 0;
      let comNormais = 0;
      let comUv = 0;
      let comCores = 0;
      let indexadas = 0;
      let naoIndexadas = 0;
      const materiais = new Set();
      let texturas = 0;
      let grupos = 0;

      object.traverse((filho) => {
        if (filho.isMesh && filho.geometry) {
          malhas += 1;
          geometrias += 1;
          const geo = filho.geometry;
          const pos = geo.attributes.position;
          if (pos) vertices += pos.count;

          if (geo.index) {
            indexadas += 1;
            triangulos += geo.index.count / 3;
            for (let i = 0; i < geo.index.count; i += 3) {
              areaSuperficie += areaTriangulo(
                geo,
                geo.index.getX(i),
                geo.index.getX(i + 1),
                geo.index.getX(i + 2)
              );
              volume += volumeTriangulo(
                geo,
                geo.index.getX(i),
                geo.index.getX(i + 1),
                geo.index.getX(i + 2)
              );
            }
          } else if (pos) {
            naoIndexadas += 1;
            triangulos += pos.count / 3;
            for (let i = 0; i < pos.count; i += 3) {
              areaSuperficie += areaTriangulo(geo, i, i + 1, i + 2);
              volume += volumeTriangulo(geo, i, i + 1, i + 2);
            }
          }

          if (geo.attributes.normal) comNormais += 1;
          if (geo.attributes.uv) comUv += 1;
          if (geo.attributes.color) comCores += 1;
          if (filho.material) {
            const lista = Array.isArray(filho.material) ? filho.material : [filho.material];
            lista.forEach((mat) => {
              materiais.add(mat.uuid);
              if (mat.map || mat.normalMap || mat.roughnessMap || mat.metalnessMap) {
                texturas += 1;
              }
            });
          }
          if (filho.groups?.length) grupos += filho.groups.length;
        } else if (filho.isGroup || filho.isObject3D) {
          if (filho !== object && filho.children.length > 0 && !filho.isMesh) {
            grupos += 1;
          }
        }
      });

      const caixa = new THREE.Box3().setFromObject(object);
      const tamanho = caixa.getSize(new THREE.Vector3());
      const centro = caixa.getCenter(new THREE.Vector3());

      return {
        vertices,
        triangulos,
        malhas,
        geometrias,
        areaSuperficie,
        volume: Math.abs(volume),
        comNormais,
        comUv,
        comCores,
        indexadas,
        naoIndexadas,
        materiais: materiais.size,
        texturas,
        grupos,
        tamanho,
        centro,
        diagonal: tamanho.length(),
      };
    }

    async function detectarTipoStl(arquivo) {
      const trecho = await arquivo.slice(0, 80).text();
      const inicio = trecho.trim().toLowerCase();
      if (inicio.startsWith("solid")) {
        const amostra = await arquivo.slice(0, 512).text();
        return amostra.includes("facet normal") ? "ASCII" : "Binário";
      }
      return "Binário";
    }

    async function lerMetadadosArquivo(arquivo, extensao) {
      const metadados = {
        nome: arquivo.name,
        formato: extensao.toUpperCase(),
        tamanho: formatarTamanho(arquivo.size),
        tamanhoBytes: arquivo.size,
        mime: arquivo.type || "—",
        modificado: formatarData(arquivo.lastModified),
      };

      if (extensao === "stl") {
        metadados.tipoStl = await detectarTipoStl(arquivo);
      }

      if (extensao === "obj") {
        const texto = await arquivo.slice(0, 65536).text();
        const linhas = texto.split("\n");
        metadados.objetos = linhas.filter((l) => l.startsWith("o ")).length;
        metadados.gruposObj = linhas.filter((l) => l.startsWith("g ")).length;
        metadados.materiaisObj = linhas.filter((l) => l.startsWith("usemtl ")).length;
        const mtllib = linhas.find((l) => l.startsWith("mtllib "));
        if (mtllib) metadados.bibliotecaMtl = mtllib.replace("mtllib ", "").trim();
      }

      if (extensao === "3mf") {
        Object.assign(metadados, await lerMetadados3mf(arquivo));
      }

      return metadados;
    }

    function nomeBaseArquivo(arquivo) {
      return arquivo.name.replace(/\.[^.]+$/, "");
    }

    async function lerMetadadosVariosArquivos(arquivos) {
      const nomes = arquivos.map((a) => a.name);
      const totalBytes = arquivos.reduce((s, f) => s + f.size, 0);
      const formatos = [...new Set(arquivos.map((a) => a.name.split(".").pop().toUpperCase()))];
      const meta = {
        nome: nomeGrupoImportacao(nomes),
        formato: formatos.join(" + "),
        tamanho: formatarTamanho(totalBytes),
        tamanhoBytes: totalBytes,
        mime: "multipart/model",
        modificado: formatarData(Math.max(...arquivos.map((f) => f.lastModified))),
        ficheiros: nomes,
        pecas: nomes.length,
      };

      if (arquivos.every((a) => a.name.toLowerCase().endsWith(".stl"))) {
        const tipos = await Promise.all(arquivos.map((a) => detectarTipoStl(a)));
        const ascii = tipos.filter((t) => t === "ASCII").length;
        const binario = tipos.filter((t) => t === "Binário").length;
        meta.formato = "STL";
        meta.tipoStl =
          ascii && binario
            ? `${ascii} ASCII, ${binario} binário`
            : ascii
              ? "ASCII"
              : "Binário";
      }

      return meta;
    }

    async function lerMetadadosVariosStl(arquivos) {
      return lerMetadadosVariosArquivos(arquivos);
    }

    async function carregarStlComoPeca(arquivo) {
      const url = URL.createObjectURL(arquivo);
      try {
        const geom = await new STLLoader().loadAsync(url);
        const mesh = new THREE.Mesh(geom, materialPadrao(geom));
        const grupo = new THREE.Group();
        const nome = nomeBaseArquivo(arquivo);
        grupo.name = nome;
        mesh.name = nome;
        grupo.add(mesh);
        return grupo;
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    async function carregarVariosStl(arquivos) {
      const pecas = await Promise.all(arquivos.map((arquivo) => carregarStlComoPeca(arquivo)));
      const root = new THREE.Group();
      root.name = "conjunto-stl";
      for (const peca of pecas) root.add(peca);
      return root;
    }

    function metadadosGltf(gltf) {
      const json = gltf.parser?.json;
      if (!json) return {};

      const asset = json.asset || {};
      return {
        versaoGltf: asset.version || "—",
        gerador: asset.generator || "—",
        copyright: asset.copyright || "—",
        cenas: json.scenes?.length ?? 0,
        nos: json.nodes?.length ?? 0,
        animacoes: gltf.animations?.length ?? 0,
        materiaisJson: json.materials?.length ?? 0,
        texturasJson: json.textures?.length ?? 0,
        imagens: json.images?.length ?? 0,
        buffers: json.buffers?.length ?? 0,
        extensoes: (json.extensionsUsed || []).join(", ") || "—",
      };
    }

    function montarSecoes(arquivo, geo, extras = {}) {
      const secoes = [];
      const medidas = converterMedidas(geo, arquivo.formato);
      const origemLabel = medidas.origem === "m" ? "Metros (glTF)" : "Milímetros (STL/OBJ/PLY)";
      const exibicaoLabel = medidas.unidade === "m" ? "Metros" : "Centímetros";

      secoes.push({
        titulo: "Arquivo",
        itens: [
          ["Nome", arquivo.nome],
          ["Formato", arquivo.formato],
          ["Tamanho", arquivo.tamanho],
          ["Tipo MIME", arquivo.mime],
          ["Modificado", arquivo.modificado],
          ...(arquivo.ficheiros?.length
            ? [["Ficheiros", arquivo.ficheiros.join(", ")]]
            : []),
          ...(arquivo.pecas ? [["Peças importadas", String(arquivo.pecas)]] : []),
          ...(arquivo.tipoStl ? [["Tipo STL", arquivo.tipoStl]] : []),
          ...(arquivo.bibliotecaMtl ? [["Biblioteca MTL", arquivo.bibliotecaMtl]] : []),
        ],
      });

      secoes.push({
        titulo: "Geometria",
        itens: [
          ["Malhas", formatarNumero(geo.malhas, 0)],
          ["Geometrias", formatarNumero(geo.geometrias, 0)],
          ["Vértices", formatarNumero(geo.vertices, 0)],
          ["Triângulos", formatarNumero(geo.triangulos, 0)],
          ["Área de superfície", formatarArea(medidas.areaM2, medidas.unidade)],
          ["Volume da malha", formatarVolume(medidas.volumeM3, medidas.unidade)],
          ["Indexadas", formatarNumero(geo.indexadas, 0)],
          ["Não indexadas", formatarNumero(geo.naoIndexadas, 0)],
          ["Com normais", formatarNumero(geo.comNormais, 0)],
          ["Com UV", formatarNumero(geo.comUv, 0)],
          ["Com cores", formatarNumero(geo.comCores, 0)],
          ["Grupos", formatarNumero(geo.grupos, 0)],
        ],
      });

      secoes.push({
        titulo: "Dimensões",
        itens: [
          ["Unidade do arquivo", origemLabel],
          ["Exibição", exibicaoLabel],
          ["Largura (X)", formatarMedida(medidas.tamanhoM.x, medidas.unidade)],
          ["Altura (Y)", formatarMedida(medidas.tamanhoM.y, medidas.unidade)],
          ["Profundidade (Z)", formatarMedida(medidas.tamanhoM.z, medidas.unidade)],
          ["Diagonal", formatarMedida(medidas.diagonalM, medidas.unidade)],
          ["Centro X", formatarMedida(medidas.centroM.x, medidas.unidade)],
          ["Centro Y", formatarMedida(medidas.centroM.y, medidas.unidade)],
          ["Centro Z", formatarMedida(medidas.centroM.z, medidas.unidade)],
        ],
      });

      secoes.push({
        titulo: "Materiais",
        itens: [
          ["Materiais únicos", formatarNumero(geo.materiais, 0)],
          ["Texturas detectadas", formatarNumero(geo.texturas, 0)],
        ],
      });

      if (arquivo.objetos !== undefined) {
        secoes.push({
          titulo: "OBJ",
          itens: [
            ["Objetos", formatarNumero(arquivo.objetos, 0)],
            ["Grupos", formatarNumero(arquivo.gruposObj, 0)],
            ["Materiais referenciados", formatarNumero(arquivo.materiaisObj, 0)],
          ],
        });
      }

      if (arquivo.formato === "3MF") {
        const itens3mf = [
          ["Unidade padrão", "Milímetros"],
          ...(arquivo.titulo ? [["Título", arquivo.titulo]] : []),
          ...(arquivo.autor ? [["Designer", arquivo.autor]] : []),
          ...(arquivo.descricao ? [["Descrição", arquivo.descricao]] : []),
          ...(arquivo.objetos3mf !== undefined
            ? [["Objetos no arquivo", formatarNumero(arquivo.objetos3mf, 0)]]
            : []),
        ];
        if (itens3mf.length > 1) {
          secoes.push({ titulo: "3MF", itens: itens3mf });
        }
      }

      if (extras.gltf) {
        const gltfInfo = metadadosGltf(extras.gltf);
        secoes.push({
          titulo: "glTF / GLB",
          itens: [
            ["Versão glTF", gltfInfo.versaoGltf],
            ["Gerador", gltfInfo.gerador],
            ["Copyright", gltfInfo.copyright],
            ["Cenas", formatarNumero(gltfInfo.cenas, 0)],
            ["Nós", formatarNumero(gltfInfo.nos, 0)],
            ["Animações", formatarNumero(gltfInfo.animacoes, 0)],
            ["Materiais", formatarNumero(gltfInfo.materiaisJson, 0)],
            ["Texturas", formatarNumero(gltfInfo.texturasJson, 0)],
            ["Imagens", formatarNumero(gltfInfo.imagens, 0)],
            ["Buffers", formatarNumero(gltfInfo.buffers, 0)],
            ["Extensões", gltfInfo.extensoes],
          ],
        });
      }

      return secoes;
    }

    function renderizarPainel(secoes) {
      infoPanel.innerHTML = "";

      const tituloPainel = document.createElement("p");
      tituloPainel.className = "info-panel-title";
      tituloPainel.innerHTML = "<strong>Informações</strong>";
      infoPanel.appendChild(tituloPainel);

      secoes.forEach((secao) => {
        const bloco = document.createElement("div");
        bloco.className = "info-section";

        const cabecalho = document.createElement("button");
        cabecalho.type = "button";
        cabecalho.className = "info-section-header";
        cabecalho.setAttribute("aria-expanded", "false");
        cabecalho.innerHTML = `<span class="info-chevron">▸</span>${secao.titulo}`;

        const corpo = document.createElement("div");
        corpo.className = "info-section-body";

        secao.itens.forEach(([rotulo, valor]) => {
          const linha = document.createElement("div");
          linha.className = "info-row";
          linha.innerHTML = `<span>${rotulo}:</span> ${valor}`;
          corpo.appendChild(linha);
        });

        cabecalho.addEventListener("click", () => {
          const aberto = bloco.classList.toggle("expanded");
          cabecalho.setAttribute("aria-expanded", aberto ? "true" : "false");
        });

        bloco.appendChild(cabecalho);
        bloco.appendChild(corpo);
        infoPanel.appendChild(bloco);
      });
    }

    function limparPainel() {
      infoPanel.innerHTML = '<p class="info-vazio">Nenhum arquivo carregado</p>';
    }

    function materialPadrao(geometria = null) {
      const temCores = geometria?.attributes?.color;
      return new THREE.MeshStandardMaterial({
        color: temCores ? 0xffffff : COR_PADRAO,
        vertexColors: !!temCores,
        metalness: 0.1,
        roughness: 0.6,
      });
    }

    function clonarMaterial(material, geometria) {
      if (!material) return materialPadrao(geometria);

      const clone = material.clone();

      if (geometria?.attributes?.color) {
        clone.vertexColors = true;
      }

      for (const chave of ["map", "emissiveMap", "specularMap"]) {
        if (clone[chave]) clone[chave].colorSpace = THREE.SRGBColorSpace;
      }
      return clone;
    }

    function encontrarMeshPorUuid(uuid) {
      if (!currentModel || !uuid) return null;
      let found = null;
      currentModel.traverse((c) => {
        if (c.uuid === uuid) found = c;
      });
      return found;
    }

    function salvarEstadoVisual(object, { append = false } = {}) {
      if (!append) {
        materiaisOriginais.clear();
        meshComCorVertice.clear();
        limparEditorCores();
      }

      object.traverse((child) => {
        if (!child.isMesh) return;

        if (child.geometry?.attributes?.color) {
          meshComCorVertice.add(child.uuid);
        }

        const lista = child.material
          ? Array.isArray(child.material)
            ? child.material
            : [child.material]
          : [null];

        materiaisOriginais.set(
          child.uuid,
          lista.map((material) => clonarMaterial(material, child.geometry))
        );
      });

      registarCoresOriginais(object);
    }

    function aplicarVisual(object) {
      object.traverse((child) => {
        if (!child.isMesh) return;

        if (usarCores && materiaisOriginais.has(child.uuid)) {
          const originais = materiaisOriginais.get(child.uuid);
          const clonados = originais.map((material) => {
            const mat = material.clone();
            if (child.name?.startsWith("filament-")) {
              mat.flatShading = false;
              aplicarPolygonOffsetFilamento(mat, child.name);
            }
            if (meshComCorVertice.has(child.uuid)) mat.vertexColors = true;
            for (const chave of ["map", "emissiveMap", "specularMap"]) {
              if (mat[chave]) mat[chave].colorSpace = THREE.SRGBColorSpace;
            }
            aplicarOverrideMaterial(child, mat);
            return mat;
          });
          child.material = clonados.length === 1 ? clonados[0] : clonados;
          return;
        }

        const metaBambu = metaBambuDoObject(child);
        const matBambu = materialFilamentoBambu(child, metaBambu);
        if (matBambu) {
          aplicarOverrideMaterial(child, matBambu);
          child.material = matBambu;
          return;
        }

        child.material = materialPadrao(child.geometry);
      });
    }

    function atualizarFundosAtivos() {
      document.querySelectorAll(".fundo-btn").forEach((btn) => {
        btn.classList.toggle("ativo", parseInt(btn.dataset.index, 10) === bgIndex);
      });
    }

    function escapeHtmlTexto(t) {
      return String(t)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function nomeCurtoFicheiro(nome) {
      const base = nome.replace(/\.[^.]+$/, "");
      return base.length > 22 ? `${base.slice(0, 20)}…` : base;
    }

    function encontrarGrupoPainelItems(object3d) {
      if (!object3d) return null;
      for (const grupo of painelItems?.getGrupos() ?? []) {
        if (grupo.object3d === object3d) return grupo;
        if (grupo.pecas.some((peca) => peca.object3d === object3d)) return grupo;
        let dentro = false;
        grupo.object3d.traverse((child) => {
          if (child === object3d) dentro = true;
        });
        if (dentro) return grupo;
      }
      return null;
    }

    function resolverInnerPeca(object3d) {
      return object3d?.children?.[0]?.children?.[0] ?? object3d;
    }

    function deduplicarFilamentosPorHex(filamentos) {
      const mapa = new Map();
      for (const f of filamentos) {
        const hex = (f.hex || "").toUpperCase();
        const chave = `${f.slot || 0}:${hex}`;
        if (!mapa.has(chave)) {
          mapa.set(chave, { ...f, meshUuids: [f.meshUuid] });
        } else {
          mapa.get(chave).meshUuids.push(f.meshUuid);
        }
      }
      return [...mapa.values()];
    }

    function filamentosParaPainelCores(alvo, meta, { deduplicar = true } = {}) {
      const subItens = subItensPainelPeca(alvo, meta);
      let filamentos;

      if (subItens.length >= 2) {
        filamentos = [];
        for (const sub of subItens) {
          for (const f of listarFilamentosEditaveis(sub.object3d, meta)) {
            filamentos.push({
              meshUuid: f.meshUuid,
              nome: rotuloFilamentoEditor(f),
              hex: f.hex,
              slot: f.slot,
              customizada: f.customizada,
            });
          }
        }
      } else {
        filamentos = listarFilamentosEditaveis(alvo, meta).map((f) => ({
          meshUuid: f.meshUuid,
          nome: rotuloFilamentoEditor(f),
          hex: f.hex,
          slot: f.slot,
          customizada: f.customizada,
        }));
      }

      if (!deduplicar || filamentos.length <= 1) {
        return filamentos.map((f) => ({ ...f, meshUuids: [f.meshUuid] }));
      }
      return deduplicarFilamentosPorHex(filamentos);
    }

    function filamentosParaItemsPeca(alvo, meta) {
      const subItens = subItensPainelPeca(alvo, meta);
      if (subItens.length >= 2) {
        return subItens.map((f) => ({
          meshUuid: f.meshUuid,
          nome: f.nome,
          hex: f.hex,
          slot: f.slot,
        }));
      }
      return listarFilamentosEditaveis(alvo, meta).map((f) => ({
        meshUuid: f.meshUuid,
        nome: rotuloFilamentoEditor(f),
        hex: f.hex,
        slot: f.slot,
        customizada: f.customizada,
      }));
    }

    function montarEntradaCoresPeca(peca, { subPeca = null } = {}) {
      const alvo = subPeca?.object3d ?? resolverInnerPeca(peca.object3d);
      const meta = metaBambuDoObject(alvo);
      let filamentos;

      if (subPeca) {
        const editaveis = listarFilamentosEditaveis(subPeca.object3d, meta);
        filamentos = (editaveis.length ? editaveis : [{ meshUuid: subPeca.meshUuid, hex: subPeca.hex, slot: subPeca.slot ?? 0, nome: subPeca.nome }]).map(
          (f) => ({
            meshUuid: f.meshUuid,
            nome: rotuloFilamentoEditor(f),
            hex: f.hex,
            slot: f.slot,
            customizada: f.customizada,
            meshUuids: [f.meshUuid],
          })
        );
      } else {
        filamentos = filamentosParaPainelCores(alvo, meta);
      }

      return {
        id: peca.id,
        nome: subPeca ? `${peca.nome} · ${subPeca.nome}` : peca.nome,
        cores: extrairCoresDoObject(alvo, meta),
        filamentos,
      };
    }

    function coletarCoresSelecionados(object3ds) {
      const entradas = [];
      const vistos = new Set();

      for (const object3d of object3ds) {
        let resolvido = false;

        for (const grupo of painelItems?.getGrupos() ?? []) {
          if (grupo.object3d === object3d) {
            for (const peca of grupo.pecas) {
              if (vistos.has(peca.id)) continue;
              vistos.add(peca.id);
              entradas.push(montarEntradaCoresPeca(peca));
            }
            resolvido = true;
            break;
          }

          for (const peca of grupo.pecas) {
            if (peca.object3d === object3d) {
              if (!vistos.has(peca.id)) {
                vistos.add(peca.id);
                entradas.push(montarEntradaCoresPeca(peca));
              }
              resolvido = true;
              break;
            }

            for (const fil of peca.filamentos ?? []) {
              if (fil.object3d !== object3d) continue;
              const chave = `${peca.id}:${fil.id}`;
              if (!vistos.has(chave)) {
                vistos.add(chave);
                entradas.push(montarEntradaCoresPeca(peca, { subPeca: fil }));
              }
              resolvido = true;
              break;
            }
            if (resolvido) break;
          }
          if (resolvido) break;
        }
      }

      return entradas;
    }

    function coletarCoresDoGrupo(object3d) {
      if (!object3d) return [];
      const grupo = encontrarGrupoPainelItems(object3d);
      if (!grupo) return [];
      return grupo.pecas.map((peca) => montarEntradaCoresPeca(peca));
    }

    function coletarCoresPecas() {
      const entradas = [];
      for (const grupo of painelItems?.getGrupos() ?? []) {
        for (const peca of grupo.pecas) {
          const alvo = resolverInnerPeca(peca.object3d);
          const meta = metaBambuDoObject(alvo);
          entradas.push({
            id: peca.id,
            nome: peca.nome,
            cores: extrairCoresDoObject(alvo, meta),
            filamentos: filamentosParaItemsPeca(alvo, meta),
          });
        }
      }
      return entradas;
    }

    function rotuloFilamentoEditor(f) {
      if (f.nome === "Cor do modelo") return f.nome;
      if (f.nome && !/^Filamento \d+$/.test(f.nome)) {
        return f.slot ? `Fil. ${f.slot} · ${f.nome}` : f.nome;
      }
      return f.slot ? `Filamento ${f.slot}` : f.nome;
    }

    function renderFilamentoLinha(f) {
      const rotulo = rotuloFilamentoEditor(f);
      const meshUuids = f.meshUuids?.length ? f.meshUuids : [f.meshUuid];
      const meshUuid = meshUuids[0];
      return `
        <div class="cores-filamento-linha${f.customizada ? " is-customizada" : ""}" data-mesh-uuid="${meshUuid}" data-mesh-uuids="${meshUuids.join(",")}">
          <span class="cores-filamento-rotulo" title="${escapeHtmlTexto(f.hex)}">${escapeHtmlTexto(rotulo)}</span>
          <div class="cores-filamento-acoes">
            <span class="cor-modelo-swatch" data-hex="${f.hex}" data-mesh-uuid="${f.meshUuid}" style="background-color:${f.hex}" title="Clique para filtrar"></span>
            <button type="button" class="cores-filamento-btn cores-filamento-btn--picker" title="Alterar cor" aria-label="Alterar cor">
              <i class="fa-solid fa-palette" aria-hidden="true"></i>
            </button>
            <button type="button" class="cores-filamento-btn cores-filamento-btn--reset${f.customizada ? "" : " hidden"}" title="Restaurar cor original" aria-label="Restaurar cor original">
              <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
            </button>
          </div>
        </div>`;
    }

    function actualizarSwatchDom(meshUuid, hex) {
      document.querySelectorAll(`.cor-modelo-swatch[data-mesh-uuid="${meshUuid}"]`).forEach((sw) => {
        sw.style.backgroundColor = hex;
        sw.dataset.hex = hex;
      });
      const linha = document.querySelector(`.cores-filamento-linha[data-mesh-uuid="${meshUuid}"]`);
      linha?.classList.add("is-customizada");
      linha?.querySelector(".cores-filamento-btn--reset")?.classList.remove("hidden");
      linha?.querySelector(".cores-filamento-rotulo")?.setAttribute("title", hex);
    }

    function meshUuidsDaLinha(linha) {
      const lista = linha?.dataset.meshUuids;
      if (lista) return lista.split(",").filter(Boolean);
      const unico = linha?.dataset.meshUuid;
      return unico ? [unico] : [];
    }

    function alterarCorFilamento(meshUuid, hex, { refreshPainel = true, meshUuids = null } = {}) {
      const alvos = meshUuids?.length ? meshUuids : [meshUuid];
      let alterou = false;
      for (const uuid of alvos) {
        const mesh = encontrarMeshPorUuid(uuid);
        if (mesh && aplicarCorMesh(mesh, hex, materiaisOriginais)) alterou = true;
      }
      if (!alterou) return false;
      const hexNorm = normalizarHexCor(hex) || hex;
      for (const uuid of alvos) actualizarSwatchDom(uuid, hexNorm);
      if (refreshPainel) {
        ferramentas?.aplicarFiltroCor(null);
        atualizarCoresUi();
        setStatus(`Cor alterada: ${hexNorm}`);
      }
      return true;
    }

    function restaurarCorFilamento(meshUuid, { meshUuids = null } = {}) {
      const alvos = meshUuids?.length ? meshUuids : [meshUuid];
      let restaurou = false;
      for (const uuid of alvos) {
        const mesh = encontrarMeshPorUuid(uuid);
        if (mesh && restaurarCorMesh(mesh, materiaisOriginais)) restaurou = true;
      }
      if (!restaurou) return false;
      ferramentas?.aplicarFiltroCor(null);
      atualizarCoresUi();
      setStatus("Cor restaurada");
      return true;
    }

    function abrirPickerCor(linha, meshUuid) {
      const uuids = meshUuidsDaLinha(linha);
      const swatch = linha?.querySelector(".cor-modelo-swatch");
      const hexAtual = swatch?.dataset.hex || "#FFFFFF";
      const anchor = linha?.querySelector(".cores-filamento-btn--picker") || swatch;
      meshUuidPickerAberto = meshUuid;

      seletorCor.abrir({
        anchor,
        hexInicial: hexAtual,
        onChange: (hex) =>
          alterarCorFilamento(meshUuid, hex, { refreshPainel: false, meshUuids: uuids }),
        onClose: () => {
          const uuid = meshUuidPickerAberto;
          meshUuidPickerAberto = null;
          if (!uuid) return;

          ferramentas?.aplicarFiltroCor(null);
          painelItems?.atualizarCoresPecas(coletarCoresPecas());
          document.getElementById("cores-modelo-restaurar-todas")?.classList.toggle(
            "hidden",
            !temCustomizacoesCores()
          );
          atualizarBotaoExportar3mf(coletarCoresPecas());

          const hex = document.querySelector(`.cor-modelo-swatch[data-mesh-uuid="${uuid}"]`)?.dataset.hex;
          if (hex) setStatus(`Cor aplicada: ${hex}`);
        },
      });
    }

    function ligarEventosPainelCores(container) {
      container.querySelectorAll(".cores-filamento-linha").forEach((linha) => {
        const meshUuid = linha.dataset.meshUuid;
        if (!meshUuid) return;
        const swatch = linha.querySelector(".cor-modelo-swatch");
        const picker = linha.querySelector(".cores-filamento-btn--picker");
        const reset = linha.querySelector(".cores-filamento-btn--reset");

        swatch?.addEventListener("click", () => {
          ferramentas?.aplicarFiltroCor(swatch.dataset.hex);
        });

        picker?.addEventListener("click", (event) => {
          event.stopPropagation();
          abrirPickerCor(linha, meshUuid);
        });

        reset?.addEventListener("click", (event) => {
          event.stopPropagation();
          seletorCor.fechar();
          restaurarCorFilamento(meshUuid, { meshUuids: meshUuidsDaLinha(linha) });
        });
      });

      document.getElementById("cores-modelo-restaurar-todas")?.classList.toggle(
        "hidden",
        !temCustomizacoesCores()
      );
    }

    function renderizarPainelCores(entradas) {
      const wrap = document.getElementById("cores-modelo-wrap");
      const row = document.getElementById("cores-modelo");
      const contagem = document.getElementById("cores-modelo-contagem");
      const vazio = document.getElementById("cores-modelo-vazio");

      if (!entradas.length) {
        wrap.classList.add("hidden");
        row.innerHTML = "";
        contagem.textContent = "";
        vazio.classList.add("hidden");
        return;
      }

      wrap.classList.remove("hidden");

      const comCor = entradas.filter((e) => e.filamentos?.length || e.cores.length);
      if (!comCor.length) {
        row.innerHTML = "";
        contagem.textContent = "";
        vazio.textContent =
          entradas.length === 1
            ? "Este ficheiro não contém dados de cor (apenas geometria)."
            : `${entradas.length} ficheiros sem dados de cor nos arquivos.`;
        vazio.classList.remove("hidden");
        document.getElementById("cores-modelo-restaurar-todas")?.classList.add("hidden");
        return;
      }

      vazio.classList.add("hidden");
      row.innerHTML = comCor
        .map((entrada) => {
          const linhas = entrada.filamentos?.length
            ? entrada.filamentos.map(renderFilamentoLinha).join("")
            : entrada.cores
                .map(
                  (hex) => `
              <div class="cores-filamento-linha" data-mesh-uuid="">
                <span class="cores-filamento-rotulo">${escapeHtmlTexto(hex)}</span>
                <div class="cores-filamento-acoes">
                  <span class="cor-modelo-swatch" data-hex="${hex}" style="background-color:${hex}" title="Clique para filtrar"></span>
                </div>
              </div>`
                )
                .join("");
          return `
        <div class="cores-modelo-item">
          <span class="cores-modelo-item-nome" title="${escapeHtmlTexto(entrada.nome)}">${escapeHtmlTexto(nomeCurtoFicheiro(entrada.nome))}</span>
          <div class="cores-filamento-lista">${linhas}</div>
        </div>`;
        })
        .join("");

      ligarEventosPainelCores(row);

      const totalCores = comCor.reduce(
        (n, e) => n + (e.filamentos?.length || e.cores.length),
        0
      );
      contagem.textContent =
        comCor.length === 1
          ? `${totalCores} cor · clique filtrar · paleta para editar`
          : `${comCor.length} ficheiros · ${totalCores} cores · paleta para editar`;
    }

    function encontrarGrupoComArquivoFonte(node) {
      let atual = node;
      while (atual) {
        if (atual.userData?.arquivoFonte && extensao3mf(atual.userData.arquivoFonte.name)) {
          return atual;
        }
        if (atual.parent === currentModel) break;
        atual = atual.parent;
      }
      return null;
    }

    function resolverExportacao3mfCores() {
      const arquivos3mf = (ultimoArquivosImportados || []).filter((f) => extensao3mf(f.name));

      let objectAlvo = currentModel;
      let arquivo = null;

      if (itensSelecionados3d.length === 1) {
        objectAlvo = encontrarGrupoComArquivoFonte(itensSelecionados3d[0]) ?? itensSelecionados3d[0];
        arquivo = objectAlvo?.userData?.arquivoFonte ?? null;
      } else if (arquivos3mf.length === 1) {
        arquivo = arquivos3mf[0];
      } else if (arquivos3mf.length > 1) {
        return {
          erro: "Vários 3MF na cena — selecione um grupo em Items para exportar o ficheiro certo.",
        };
      }

      if (!arquivo && ultimoArquivoFile && extensao3mf(ultimoArquivoFile.name)) {
        arquivo = ultimoArquivoFile;
      }

      if (!arquivo) {
        return { erro: "Carregue um ficheiro 3MF Bambu/Orca para exportar as cores." };
      }

      const meta =
        objectAlvo?.userData?.bambuExtras ??
        objectAlvo?.userData?.extras?.bambu ??
        ultimoExtras?.bambu ??
        null;
      const cores = coletarCoresParaExportacao(objectAlvo, meta);

      if (!Object.keys(cores).length) {
        return { erro: "Este modelo não tem filamentos AMS editáveis para exportar." };
      }

      return { arquivo, objectAlvo, cores };
    }

    function atualizarBotaoExportar3mf(entradas) {
      const btn = document.getElementById("cores-modelo-exportar-3mf");
      if (!btn) return;

      const temFilamentos = entradas.some((e) => e.filamentos?.length);
      const tem3mf = (ultimoArquivosImportados || []).some((f) => extensao3mf(f.name));
      const destino = resolverExportacao3mfCores();
      const visivel = temFilamentos && tem3mf;

      btn.classList.toggle("hidden", !visivel);
      btn.disabled = Boolean(destino.erro);
      btn.title = destino.erro || "Guardar 3MF com as cores de filamento atuais";
    }

    async function exportar3mfCoresAtuais() {
      const destino = resolverExportacao3mfCores();
      if (destino.erro) {
        setStatus(destino.erro, true);
        return;
      }

      const btn = document.getElementById("cores-modelo-exportar-3mf");
      if (btn) btn.disabled = true;

      try {
        setStatus("A preparar 3MF com cores…");
        const buffer = await destino.arquivo.arrayBuffer();
        exportar3mfComCores(buffer, destino.cores, destino.arquivo.name);
        setStatus(`3MF exportado: ${destino.arquivo.name.replace(/\.[^.]+$/, "")}-cores.3mf`);
      } catch (err) {
        setStatus(`Exportar 3MF: ${err.message}`, true);
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    function atualizarCoresUi() {
      if (!painelItems?.temItems()) {
        limparCoresModelo();
        return;
      }
      const todasEntradas = coletarCoresPecas();
      painelItems.atualizarCoresPecas(todasEntradas);

      if (temVariosModelosNaCena() && !itensSelecionados3d.length) {
        limparCoresModelo();
        return;
      }

      let entradasPainel;
      if (itensSelecionados3d.length) {
        entradasPainel = coletarCoresSelecionados(itensSelecionados3d);
      } else {
        entradasPainel = todasEntradas.map((entrada) => {
          const peca = painelItems
            ?.getGrupos()
            ?.flatMap((g) => g.pecas)
            .find((p) => p.id === entrada.id);
          if (!peca) return entrada;
          return montarEntradaCoresPeca(peca);
        });
      }
      renderizarPainelCores(entradasPainel);
      atualizarBotaoExportar3mf(entradasPainel);
    }

    function limparCoresModelo() {
      document.getElementById("cores-modelo-wrap").classList.add("hidden");
      document.getElementById("cores-modelo").innerHTML = "";
      document.getElementById("cores-modelo-contagem").textContent = "";
      document.getElementById("cores-modelo-vazio").classList.add("hidden");
      document.getElementById("cores-modelo-restaurar-todas")?.classList.add("hidden");
      document.getElementById("cores-modelo-exportar-3mf")?.classList.add("hidden");
    }

    function apresentarImportacao({ importGroups, arquivoMeta, extras = {}, append = false }) {
      if (!append) {
        if (currentModel) {
          modelPivot.remove(currentModel);
          currentModel.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
              else child.material.dispose();
            }
          });
          currentModel = null;
          materiaisOriginais.clear();
          meshComCorVertice.clear();
          limparCoresModelo();
          secaoFilamentosCache = null;
          secaoExtensoesCache = null;
        }
        painelItems?.resetEstado();
      }

      ensureItemsRoot();

      for (const grupo of importGroups) {
        const metaGrupo = grupo.arquivoMeta ?? arquivoMeta;
        grupo.object3d.userData.arquivoMeta = metaGrupo;
        grupo.object3d.userData.extras = grupo.extras ?? extras;
        grupo.object3d.userData.formato = grupo.formato ?? ultimoFormato;
        if (grupo.arquivo) grupo.object3d.userData.arquivoFonte = grupo.arquivo;
        currentModel.add(grupo.object3d);
        painelItems?.adicionarGrupo({
          nome: grupo.nome,
          object3d: grupo.object3d,
          pecas: grupo.pecas,
        });
      }

      ultimoExtras = append
        ? { ...ultimoExtras, ...extras, bambu: ultimoExtras?.bambu ?? extras.bambu }
        : extras;
      if (append && ultimoArquivoMeta && arquivoMeta) {
        const ficheirosNovos = arquivoMeta.ficheiros || [arquivoMeta.nome];
        ultimoArquivoMeta = {
          ...ultimoArquivoMeta,
          ficheiros: [...(ultimoArquivoMeta.ficheiros || [ultimoArquivoMeta.nome]), ...ficheirosNovos],
          pecas: (ultimoArquivoMeta.pecas || 0) + (arquivoMeta.pecas || importGroups.reduce((n, g) => n + g.pecas.length, 0)),
          tamanhoBytes: (ultimoArquivoMeta.tamanhoBytes || 0) + (arquivoMeta.tamanhoBytes || 0),
          tamanho: formatarTamanho((ultimoArquivoMeta.tamanhoBytes || 0) + (arquivoMeta.tamanhoBytes || 0)),
        };
      } else if (!append) {
        ultimoArquivoMeta = arquivoMeta;
      }
      ultimoFormato = (arquivoMeta.formato || "STL").split(" + ")[0];

      const geo = analisarGeometria(currentModel);
      if (append) {
        for (const grupo of importGroups) {
          salvarEstadoVisual(grupo.object3d, { append: true });
        }
      } else {
        salvarEstadoVisual(currentModel, { append: false });
      }
      aplicarVisual(currentModel);

      enquadrarCena(currentModel, { resetView: !append });
      if (ferramentas?.getEstado?.().grade) {
        assentarModelosNaGrade();
      }

      const caixa = new THREE.Box3().setFromObject(currentModel);
      geo.tamanho = caixa.getSize(new THREE.Vector3());
      geo.centro = caixa.getCenter(new THREE.Vector3());
      geo.diagonal = geo.tamanho.length();

      secaoFilamentosCache = ferramentas?.onModelLoaded(currentModel, ultimoExtras, geo, ultimoFormato);
      secaoExtensoesCache = extensoes?.onModelLoaded(currentModel, {
        ...ultimoExtras,
        bambuImpressao: ultimoExtras?.bambu?.bambuImpressao,
        formato: ultimoFormato,
      });

      placeholder.classList.add("hidden");
      atualizarCoresUi();
      painelItems?.limparSelecao?.();
      ferramentas?.sincronizarCameras();
      const medidasConv = converterMedidas(geo, ultimoFormato);
      const tamanhoSugerido = formatarMedida(medidasConv.maiorDim, medidasConv.unidade);
      publicarProduto?.preencherSugestoes(arquivoMeta, ultimoArquivoFile, { tamanhoSugerido });
      setPainelPosModelo(true);
      const totalGrupos = painelItems?.getGrupos?.().length ?? importGroups.length;
      setStatus(
        append
          ? `Adicionado · ${totalGrupos} grupo(s) na cena`
          : importGroups.length > 1 || (importGroups[0]?.pecas?.length ?? 0) > 1
            ? `Carregados ${importGroups.reduce((n, g) => n + g.pecas.length, 0)} modelos`
            : `Modelo carregado: ${arquivoMeta.nome}`
      );
    }

    function montarPecasPorBandejas(buffer, extras) {
      const bandejas = detectarBandejas3mfBuffer(buffer);
      if (bandejas.length <= 1) return null;

      const raiz = new THREE.Group();
      const pecas = [];
      let offsetX = 0;
      const gap = 24;
      let metaBambu = null;

      for (const bandeja of bandejas) {
        const resultado = carregar3mf(buffer, {
          bandeja: bandeja.numero,
          layout: "montado",
        });
        metaBambu = metaBambu ?? resultado.meta;

        const wrapped = criarContainerModelo(resultado.object, "3mf");
        wrapped.name = `Bandeja ${bandeja.numero}`;
        wrapped.userData.bandeja = bandeja.numero;
        if (resultado.meta) wrapped.userData.bambuExtras = resultado.meta;

        wrapped.position.x = offsetX;
        wrapped.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(wrapped);
        const size = box.getSize(new THREE.Vector3());
        offsetX += size.x + gap;

        raiz.add(wrapped);

        const inner = resultado.object;
        const subItens = subItensPainelPeca(inner, resultado.meta);
        pecas.push({
          nome: `Bandeja ${bandeja.numero} (${bandeja.pecas.length} peças)`,
          object3d: wrapped,
          cores: extrairCoresDoObject(inner, resultado.meta),
          filamentos: subItens,
          bandeja: bandeja.numero,
        });
      }

      raiz.name = "Bandejas";
      return { object: raiz, pecas, bandejas, meta: metaBambu };
    }

    function montarPecasImportacao(object, nomeFicheiro, extras = {}) {
      const inner = object.children[0]?.children?.[0] ?? object;
      const meta = extras.bambu ?? null;
      const separadas = detectarPecasSeparaveis(inner, meta);
      if (separadas?.length >= 2) {
        return separadas.map((peca) => ({
          nome: peca.nome,
          object3d: peca.object3d,
          cores: peca.cores ?? [],
          filamentos: filamentosSubPeca(peca.object3d, meta),
        }));
      }
      return [
        {
          nome: nomeFicheiro,
          object3d: object,
          cores: extras.coresArquivo ?? [],
          filamentos: filamentosSubPeca(inner, meta),
        },
      ];
    }

    function showModel(object, arquivoMeta, extras = {}, { append = false, nomeFicheiro = null, arquivo = null, pecas = null } = {}) {
      const nome = nomeFicheiro || arquivoMeta?.nome || "Modelo";
      const nomeExibicao = nomeBaseArquivo({ name: nome });
      const importGroup = new THREE.Group();
      importGroup.name = nomeExibicao;
      object.name = nomeExibicao;
      importGroup.add(object);
      if (extras.bambu) object.userData.bambuExtras = extras.bambu;
      if (Array.isArray(extras.coresArquivo)) object.userData.coresArquivo = extras.coresArquivo;

      const pecasPainel =
        pecas ??
        extras.pecasImportacao ??
        montarPecasImportacao(object, nome, extras);

        apresentarImportacao({
        importGroups: [
          {
            nome: nomeExibicao,
            object3d: importGroup,
            pecas: pecasPainel,
            arquivoMeta,
            extras,
            formato: (arquivoMeta?.formato || "STL").split(" + ")[0],
            arquivo: arquivo ?? ultimoArquivoFile,
          },
        ],
        arquivoMeta,
        extras,
        append,
      });
    }

    async function carregarObjetoBruto(file, arquivosRelacionados = []) {
      const ext = file.name.split(".").pop().toLowerCase();
      const estendido = await extensoes?.carregarEstendido(file, arquivosRelacionados, { gltfLoader });
      if (estendido) return estendido;

      const url = ext === "fbx" ? null : URL.createObjectURL(file);
      try {
        let object;
        let extras = {};

        if (ext === "stl") {
          const geom = await new STLLoader().loadAsync(url);
          object = new THREE.Mesh(geom, materialPadrao(geom));
        } else if (ext === "obj") {
          object = await new OBJLoader().loadAsync(url);
        } else if (ext === "ply") {
          const geom = await new PLYLoader().loadAsync(url);
          object = new THREE.Mesh(geom, materialPadrao(geom));
        } else if (ext === "off") {
          const geom = await new OFFLoader().loadAsync(url);
          object = new THREE.Mesh(geom, materialPadrao(geom));
        } else if (ext === "glb" || ext === "gltf") {
          const gltf = await gltfLoader.loadAsync(url);
          object = gltf.scene;
          extras.gltf = gltf;
        } else if (ext === "fbx") {
          const resultadoFbx = await carregarFbx(arquivosRelacionados.length ? arquivosRelacionados : [file]);
          object = resultadoFbx.object;
          extras.fbxUrls = resultadoFbx.urls;
          if (object.animations?.length) {
            extras.animacoes = { clips: object.animations, alvo: object };
          }
        } else if (ext === "3mf" || ext === "mf3") {
          const buffer = await file.arrayBuffer();
          extras.coresArquivo = extrairCoresDo3mfBuffer(buffer);

          const multiBandeja = montarPecasPorBandejas(buffer, extras);
          if (multiBandeja) {
            object = multiBandeja.object;
            extras.bambu = multiBandeja.meta;
            extras.bandejas = multiBandeja.bandejas;
            extras.pecasImportacao = multiBandeja.pecas;
            extras.multiBandeja = true;
            return { object, extras };
          }

          const resultado = carregar3mf(buffer);
          object = resultado.object;
          extras.bambu = resultado.meta;
        } else {
          throw new Error(`Formato .${ext} não suportado.`);
        }
        return { object, extras };
      } finally {
        if (url) URL.revokeObjectURL(url);
      }
    }

    const EXTENSOES_LOTE = new Set(["stl", "obj", "ply", "off", "glb", "gltf", "3mf", "mf3"]);

    function extensaoArquivo(nome) {
      return nome.split(".").pop().toLowerCase();
    }

    function isLoteSuportado(arquivos) {
      if (arquivos.length < 2) return false;
      return arquivos.every((f) => EXTENSOES_LOTE.has(extensaoArquivo(f.name)));
    }

    async function carregarFicheiroComoPeca(arquivo, arquivosRelacionados) {
      const ext = extensaoArquivo(arquivo.name);
      const { object, extras } = await carregarObjetoBruto(arquivo, arquivosRelacionados);
      const wrapped = criarContainerModelo(object, ext);
      wrapped.name = nomeBaseArquivo(arquivo);
      if (extras.bambu) wrapped.userData.bambuExtras = extras.bambu;
      if (Array.isArray(extras.coresArquivo)) wrapped.userData.coresArquivo = extras.coresArquivo;
      return { wrapped, extras, ext, arquivo };
    }

    async function loadVariosArquivos(arquivos, { append } = {}) {
      const acumular = resolverModoAppend(append);
      ferramentas?.setLoading(true, `Carregando ${arquivos.length} ficheiros…`);
      setStatus(`Carregando ${arquivos.length} ficheiros…`);

      try {
        revogarUrlsFbx(fbxUrlsAtivas);

        const carregados = await Promise.all(
          arquivos.map((arquivo) => carregarFicheiroComoPeca(arquivo, arquivos))
        );

        const importGroups = await Promise.all(
          carregados.map(async (item) => {
            const nomeExibicao = nomeBaseArquivo(item.arquivo);
            const meta = await lerMetadadosArquivo(item.arquivo, item.ext);
            const grupo = new THREE.Group();
            grupo.name = nomeExibicao;
            grupo.add(item.wrapped);
            return {
              nome: nomeExibicao,
              object3d: grupo,
              pecas: montarPecasImportacao(item.wrapped, item.arquivo.name, item.extras),
              arquivoMeta: meta,
              extras: item.extras,
              formato: item.ext.toUpperCase(),
              arquivo: item.arquivo,
            };
          })
        );

        const mergedExtras = { multiArquivos: true };
        for (const item of carregados) {
          if (item.extras.gltf) mergedExtras.gltf = item.extras.gltf;
          if (item.extras.fbxUrls) {
            fbxUrlsAtivas = item.extras.fbxUrls;
            mergedExtras.fbxUrls = item.extras.fbxUrls;
          }
        }

        if (acumular) {
          ultimoArquivosImportados = [...(ultimoArquivosImportados || []), ...arquivos];
        } else {
          ultimoArquivoFile = arquivos[0];
          ultimoArquivosImportados = arquivos;
        }

        const arquivoMeta = await lerMetadadosVariosArquivos(arquivos);

        apresentarImportacao({
          importGroups,
          arquivoMeta,
          extras: mergedExtras,
          append: acumular,
        });
      } catch (err) {
        setStatus(`Erro: ${err.message}`, true);
      } finally {
        ferramentas?.setLoading(false);
      }
    }

    async function loadVariosStl(arquivos) {
      return loadVariosArquivos(arquivos);
    }

    async function loadFile(file, arquivosRelacionados = [], { append } = {}) {
      const acumular = resolverModoAppend(append);
      const ext = file.name.split(".").pop().toLowerCase();
      ferramentas?.setLoading(true, `Carregando ${file.name}...`);
      setStatus(`Carregando ${file.name}...`);

      try {
        const arquivoMeta = await lerMetadadosArquivo(file, ext);
        if (!acumular) {
          ultimoArquivoFile = file;
          ultimoArquivosImportados = [file];
        } else {
          ultimoArquivosImportados = [...(ultimoArquivosImportados || []), file];
          ultimoArquivoFile = file;
        }
        revogarUrlsFbx(fbxUrlsAtivas);

        const { object, extras } = await carregarObjetoBruto(file, arquivosRelacionados);
        if (extras.fbxUrls) fbxUrlsAtivas = extras.fbxUrls;

        const modeloExibir = extras.multiBandeja ? object : criarContainerModelo(object, ext);

        showModel(modeloExibir, arquivoMeta, extras, {
          append: acumular,
          nomeFicheiro: file.name,
          arquivo: file,
        });

        if (extras.bandejas?.length > 1) {
          setStatus(
            `${nomeBaseArquivo(file)} — ${extras.bandejas.length} bandejas carregadas separadamente`
          );
        }
      } catch (err) {
        setStatus(`Erro: ${err.message}`, true);
      } finally {
        ferramentas?.setLoading(false);
      }
    }

    function initPainelExpanders() {
      document.querySelectorAll(".acoes .info-section .info-section-header").forEach((cabecalho) => {
        cabecalho.addEventListener("click", () => {
          const bloco = cabecalho.closest(".info-section");
          const aberto = bloco.classList.toggle("expanded");
          cabecalho.setAttribute("aria-expanded", aberto ? "true" : "false");
        });
      });
    }
    initPainelExpanders();
    montarControlesViewport(document.querySelector(".viewer"));

    function temModelosNaCena() {
      return Boolean(painelItems?.temItems?.());
    }

    /** Por defeito acumula na cena; só substitui se append === false explicitamente. */
    function resolverModoAppend(append) {
      if (append === false) return false;
      if (append === true) return true;
      return temModelosNaCena();
    }

    function processarFicheirosSelecionados(arquivos, { append } = {}) {
      const acumular = resolverModoAppend(append);
      const fbx = arquivos.find((f) => f.name.toLowerCase().endsWith(".fbx"));
      if (fbx) {
        loadFile(fbx, arquivos, { append: acumular });
        return;
      }

      const zip = arquivos.find((f) => f.name.toLowerCase().endsWith(".zip"));
      if (zip) {
        loadFile(zip, arquivos, { append: acumular });
        return;
      }

      if (isLoteSuportado(arquivos)) {
        loadVariosArquivos(arquivos, { append: acumular });
        return;
      }

      loadFile(arquivos[0], arquivos, { append: acumular });
    }

    painelItems = initPainelItems({
      setStatus,
      temModelosNaCena,
      onFicheirosSelecionados: processarFicheirosSelecionados,
      onItemsAlterados: () => sincronizarAposItemsAlterados(),
      onVisibilidadeAlterada: () => {
        if (currentModel) aplicarVisual(currentModel);
      },
      onCorClicada: (hex) => {
        ferramentas?.aplicarFiltroCor(hex);
        setStatus(`Cor selecionada: ${hex}`);
      },
      onSelecaoAlterada: (object3ds) => {
        if (!object3ds?.length) {
          definirItensSelecionados([]);
          return;
        }
        definirItensSelecionados(object3ds);
      },
    });
    painelItems.bindUi();

    document.getElementById("cores-modelo-restaurar-todas")?.addEventListener("click", () => {
      const n = restaurarTodasCores(currentModel, materiaisOriginais);
      ferramentas?.aplicarFiltroCor(null);
      atualizarCoresUi();
      setStatus(n ? `${n} cor(es) restaurada(s)` : "Nenhuma cor personalizada");
    });

    document.getElementById("cores-modelo-exportar-3mf")?.addEventListener("click", () => {
      exportar3mfCoresAtuais();
    });

    function initImportacaoPorArrastar() {
      const viewer = document.querySelector(".viewer");
      const marcarArrasto = (ativo) => viewer?.classList.toggle("viewer-drag-over", ativo);

      const evitarDefault = (event) => {
        event.preventDefault();
        event.stopPropagation();
      };

      viewer?.addEventListener("dragenter", (event) => {
        evitarDefault(event);
        marcarArrasto(true);
      });
      viewer?.addEventListener("dragover", evitarDefault);
      viewer?.addEventListener("dragleave", (event) => {
        if (!viewer.contains(event.relatedTarget)) marcarArrasto(false);
      });
      viewer?.addEventListener("drop", (event) => {
        evitarDefault(event);
        marcarArrasto(false);
        const ficheiros = Array.from(event.dataTransfer?.files || []);
        if (!ficheiros.length) return;
        processarFicheirosSelecionados(ficheiros);
      });

      placeholder?.addEventListener("click", () => {
        painelItems?.abrirSeletorFicheiros?.();
      });
      placeholder?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          placeholder.click();
        }
      });
    }
    initImportacaoPorArrastar();

    function atualizarSecaoFilamentos() {
      if (!currentModel || !ultimoArquivoMeta || !ferramentas) return;
      const geo = analisarGeometria(currentModel);
      const caixa = new THREE.Box3().setFromObject(currentModel);
      geo.tamanho = caixa.getSize(new THREE.Vector3());
      secaoFilamentosCache = ferramentas.getSecaoFilamentos();
      atualizarPainelInfo();
    }

    document.getElementById("chk-cores")?.addEventListener("change", (e) => {
      usarCores = e.target.checked;
      if (currentModel) aplicarVisual(currentModel);
      ferramentas?.salvarPreferencias({ cores: e.target.checked });
      setStatus(usarCores ? "Cores originais ativadas" : "Cores originais desativadas");
    });

    document.getElementById("fundos")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".fundo-btn");
      if (!btn) return;
      bgIndex = parseInt(btn.dataset.index, 10);
      scene.background = new THREE.Color(backgrounds[bgIndex]);
      atualizarFundosAtivos();
      ferramentas?.salvarPreferencias({ bgIndex });
      setStatus("Cor de fundo alterada");
    });

    ferramentas = initFerramentas({
      scene,
      camera,
      renderer,
      modelPivot,
      container,
      canvas,
      getCurrentModel: () => currentModel,
      getItensSelecionados3d: () => itensSelecionados3d,
      getGruposItems: () => painelItems?.getGrupos?.() ?? [],
      temVariosModelosNaCena,
      assentarModelosNaGrade,
      getCameraDistance: () => cameraDistance,
      setCameraDistance: (v) => {
        cameraDistance = v;
      },
      getCentroVisao: () => {
        getCentroModelo();
        return centroVisao.clone();
      },
      getRotacaoQuat: () => rotacaoQuat,
      aplicarRotacao,
      resetarRotacao,
      getOrbitTheta: () => orbit.theta,
      getVelocidadeRotacao: velocidadeOrbita,
      setOrbitTheta: (v) => {
        orbit.theta = v;
        updateCamera();
      },
      setOrbitAngles,
      addOrbitTheta,
      resetOrbitFrontal,
      updateCamera,
      centerAndFrame,
      setPanOffset,
      setStatus,
      loadFile,
      aplicarVisual,
      converterMedidas,
      formatarVolume,
      unidadeParaCena,
      cenaParaMetros,
      formatarDistancia,
      analisarGeometria,
      getFormato: () => ultimoFormato,
      getBgIndex: () => bgIndex,
      setBackgroundColor: (hex) => {
        scene.background = new THREE.Color(hex);
      },
      aplicarPreferenciaCores: (valor) => {
        usarCores = valor;
        if (currentModel) aplicarVisual(currentModel);
      },
      aplicarPreferenciaFundo: (indice) => {
        bgIndex = indice;
        scene.background = new THREE.Color(backgrounds[bgIndex]);
        atualizarFundosAtivos();
      },
      atualizarSecaoFilamentos,
    });

    extensoes = initExtensoes({
      scene,
      camera,
      renderer,
      modelPivot,
      container,
      getCurrentModel: () => currentModel,
      getFormato: () => ultimoFormato,
      getModelExtras: () => ultimoExtras,
      getModelFile: () => ultimoArquivoFile,
      getModelFiles: () => ultimoArquivosImportados,
      unidadeOrigemArquivo,
      mmParaCena,
      centerAndFrame,
      setStatus,
      aplicarVisual,
      aplicarPreferenciaFundo: (indice) => {
        bgIndex = indice;
        scene.background = new THREE.Color(backgrounds[bgIndex]);
        atualizarFundosAtivos();
      },
      carregarObjetoBruto,
      criarContainerModelo,
      getFerramentas: () => ferramentas,
      getOrbitControl: () => ({
        getTheta: () => orbit.theta,
        setTheta: (v) => {
          orbit.theta = v;
          updateCamera();
        },
        updateCamera,
      }),
      refreshModelVisual: (model) => {
        salvarEstadoVisual(model, { append: true });
        aplicarVisual(model);
        atualizarCoresUi();
      },
      atualizarCoresModelo: () => atualizarCoresUi(),
    });

    ferramentas.setLights(hemiLight, dirLight);
    ferramentas.bindUi();
    extensoes.bindUi();

    publicarProduto = initPublicarProduto({
      renderer,
      scene,
      getCamera: () => ferramentas?.cameraAtiva?.() ?? camera,
      prepararCaptura: () => ferramentas?.prepararCaptura?.(),
      isCenarioAtivo: () => ferramentas?.isCenarioAtivo?.() ?? false,
      getModelFile: () => ultimoArquivoFile,
      getModelFiles: () => ultimoArquivosImportados,
      hasModel: () => Boolean(currentModel && ultimoArquivoFile),
      setStatus,
    });

    const params = new URLSearchParams(location.search);
    if (params.get("produto")) {
      initGd3dProduto({
        loadFile,
        setStatus,
        getCurrentModel: () => currentModel,
        modelPivot,
      });
    }
})();
