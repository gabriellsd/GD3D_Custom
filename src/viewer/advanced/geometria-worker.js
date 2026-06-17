import { analisarMeshesData } from './geometria-analise.js';

self.onmessage = (event) => {
  const { jobId, meshes } = event.data || {};
  try {
    const result = analisarMeshesData(meshes);
    self.postMessage({ jobId, result });
  } catch (err) {
    self.postMessage({ jobId, error: err?.message || 'Erro na análise de geometria.' });
  }
};
