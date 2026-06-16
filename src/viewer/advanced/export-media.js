/**
 * Exportação PNG (fundo transparente) e vídeo de giro (WebM).
 */
import * as THREE from "three";

export function capturarPngBlob(renderer, scene, camera, { transparent = false } = {}) {
  const prevAlpha = renderer.getClearAlpha();
  const prevCor = renderer.getClearColor(new THREE.Color());
  const prevFundo = scene.background;

  if (transparent) {
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
        else reject(new Error('Não foi possível gerar a imagem'));
      },
      'image/png',
      0.92
    );
  });
}

export function capturarPngTransparente(renderer, scene, camera) {
  const prevAlpha = renderer.getClearAlpha();
  const prevCor = renderer.getClearColor(new THREE.Color());
  const prevFundo = scene.background;

  renderer.setClearColor(0x000000, 0);
  scene.background = null;
  renderer.render(scene, camera);

  const dataUrl = renderer.domElement.toDataURL("image/png");

  renderer.setClearColor(prevCor, prevAlpha);
  scene.background = prevFundo;
  renderer.render(scene, camera);

  const link = document.createElement("a");
  link.download = `modelo-${Date.now()}.png`;
  link.href = dataUrl;
  link.click();
}

export async function exportarGifGiro({ renderer, scene, camera, modelPivot, frames = 48, onProgress }) {
  const canvas = renderer.domElement;
  if (!canvas.captureStream) {
    throw new Error("Captura de vídeo não suportada neste navegador");
  }

  const qOriginal = modelPivot.quaternion.clone();
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

  recorder.start();
  const passo = (Math.PI * 2) / frames;

  for (let i = 0; i <= frames; i++) {
    modelPivot.quaternion.copy(qOriginal);
    modelPivot.quaternion.multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), passo * i)
    );
    renderer.render(scene, camera);
    onProgress?.(i, frames);
    await new Promise((r) => setTimeout(r, 80));
  }

  recorder.stop();
  const blob = await gravacao;

  modelPivot.quaternion.copy(qOriginal);
  renderer.render(scene, camera);

  const link = document.createElement("a");
  link.download = `giro-${Date.now()}.webm`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
