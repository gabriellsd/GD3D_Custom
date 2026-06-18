/**
 * Painel "Items" — árvore de grupos/ficheiros com visibilidade (estilo slicer).
 */

function escapeHtml(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function nomeBase(ficheiro) {
  return ficheiro.replace(/\.[^.]+$/, '');
}

/** Nome de grupo a partir de vários ficheiros (ex.: Wartortle (3).3mf + Wartortle (4).3mf → Wartortle). */
export function nomeGrupoImportacao(nomes) {
  if (!nomes.length) return 'Importação';
  if (nomes.length === 1) return nomeBase(nomes[0]);

  const bases = nomes.map(nomeBase);
  let prefixo = bases[0];
  for (const b of bases.slice(1)) {
    let i = 0;
    while (i < prefixo.length && i < b.length && prefixo[i] === b[i]) i++;
    prefixo = prefixo.slice(0, i).replace(/[\s\-_]+$/, '');
    if (!prefixo) break;
  }

  if (prefixo.length >= 2) return prefixo;

  const semNumero = bases[0].replace(/\s*\(\d+\)\s*$/, '').trim();
  if (semNumero && bases.every((b) => b.replace(/\s*\(\d+\)\s*$/, '').trim() === semNumero)) {
    return semNumero;
  }

  return nomeBase(nomes[0]);
}

function definirVisibilidade(object3d, visivel) {
  if (!object3d) return;
  object3d.visible = visivel;
  object3d.traverse((child) => {
    child.visible = visivel;
  });
}

export function initPainelItems(app) {
  const estado = {
    grupos: [],
    selecionadoId: null,
  };

  let container = null;
  let fileInput = null;

  function encontrarNo(id) {
    for (const grupo of estado.grupos) {
      if (grupo.id === id) return { tipo: 'grupo', grupo };
      const peca = grupo.pecas.find((p) => p.id === id);
      if (peca) return { tipo: 'peca', grupo, peca };
    }
    return null;
  }

  function selecionar(id) {
    estado.selecionadoId = id;
    render();
  }

  function alternarGrupo(id) {
    const g = estado.grupos.find((gr) => gr.id === id);
    if (g) g.expandido = !g.expandido;
    render();
  }

  function alternarVisibilidade(id) {
    const no = encontrarNo(id);
    if (!no) return;

    if (no.tipo === 'grupo') {
      no.grupo.visivel = !no.grupo.visivel;
      definirVisibilidade(no.grupo.object3d, no.grupo.visivel);
      for (const p of no.grupo.pecas) p.visivel = no.grupo.visivel;
    } else {
      no.peca.visivel = !no.peca.visivel;
      definirVisibilidade(no.peca.object3d, no.peca.visivel);
      no.grupo.visivel = no.grupo.pecas.some((p) => p.visivel);
    }

    app.onVisibilidadeAlterada?.();
    render();
  }

  function removerSelecionados() {
    if (!estado.selecionadoId) {
      app.setStatus?.('Selecione um item para remover', true);
      return;
    }

    const no = encontrarNo(estado.selecionadoId);
    if (!no) return;

    if (no.tipo === 'peca') {
      no.grupo.object3d.remove(no.peca.object3d);
      no.peca.object3d.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => m?.dispose());
        }
      });
      no.grupo.pecas = no.grupo.pecas.filter((p) => p.id !== no.peca.id);
      if (!no.grupo.pecas.length) removerGrupo(no.grupo.id);
    } else {
      removerGrupo(no.grupo.id);
    }

    estado.selecionadoId = null;
    app.onItemsAlterados?.();
    render();
  }

  function removerGrupo(grupoId) {
    const idx = estado.grupos.findIndex((g) => g.id === grupoId);
    if (idx < 0) return;
    const grupo = estado.grupos[idx];
    grupo.object3d.parent?.remove(grupo.object3d);
    grupo.pecas.forEach((p) => {
      p.object3d.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => m?.dispose());
        }
      });
    });
    estado.grupos.splice(idx, 1);
  }

  function renderSwatchesCores(cores) {
  if (!cores?.length) return "";
  return `<span class="painel-items-cores">${cores
    .map(
      (hex) =>
        `<span class="painel-items-cor" data-hex="${hex}" style="background-color:${hex}" title="${hex}"></span>`
    )
    .join("")}</span>`;
}

