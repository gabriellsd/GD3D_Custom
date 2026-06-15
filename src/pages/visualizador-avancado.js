import { initGd3dProduto } from "../viewer/advanced/gd3d-produto.js";
import { logout } from "../auth/client.js";
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

    const container = document.getElementById("canvas-container");
    const placeholder = document.getElementById("placeholder");
    const statusEl = document.getElementById("status");
    const infoPanel = document.getElementById("info-panel");

    const backgrounds = [0x1e1e2e, 0x11111b, 0xffffff, 0x2d2d2d];
    let bgIndex = 0;
    let wireframe = false;
    let usarCores = true;
    let currentModel = null;
    const materiaisOriginais = new Map();
    const meshComCorVertice = new Set();
    const COR_PADRAO = 0x89b4fa;
    let cameraDistance = 5;

    const ZOOM_FACTOR = 1.08;
    const panOffset = new THREE.Vector3();
    const centroVisao = new THREE.Vector3();
    const eixoCameraDireita = new THREE.Vector3();
    const eixoCameraCima = new THREE.Vector3();
    const rotacaoQuat = new THREE.Quaternion();
    const deltaRotacao = new THREE.Quaternion();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgrounds[bgIndex]);

    const modelPivot = new THREE.Group();
    scene.add(modelPivot);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 100000);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x3a3a4a, 1.1);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(4, 6, 5);
    scene.add(dirLight);
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const drag = {
      active: false,
      panning: false,
      lastX: 0,
      lastY: 0,
    };

    const canvas = renderer.domElement;

    function getCentroModelo() {
      if (!currentModel) return centroVisao.set(0, 0, 0);
      new THREE.Box3().setFromObject(modelPivot).getCenter(centroVisao);
      return centroVisao;
    }

    function updateCamera() {
      getCentroModelo();
      const alvoX = centroVisao.x + panOffset.x;
      const alvoY = centroVisao.y + panOffset.y;
      const alvoZ = centroVisao.z + panOffset.z;
      camera.position.set(alvoX, alvoY + cameraDistance * 0.18, alvoZ + cameraDistance);
      camera.lookAt(alvoX, alvoY, alvoZ);
    }

    updateCamera();

    function velocidadeRotacao() {
      const largura = container.clientWidth || 800;
      return (Math.PI * 2) / largura;
    }

    function aplicarRotacao() {
      modelPivot.quaternion.copy(rotacaoQuat);
    }

    function resetarRotacao() {
      rotacaoQuat.identity();
      aplicarRotacao();
    }

    function rotarModelo(dx, dy) {
      const velocidade = velocidadeRotacao();
      camera.updateMatrixWorld();

      eixoCameraCima.setFromMatrixColumn(camera.matrix, 1).normalize();
      eixoCameraDireita.setFromMatrixColumn(camera.matrix, 0).normalize();

      deltaRotacao.setFromAxisAngle(eixoCameraCima, -dx * velocidade);
      rotacaoQuat.premultiply(deltaRotacao);

      deltaRotacao.setFromAxisAngle(eixoCameraDireita, -dy * velocidade);
      rotacaoQuat.premultiply(deltaRotacao);

      aplicarRotacao();
    }

    function criarContainerModelo(object, ext) {
      const orientacao = new THREE.Group();
      if (ext === "stl" || ext === "ply" || ext === "gcode" || ext === "gco" || ext === "g") {
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
    let ultimoFormato = "STL";
    let secaoFilamentosCache = null;
    let secaoExtensoesCache = null;
    let fbxUrlsAtivas = [];
    const gltfLoader = new GLTFLoader();

    canvas.addEventListener("pointerdown", (event) => {
      if (ferramentas?.onPointerDown(event)) return;

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
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointerup", (event) => {
      drag.active = false;
      drag.panning = false;
      ferramentas?.onPointerUp();
      canvas.releasePointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!drag.active) return;

      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;

      if (drag.panning) {
        camera.updateMatrixWorld();
        eixoCameraDireita.setFromMatrixColumn(camera.matrix, 0);
        eixoCameraCima.setFromMatrixColumn(camera.matrix, 1);
        const factor = cameraDistance * 0.0015;
        panOffset.addScaledVector(eixoCameraDireita, -dx * factor);
        panOffset.addScaledVector(eixoCameraCima, dy * factor);
        updateCamera();
        return;
      }

      rotarModelo(dx, dy);
      ferramentas?.onPointerMoveDrag(dx);
    });

    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const factor = event.deltaY > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
        cameraDistance = THREE.MathUtils.clamp(cameraDistance * factor, 0.05, 50000);
        updateCamera();
      },
      { passive: false }
    );

    function resize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      ferramentas?.sincronizarCameras();
    }
    window.addEventListener("resize", resize);
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
        ferramentas?.onModelCleared();
        extensoes?.onModelCleared();
        secaoFilamentosCache = null;
        secaoExtensoesCache = null;
        revogarUrlsFbx(fbxUrlsAtivas);
        fbxUrlsAtivas = [];
      }
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

    function formatarDistancia(metros) {
      const medidas = escolherUnidadeExibicao(metros);
      return formatarMedida(metros, medidas);
    }

    let ultimoArquivoMeta = null;
    let ultimoExtras = {};

    function montarSecoesUltimo(geo) {
      const secoes = montarSecoes(ultimoArquivoMeta, geo, ultimoExtras);
      if (secaoFilamentosCache) secoes.push(secaoFilamentosCache);
      if (secaoExtensoesCache?.length) secoes.push(...secaoExtensoesCache);
      return secoes;
    }

    function centerAndFrame(object) {
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      object.position.sub(center);

      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      cameraDistance = maxDim * 2.5;
      panOffset.set(0, 0, 0);
      resetarRotacao();
      updateCamera();
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
        return `${formatarNumero(areaMetrosQuadrados, 4)} mÂ²`;
      }
      return `${formatarNumero(areaMetrosQuadrados * 10000, 2)} cmÂ²`;
    }

    function formatarVolume(volumeMetrosCubicos, unidade) {
      if (unidade === "m") {
        return `${formatarNumero(volumeMetrosCubicos, 6)} mÂ³`;
      }
      return `${formatarNumero(volumeMetrosCubicos * 1000000, 2)} cmÂ³`;
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
        return amostra.includes("facet normal") ? "ASCII" : "BinÃ¡rio";
      }
      return "BinÃ¡rio";
    }

    async function lerMetadadosArquivo(arquivo, extensao) {
      const metadados = {
        nome: arquivo.name,
        formato: extensao.toUpperCase(),
        tamanho: formatarTamanho(arquivo.size),
        tamanhoBytes: arquivo.size,
        mime: arquivo.type || "â€”",
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

    function metadadosGltf(gltf) {
      const json = gltf.parser?.json;
      if (!json) return {};

      const asset = json.asset || {};
      return {
        versaoGltf: asset.version || "â€”",
        gerador: asset.generator || "â€”",
        copyright: asset.copyright || "â€”",
        cenas: json.scenes?.length ?? 0,
        nos: json.nodes?.length ?? 0,
        animacoes: gltf.animations?.length ?? 0,
        materiaisJson: json.materials?.length ?? 0,
        texturasJson: json.textures?.length ?? 0,
        imagens: json.images?.length ?? 0,
        buffers: json.buffers?.length ?? 0,
        extensoes: (json.extensionsUsed || []).join(", ") || "â€”",
      };
    }

    function montarSecoes(arquivo, geo, extras = {}) {
      const secoes = [];
      const medidas = converterMedidas(geo, arquivo.formato);
      const origemLabel = medidas.origem === "m" ? "Metros (glTF)" : "MilÃ­metros (STL/OBJ/PLY)";
      const exibicaoLabel = medidas.unidade === "m" ? "Metros" : "CentÃ­metros";

      secoes.push({
        titulo: "Arquivo",
        itens: [
          ["Nome", arquivo.nome],
          ["Formato", arquivo.formato],
          ["Tamanho", arquivo.tamanho],
          ["Tipo MIME", arquivo.mime],
          ["Modificado", arquivo.modificado],
          ...(arquivo.tipoStl ? [["Tipo STL", arquivo.tipoStl]] : []),
          ...(arquivo.bibliotecaMtl ? [["Biblioteca MTL", arquivo.bibliotecaMtl]] : []),
        ],
      });

      secoes.push({
        titulo: "Geometria",
        itens: [
          ["Malhas", formatarNumero(geo.malhas, 0)],
          ["Geometrias", formatarNumero(geo.geometrias, 0)],
          ["VÃ©rtices", formatarNumero(geo.vertices, 0)],
          ["TriÃ¢ngulos", formatarNumero(geo.triangulos, 0)],
          ["Ãrea de superfÃ­cie", formatarArea(medidas.areaM2, medidas.unidade)],
          ["Volume da malha", formatarVolume(medidas.volumeM3, medidas.unidade)],
          ["Indexadas", formatarNumero(geo.indexadas, 0)],
          ["NÃ£o indexadas", formatarNumero(geo.naoIndexadas, 0)],
          ["Com normais", formatarNumero(geo.comNormais, 0)],
          ["Com UV", formatarNumero(geo.comUv, 0)],
          ["Com cores", formatarNumero(geo.comCores, 0)],
          ["Grupos", formatarNumero(geo.grupos, 0)],
        ],
      });

      secoes.push({
        titulo: "DimensÃµes",
        itens: [
          ["Unidade do arquivo", origemLabel],
          ["ExibiÃ§Ã£o", exibicaoLabel],
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
          ["Materiais Ãºnicos", formatarNumero(geo.materiais, 0)],
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
          ["Unidade padrÃ£o", "MilÃ­metros"],
          ...(arquivo.titulo ? [["TÃ­tulo", arquivo.titulo]] : []),
          ...(arquivo.autor ? [["Designer", arquivo.autor]] : []),
          ...(arquivo.descricao ? [["DescriÃ§Ã£o", arquivo.descricao]] : []),
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
            ["VersÃ£o glTF", gltfInfo.versaoGltf],
            ["Gerador", gltfInfo.gerador],
            ["Copyright", gltfInfo.copyright],
            ["Cenas", formatarNumero(gltfInfo.cenas, 0)],
            ["NÃ³s", formatarNumero(gltfInfo.nos, 0)],
            ["AnimaÃ§Ãµes", formatarNumero(gltfInfo.animacoes, 0)],
            ["Materiais", formatarNumero(gltfInfo.materiaisJson, 0)],
            ["Texturas", formatarNumero(gltfInfo.texturasJson, 0)],
            ["Imagens", formatarNumero(gltfInfo.imagens, 0)],
            ["Buffers", formatarNumero(gltfInfo.buffers, 0)],
            ["ExtensÃµes", gltfInfo.extensoes],
          ],
        });
      }

      return secoes;
    }

    function renderizarPainel(secoes) {
      infoPanel.innerHTML = "";

      const tituloPainel = document.createElement("p");
      tituloPainel.className = "info-panel-title";
      tituloPainel.innerHTML = "<strong>InformaÃ§Ãµes</strong>";
      infoPanel.appendChild(tituloPainel);

      secoes.forEach((secao) => {
        const bloco = document.createElement("div");
        bloco.className = "info-section";

        const cabecalho = document.createElement("button");
        cabecalho.type = "button";
        cabecalho.className = "info-section-header";
        cabecalho.setAttribute("aria-expanded", "false");
        cabecalho.innerHTML = `<span class="info-chevron">â–¸</span>${secao.titulo}`;

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
        wireframe,
      });
    }

    function clonarMaterial(material, geometria) {
      if (!material) return materialPadrao(geometria);

      const clone = material.clone();
      clone.wireframe = wireframe;

      if (geometria?.attributes?.color) {
        clone.vertexColors = true;
      }

      for (const chave of ["map", "emissiveMap", "specularMap"]) {
        if (clone[chave]) clone[chave].colorSpace = THREE.SRGBColorSpace;
      }
      return clone;
    }

    function salvarEstadoVisual(object) {
      materiaisOriginais.clear();
      meshComCorVertice.clear();

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
    }

    function aplicarVisual(object) {
      object.traverse((child) => {
        if (!child.isMesh) return;

        if (usarCores && materiaisOriginais.has(child.uuid)) {
          const originais = materiaisOriginais.get(child.uuid);
          const clonados = originais.map((material) => {
            const mat = material.clone();
            mat.wireframe = wireframe;
            if (meshComCorVertice.has(child.uuid)) mat.vertexColors = true;
            for (const chave of ["map", "emissiveMap", "specularMap"]) {
              if (mat[chave]) mat[chave].colorSpace = THREE.SRGBColorSpace;
            }
            return mat;
          });
          child.material = clonados.length === 1 ? clonados[0] : clonados;
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

    function corEhPadraoRenderizador(hex) {
      return hex === "#FFFFFF" || hex === "#89B4FA";
    }

    function extrairCoresDoModelo(object) {
      const visto = new Set();
      const cores = [];
      let temCorVertice = false;
      let temFilamentoBambu = false;

      function adicionarCor(hex) {
        if (!hex) return;
        const normalizado = hex.toUpperCase();
        if (!/^#[0-9A-F]{6}$/.test(normalizado)) return;
        if (visto.has(normalizado)) return;
        visto.add(normalizado);
        cores.push(normalizado);
      }

      object.traverse((child) => {
        if (!child.isMesh) return;
        if (child.name?.startsWith("filament-")) temFilamentoBambu = true;

        const meshTemCorVertice = Boolean(child.geometry?.attributes?.color);
        if (meshTemCorVertice) temCorVertice = true;

        const materiais = child.material
          ? Array.isArray(child.material)
            ? child.material
            : [child.material]
          : [];

        if (!meshTemCorVertice) {
          for (const mat of materiais) {
            if (!mat?.color) continue;
            adicionarCor(`#${mat.color.getHexString()}`);
          }
        }

        if (meshTemCorVertice) {
          const attr = child.geometry.attributes.color;
          const passo = Math.max(1, Math.floor(attr.count / 3000));
          for (let i = 0; i < attr.count && cores.length < 24; i += passo) {
            const r = Math.round(attr.getX(i) * 255);
            const g = Math.round(attr.getY(i) * 255);
            const b = Math.round(attr.getZ(i) * 255);
            adicionarCor(
              `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
            );
          }
        }
      });

      if (temFilamentoBambu || temCorVertice) return cores;

      const coresReais = cores.filter((hex) => !corEhPadraoRenderizador(hex));
      if (coresReais.length) return coresReais;
      if (cores.length > 1) return cores;
      return [];
    }

    function atualizarCoresModelo(cores) {
      const wrap = document.getElementById("cores-modelo-wrap");
      const row = document.getElementById("cores-modelo");
      const contagem = document.getElementById("cores-modelo-contagem");
      const vazio = document.getElementById("cores-modelo-vazio");

      wrap.classList.remove("hidden");

      if (!cores.length) {
        row.innerHTML = "";
        contagem.textContent = "";
        vazio.classList.remove("hidden");
        return;
      }

      vazio.classList.add("hidden");
      row.innerHTML = cores
        .map(
          (hex) =>
            `<span class="cor-modelo-swatch" data-hex="${hex}" style="background-color:${hex}" title="${hex} â€” clique para filtrar/copiar"></span>`
        )
        .join("");

      row.querySelectorAll(".cor-modelo-swatch").forEach((sw) => {
        sw.addEventListener("click", async () => {
          const hex = sw.dataset.hex;
          ferramentas?.aplicarFiltroCor(hex);
          try {
            await navigator.clipboard.writeText(hex);
            sw.classList.add("copiado");
            setStatus(`Cor ${hex} copiada`);
            setTimeout(() => sw.classList.remove("copiado"), 800);
          } catch {
            setStatus(`Cor selecionada: ${hex}`);
          }
        });
      });

      contagem.textContent =
        cores.length === 1
          ? "1 cor Â· clique para filtrar"
          : `${cores.length} cores Â· clique para filtrar`;
    }

    function limparCoresModelo() {
      document.getElementById("cores-modelo-wrap").classList.add("hidden");
      document.getElementById("cores-modelo").innerHTML = "";
      document.getElementById("cores-modelo-contagem").textContent = "";
      document.getElementById("cores-modelo-vazio").classList.add("hidden");
    }

    function showModel(object, arquivoMeta, extras = {}) {
      clearModel();

      ultimoArquivoMeta = arquivoMeta;
      ultimoExtras = extras;
      ultimoFormato = arquivoMeta.formato || "STL";

      const geo = analisarGeometria(object);
      const coresModelo = extrairCoresDoModelo(object);
      salvarEstadoVisual(object);
      aplicarVisual(object);
      currentModel = object;
      modelPivot.add(object);
      centerAndFrame(object);

      const caixa = new THREE.Box3().setFromObject(object);
      geo.tamanho = caixa.getSize(new THREE.Vector3());
      geo.centro = caixa.getCenter(new THREE.Vector3());
      geo.diagonal = geo.tamanho.length();

      secaoFilamentosCache = ferramentas?.onModelLoaded(object, extras, geo, ultimoFormato);
      secaoExtensoesCache = extensoes?.onModelLoaded(object, {
        ...extras,
        bambuImpressao: extras.bambu?.bambuImpressao,
      });

      const secoes = montarSecoesUltimo(geo);

      placeholder.classList.add("hidden");
      renderizarPainel(secoes);
      atualizarCoresModelo(coresModelo);
      ferramentas?.sincronizarCameras();
      setStatus(`Modelo carregado: ${arquivoMeta.nome}`);
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
          const resultado = carregar3mf(buffer);
          object = resultado.object;
          extras.bambu = resultado.meta;
        } else {
          throw new Error(`Formato .${ext} nÃ£o suportado.`);
        }
        return { object, extras };
      } finally {
        if (url) URL.revokeObjectURL(url);
      }
    }

    async function loadFile(file, arquivosRelacionados = []) {
      const ext = file.name.split(".").pop().toLowerCase();
      ferramentas?.setLoading(true, `Carregando ${file.name}...`);
      setStatus(`Carregando ${file.name}...`);

      try {
        const arquivoMeta = await lerMetadadosArquivo(file, ext);
        revogarUrlsFbx(fbxUrlsAtivas);

        const { object, extras } = await carregarObjetoBruto(file, arquivosRelacionados);
        if (extras.fbxUrls) fbxUrlsAtivas = extras.fbxUrls;

        ferramentas?.salvarRecente(file);
        showModel(criarContainerModelo(object, ext), arquivoMeta, extras);
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

    document.getElementById("file-input").addEventListener("change", (e) => {
      const arquivos = Array.from(e.target.files || []);
      if (!arquivos.length) return;

      const fbx = arquivos.find((f) => f.name.toLowerCase().endsWith(".fbx"));
      if (fbx) {
        loadFile(fbx, arquivos);
        return;
      }

      const zip = arquivos.find((f) => f.name.toLowerCase().endsWith(".zip"));
      if (zip) {
        loadFile(zip, arquivos);
        return;
      }

      loadFile(arquivos[0], arquivos);
    });

    document.getElementById("btn-reset").addEventListener("click", () => {
      if (currentModel) centerAndFrame(currentModel);
    });

    function atualizarSecaoFilamentos() {
      if (!currentModel || !ultimoArquivoMeta || !ferramentas) return;
      const geo = analisarGeometria(currentModel);
      const caixa = new THREE.Box3().setFromObject(currentModel);
      geo.tamanho = caixa.getSize(new THREE.Vector3());
      secaoFilamentosCache = ferramentas.getSecaoFilamentos();
      renderizarPainel(montarSecoesUltimo(geo));
    }

    document.getElementById("chk-cores").addEventListener("change", (e) => {
      usarCores = e.target.checked;
      if (currentModel) aplicarVisual(currentModel);
      ferramentas?.salvarPreferencias({ cores: e.target.checked });
      setStatus(usarCores ? "Cores originais ativadas" : "Cores originais desativadas");
    });

    document.getElementById("chk-wireframe").addEventListener("change", (e) => {
      wireframe = e.target.checked;
      if (currentModel) aplicarVisual(currentModel);
      ferramentas?.salvarPreferencias({ wireframe: e.target.checked });
      setStatus(wireframe ? "Wireframe ativado" : "Wireframe desativado");
    });

    document.getElementById("fundos").addEventListener("click", (e) => {
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
      getVelocidadeRotacao: velocidadeRotacao,
      updateCamera,
      centerAndFrame,
      setPanOffset,
      setStatus,
      loadFile,
      aplicarVisual,
      getWireframe: () => wireframe,
      converterMedidas,
      formatarVolume,
      unidadeParaCena,
      cenaParaMetros,
      formatarDistancia,
      aplicarPreferenciaCores: (valor) => {
        usarCores = valor;
        if (currentModel) aplicarVisual(currentModel);
      },
      aplicarPreferenciaWireframe: (valor) => {
        wireframe = valor;
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
      unidadeOrigemArquivo,
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
    });

    ferramentas.setLights(hemiLight, dirLight);
    ferramentas.bindUi();
    extensoes.bindUi();

    const params = new URLSearchParams(location.search);
    if (params.get("produto")) {
      initGd3dProduto({
        loadFile,
        setStatus,
        getCurrentModel: () => currentModel,
        modelPivot,
      });
    }

    document.querySelector("[data-auth-logout-admin]")?.addEventListener("click", async (e) => {
      e.preventDefault();
      await logout();
      window.location.href = "/login.html";
    });
