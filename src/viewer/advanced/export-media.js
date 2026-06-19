/**
 * Exportação PNG (fundo transparente ou estúdio) e vídeo de giro (WebM).
 */
import * as THREE from "three";

function baixarDataUrl(dataUrl, nome) {
  const link = document.createElement("a");
  link.download = nome;
  link.href = dataUrl;
  link.click();
}

export function capturarPngBlob(renderer, scene, camera, { transparent = false, cenarioAtivo = false } = {}) {
  const prevAlpha = renderer.getClearAlpha();
  const prevCor = renderer.getClearColor(new THREE.Color());
  const prevFundo = scene.background;

  const fundoTransparente = transparent && !cenarioAtivo;
  if (fundoTransparente) {
    renderer.setClearColor(0x000000, 0);
    scene.background = null;
  }

  renderer.render(scene, camera);

  return new Promise((resolve, reject) => {
    renderer.domElement.toBlob(
      (blob) => {
        renderer.setClearColor(prevCor, prevAlpha);
        scene.background = prevFundo;
        renderer.render(scene, camera);
        if (blob) resolve(blob);
        else reject(new Error("Não foi possível gerar a imagem"));
      },
      "image/png",
      0.92
    );
  });
}

export function capturarTelaPng(renderer, scene, camera) {
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
}

export function capturarPngTransparente(renderer, scene, camera, { cenarioAtivo = false } = {}) {
  if (cenarioAtivo) {
    renderer.render(scene, camera);
    baixarDataUrl(renderer.domElement.toDataURL("image/png"), `estudio-${Date.now()}.png`);
    return;
  }

  const prevAlpha = renderer.getClearAlpha();
  const prevCor = renderer.getClearColor(new THREE.Color());
  const prevFundo = scene.background;

  renderer.setClearColor(0x000000, 0);
  scene.background = null;
  renderer.render(scene, camera);

  baixarDataUrl(renderer.domElement.toDataURL("image/png"), `modelo-${Date.now()}.png`);

  renderer.setClearColor(prevCor, prevAlpha);
  scene.background = prevFundo;
  renderer.render(scene, camera);
}

export async function exportarGifGiro({
  renderer,
  scene,
  camera,
  modelPivot,
  frames = 48,
  onProgress,
  onBeforeFrame,
  orbit,
}) {
  const canvas = renderer.domElement;
  if (!canvas.captureStream) {
    throw new Error("Captura de vídeo não suportada neste navegador");
  }

  const usarOrbita = Boolean(orbit?.setTheta && orbit?.updateCamera);
  const qOriginal = modelPivot?.quaternion?.clone?.();
  const theta0 = usarOrbita ? orbit.getTheta() : 0;

  const stream = canvas.captureStream(12);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const gravacao = new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });

  const passo = (Math.PI * 2) / frames;

  onBeforeFrame?.(0);
  renderer.render(scene, camera);
  recorder.start();

  for (let i = 0; i <= frames; i++) {
    if (usarOrbita) {
      orbit.setTheta(theta0 + passo * i);
      orbit.updateCamera();
    } else if (modelPivot && qOriginal) {
      modelPivot.quaternion.copy(qOriginal);
      modelPivot.quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), passo * i)
      );
    }
    onBeforeFrame?.(i);
    renderer.render(scene, camera);
    onProgress?.(i, frames);
    await new Promise((r) => setTimeout(r, 80));
  }

  recorder.stop();
  const blob = await gravacao;

  if (usarOrbita) {
    orbit.setTheta(theta0);
    orbit.updateCamera();
  } else if (modelPivot && qOriginal) {
    modelPivot.quaternion.copy(qOriginal);
  }
  onBeforeFrame?.(frames);
  renderer.render(scene, camera);

  const link = document.createElement("a");
  link.download = `giro-${Date.now()}.webm`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