function render() {
    if (!container) return;

    if (!estado.grupos.length) {
      container.innerHTML = '<p class="painel-items-vazio">Nenhum item</p>';
      return;
    }

    container.innerHTML = estado.grupos
      .map((grupo) => {
        const exp = grupo.expandido !== false;
        const selGrupo = estado.selecionadoId === grupo.id;
        const olhoGrupo = grupo.visivel ? 'fa-eye' : 'fa-eye-slash';

        const filhos = grupo.pecas
          .map((peca) => {
            const sel = estado.selecionadoId === peca.id;
            const olho = peca.visivel ? 'fa-eye' : 'fa-eye-slash';
            return `
              <div class="painel-items-linha painel-items-linha--filho${sel ? ' is-selecionado' : ''}" data-id="${peca.id}" data-tipo="peca">
                ${renderSwatchesCores(peca.cores)}
                <span class="painel-items-nome" title="${escapeHtml(peca.nome)}">${escapeHtml(peca.nome)}</span>
                <button type="button" class="painel-items-olho" data-vis="${peca.id}" title="Mostrar/ocultar" aria-label="Visibilidade">
                  <i class="fa-solid ${olho}" aria-hidden="true"></i>
                </button>
              </div>`;
          })
          .join('');

        return `
          <div class="painel-items-grupo" data-grupo="${grupo.id}">
            <div class="painel-items-linha painel-items-linha--grupo${selGrupo ? ' is-selecionado' : ''}" data-id="${grupo.id}" data-tipo="grupo">
              <button type="button" class="painel-items-chevron${exp ? ' is-aberto' : ''}" data-expand="${grupo.id}" aria-label="Expandir">
                ${exp ? '▾' : '▸'}
              </button>
              <span class="painel-items-nome" title="${escapeHtml(grupo.nome)}">${escapeHtml(grupo.nome)}</span>
              <button type="button" class="painel-items-olho" data-vis="${grupo.id}" title="Mostrar/ocultar grupo" aria-label="Visibilidade">
                <i class="fa-solid ${olhoGrupo}" aria-hidden="true"></i>
              </button>
            </div>
            ${exp ? `<div class="painel-items-filhos">${filhos}</div>` : ''}
          </div>`;
      })
      .join('');

    container.querySelectorAll('[data-expand]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        alternarGrupo(btn.dataset.expand);
      });
    });

    container.querySelectorAll('[data-vis]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        alternarVisibilidade(btn.dataset.vis);
      });
    });

    container.querySelectorAll('.painel-items-linha[data-id]').forEach((linha) => {
      linha.addEventListener('click', () => selecionar(linha.dataset.id));
    });

    container.querySelectorAll('.painel-items-cor').forEach((sw) => {
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        app.onCorClicada?.(sw.dataset.hex);
      });
    });
  }

  function atualizarCoresPecas(entradas) {
    const map = new Map((entradas || []).map((e) => [e.id, e.cores || []]));
    for (const grupo of estado.grupos) {
      for (const peca of grupo.pecas) {
        if (map.has(peca.id)) peca.cores = map.get(peca.id);
      }
    }
    render();
  }

  /**
   * @param {{ nome: string, object3d: THREE.Object3D, pecas: Array<{ nome, object3d }> }} dados
   */
  function adicionarGrupo(dados) {
    const grupo = {
      id: crypto.randomUUID(),
      nome: dados.nome,
      expandido: true,
      visivel: true,
      object3d: dados.object3d,
      pecas: dados.pecas.map((p) => ({
        id: crypto.randomUUID(),
        nome: p.nome,
        visivel: true,
        object3d: p.object3d,
        cores: [],
      })),
    };
    estado.grupos.push(grupo);
    estado.selecionadoId = grupo.pecas[0]?.id ?? grupo.id;
    render();
    return grupo;
  }

  function limpar() {
    for (const g of [...estado.grupos]) removerGrupo(g.id);
    estado.selecionadoId = null;
    render();
  }

  /** Limpa só o estado UI (a cena já foi libertada noutro sítio). */
  function resetEstado() {
    estado.grupos = [];
    estado.selecionadoId = null;
    render();
  }

  function temItems() {
    return estado.grupos.length > 0;
  }

  function bindUi() {
    container = document.getElementById('painel-items-arvore');
    fileInput = document.getElementById('items-file-input');
    let modoAppend = false;

    document.getElementById('items-btn-abrir')?.addEventListener('click', () => {
      modoAppend = false;
      fileInput?.click();
    });

    document.getElementById('items-btn-remover')?.addEventListener('click', () => {
      removerSelecionados();
    });

    document.getElementById('items-btn-adicionar')?.addEventListener('click', () => {
      modoAppend = true;
      fileInput?.click();
    });

    fileInput?.addEventListener('change', (e) => {
      const ficheiros = Array.from(e.target.files || []);
      e.target.value = '';
      if (ficheiros.length) {
        app.onFicheirosSelecionados?.(ficheiros, { append: modoAppend });
      }
    });
  }

  return {
    bindUi,
    adicionarGrupo,
    limpar,
    resetEstado,
    temItems,
    render,
    atualizarCoresPecas,
    getGrupos: () => estado.grupos,
    selecionar,
  };
}
