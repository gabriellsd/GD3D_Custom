/**
 * Visualização AR via WebXR (quando suportado).
 */
import * as THREE from "three";

export async function suportaAr() {
  if (!navigator.xr) return false;
  try {
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

export async function iniciarAr({ renderer, scene, modelPivot, onStatus }) {
  if (!(await suportaAr())) {
    throw new Error("AR não suportado neste dispositivo/navegador");
  }

  const session = await navigator.xr.requestSession("immersive-ar", {
    requiredFeatures: ["local-floor", "hit-test"],
    optionalFeatures: ["dom-overlay"],
    domOverlay: { root: document.body },
  });

  renderer.xr.enabled = true;
  await renderer.xr.setSession(session);

  const refSpace = await session.requestReferenceSpace("local-floor");
  let hitSource = null;

  if (session.requestHitTestSource) {
    const viewerSpace = await session.requestReferenceSpace("viewer");
    hitSource = await session.requestHitTestSource({ space: viewerSpace });
  }

  const clone = modelPivot.clone(true);
  clone.visible = false;
  scene.add(clone);

  const posicionado = { value: false };

  session.addEventListener("end", () => {
    scene.remove(clone);
    clone.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material.dispose();
      }
    });
    renderer.xr.enabled = false;
    onStatus?.("Sessão AR encerrada");
  });

  renderer.setAnimationLoop((time, frame) => {
    if (!frame) return;

    if (hitSource && !posicionado.value) {
      const hits = frame.getHitTestResults(hitSource);
      if (hits.length) {
        const pose = hits[0].getPose(refSpace);
        if (pose) {
          clone.matrix.fromArray(pose.transform.matrix);
          clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
          clone.visible = true;
          posicionado.value = true;
          onStatus?.("Modelo posicionado — mova o dispositivo");
        }
      }
    }

    renderer.render(scene, renderer.xr.getCamera());
  });

  onStatus?.("AR ativo — aponte para uma superfície plana");
  return session;
}
