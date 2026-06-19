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
    selecionadosIds: new Set(),
  };

  let container = null;
  let fileInput = null;

  function encontrarNo(id) {
    for (const grupo of estado.grupos) {
      if (grupo.id === id) return { tipo: 'grupo', grupo };
      for (const peca of grupo.pecas) {
        if (peca.id === id) return { tipo: 'peca', grupo, peca };
        const filamento = peca.filamentos?.find((f) => f.id === id);
        if (filamento) return { tipo: 'filamento', grupo, peca, filamento };
      }
    }
    return null;
  }

  function getGruposSelecionados() {
    return estado.grupos.filter((g) => estado.selecionadosIds.has(g.id));
  }

  function getObject3dsSelecionados() {
    const vistos = new Set();
    const objetos = [];

    for (const id of estado.selecionadosIds) {
      const no = encontrarNo(id);
      if (!no) continue;

      let alvo = null;
      if (no.tipo === "grupo") alvo = no.grupo.object3d;
      else if (no.tipo === "peca") alvo = no.peca.object3d;
      else if (no.tipo === "filamento") alvo = no.filamento.object3d;

      if (alvo && !vistos.has(alvo.uuid)) {
        vistos.add(alvo.uuid);
        objetos.push(alvo);
      }
    }

    return objetos;
  }

  function restaurarVisibilidadeCompleta() {
    for (const grupo of estado.grupos) {
      grupo.visivel = true;
      definirVisibilidade(grupo.object3d, true);
      for (const peca of grupo.pecas) {
        peca.visivel = true;
        definirVisibilidade(peca.object3d, true);
        for (const f of peca.filamentos ?? []) {
          f.visivel = true;
          if (f.object3d) definirVisibilidade(f.object3d, true);
        }
      }
    }
  }

  function aplicarIsolamentoSelecao() {
    if (!estado.selecionadosIds.size) {
      restaurarVisibilidadeCompleta();
      app.onVisibilidadeAlterada?.();
      return;
    }

    const nos = [...estado.selecionadosIds]
      .map((id) => encontrarNo(id))
      .filter(Boolean);
    const temPecaOuFil = nos.some((n) => n.tipo === "peca" || n.tipo === "filamento");

    if (!temPecaOuFil) {
      restaurarVisibilidadeCompleta();
      app.onVisibilidadeAlterada?.();
      return;
    }

    const pecasVisiveisPorGrupo = new Map();
    const filamentosVisiveisPorPeca = new Map();

    for (const no of nos) {
      if (no.tipo === "grupo") {
        pecasVisiveisPorGrupo.set(no.grupo.id, new Set(no.grupo.pecas.map((p) => p.id)));
        continue;
      }
      if (no.tipo === "peca" || no.tipo === "filamento") {
        const gid = no.grupo.id;
        if (!pecasVisiveisPorGrupo.has(gid)) pecasVisiveisPorGrupo.set(gid, new Set());
        pecasVisiveisPorGrupo.get(gid).add(no.peca.id);
      }
      if (no.tipo === "filamento") {
        if (!filamentosVisiveisPorPeca.has(no.peca.id)) {
          filamentosVisiveisPorPeca.set(no.peca.id, new Set());
        }
        filamentosVisiveisPorPeca.get(no.peca.id).add(no.filamento.id);
      }
    }

    for (const grupo of estado.grupos) {
      const pecasAlvo = pecasVisiveisPorGrupo.get(grupo.id);
      const isolarPecas = pecasAlvo && grupo.pecas.length > 1;

      for (const peca of grupo.pecas) {
        const mostrarPeca = !isolarPecas || pecasAlvo.has(peca.id);
        const filsAlvo = filamentosVisiveisPorPeca.get(peca.id);
        const isolarFils = Boolean(filsAlvo?.size && peca.filamentos?.length);

        if (!mostrarPeca) {
          peca.visivel = false;
          definirVisibilidade(peca.object3d, false);
          for (const f of peca.filamentos ?? []) f.visivel = false;
          continue;
        }

        peca.visivel = true;

        if (!isolarFils) {
          definirVisibilidade(peca.object3d, true);
          for (const f of peca.filamentos ?? []) {
            f.visivel = true;
            if (f.object3d) definirVisibilidade(f.object3d, true);
          }
          continue;
        }

        definirVisibilidade(peca.object3d, true);
        for (const f of peca.filamentos) {
          const vis = filsAlvo.has(f.id);
          f.visivel = vis;
          if (f.object3d) definirVisibilidade(f.object3d, vis);
        }
      }

      grupo.visivel = grupo.pecas.some((p) => p.visivel);
    }

    app.onVisibilidadeAlterada?.();
  }

  function emitirSelecao() {
    app.onSelecaoAlterada?.(getObject3dsSelecionados());
  }

  function selecionar(id, { ctrlKey = false } = {}) {
    if (!encontrarNo(id)) return;

    if (ctrlKey) {
      if (estado.selecionadosIds.has(id)) {
        estado.selecionadosIds.delete(id);
      } else {
        estado.selecionadosIds.add(id);
      }
    } else {
      estado.selecionadosIds.clear();
      estado.selecionadosIds.add(id);
    }

    aplicarIsolamentoSelecao();
    render();
    emitirSelecao();
  }

  function selecionarPorObject3d(object3d, { ctrlKey = false } = {}) {
    if (!object3d) return;

    for (const grupo of estado.grupos) {
      for (const peca of grupo.pecas) {
        for (const fil of peca.filamentos ?? []) {
          if (fil.object3d === object3d) {
            selecionar(fil.id, { ctrlKey });
            return;
          }
        }
        let dentroDaPeca = peca.object3d === object3d;
        if (!dentroDaPeca) {
          peca.object3d.traverse((child) => {
            if (child === object3d) dentroDaPeca = true;
          });
        }
        if (dentroDaPeca && peca.object3d !== object3d) {
          for (const fil of peca.filamentos ?? []) {
            if (fil.object3d === object3d) {
              selecionar(fil.id, { ctrlKey });
              return;
            }
          }
        }
        if (peca.object3d === object3d) {
          selecionar(peca.id, { ctrlKey });
          return;
        }
      }
      if (grupo.object3d === object3d) {
        selecionar(grupo.id, { ctrlKey });
        return;
      }
      let dentroDoGrupo = false;
      grupo.object3d.traverse((child) => {
        if (child === object3d) dentroDoGrupo = true;
      });
      if (dentroDoGrupo) {
        selecionar(grupo.id, { ctrlKey });
        return;
      }
    }
  }

  function limparSelecao() {
    if (!estado.selecionadosIds.size) return;
    estado.selecionadosIds.clear();
    restaurarVisibilidadeCompleta();
    render();
    emitirSelecao();
  }

  function alternarGrupo(id) {
    const g = estado.grupos.find((gr) => gr.id === id);
    if (g) g.expandido = !g.expandido;
    render();
  }

  function colapsarFilamentos() {
    if (!estado.grupos.length) return;
    for (const grupo of estado.grupos) {
      grupo.expandido = false;
      for (const peca of grupo.pecas) {
        if (pecaTemSubFilamentos(peca)) peca.filamentosExpandido = false;
      }
    }
    render();
  }

  function expandirFilamentos() {
    if (!estado.grupos.length) return;
    for (const grupo of estado.grupos) {
      grupo.expandido = true;
      for (const peca of grupo.pecas) {
        if (pecaTemSubFilamentos(peca)) peca.filamentosExpandido = true;
      }
    }
    render();
  }

  function encontrarPecaPorId(pecaId) {
    for (const grupo of estado.grupos) {
      const peca = grupo.pecas.find((p) => p.id === pecaId);
      if (peca) return peca;
    }
    return null;
  }

  function pecaTemSubFilamentos(peca) {
    return (peca?.filamentos?.length ?? 0) >= 2;
  }

  function alternarFilamentosPeca(pecaId) {
    const peca = encontrarPecaPorId(pecaId);
    if (!pecaTemSubFilamentos(peca)) return;
    peca.filamentosExpandido = !(peca.filamentosExpandido ?? true);
    render();
  }

  function alternarVisibilidade(id) {
    const no = encontrarNo(id);
    if (!no) return;

    if (no.tipo === 'grupo') {
      no.grupo.visivel = !no.grupo.visivel;
      definirVisibilidade(no.grupo.object3d, no.grupo.visivel);
      for (const p of no.grupo.pecas) {
        p.visivel = no.grupo.visivel;
        for (const f of p.filamentos ?? []) f.visivel = no.grupo.visivel;
      }
    } else if (no.tipo === 'filamento') {
      no.filamento.visivel = !no.filamento.visivel;
      definirVisibilidade(no.filamento.object3d, no.filamento.visivel);
      no.peca.visivel = no.peca.filamentos.some((f) => f.visivel);
    } else {
      no.peca.visivel = !no.peca.visivel;
      definirVisibilidade(no.peca.object3d, no.peca.visivel);
      for (const f of no.peca.filamentos ?? []) {
        f.visivel = no.peca.visivel;
        definirVisibilidade(f.object3d, f.visivel);
      }
      no.grupo.visivel = no.grupo.pecas.some((p) => p.visivel);
    }

    app.onVisibilidadeAlterada?.();
    render();
  }

  function removerSelecionados() {
    if (!estado.selecionadosIds.size) {
      app.setStatus?.('Selecione um item para remover', true);
      return;
    }

    const nomes = [];
    const ids = [...estado.selecionadosIds];
    for (const id of ids) {
      const no = encontrarNo(id);
      if (!no) continue;
      if (no.tipo === 'grupo') {
        nomes.push(no.grupo.nome);
        removerGrupo(no.grupo.id);
      }
    }

    estado.selecionadosIds.clear();
    app.onItemsAlterados?.();
    render();
    emitirSelecao();

    if (nomes.length === 1) {
      app.setStatus?.(`Removido: ${nomes[0]}`);
    } else if (nomes.length > 1) {
      app.setStatus?.(`Removidos ${nomes.length} modelos`);
    }
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

  const ALTURA_LINHA = 28;
  const PADDING_ARVORE = 8;

  function contarLinhasVisiveis() {
    let linhas = 0;
    for (const grupo of estado.grupos) {
      linhas += 1;
      if (grupo.expandido === false) continue;
      for (const peca of grupo.pecas) {
        linhas += 1;
        if (peca.filamentos?.length >= 2 && peca.filamentosExpandido !== false) {
          linhas += peca.filamentos.length;
        }
      }
    }
    return linhas;
  }

  function atualizarAlturaArvore() {
    if (!container) return;

    const linhas = contarLinhasVisiveis();
    if (!linhas) {
      container.style.maxHeight = '';
      container.style.overflowY = '';
      return;
    }

    const alturaConteudo = linhas * ALTURA_LINHA + PADDING_ARVORE;
    const teto = Math.max(160, Math.floor(window.innerHeight * 0.5));
    container.style.maxHeight = `${Math.min(alturaConteudo, teto)}px`;
    container.style.overflowY = alturaConteudo > teto ? 'auto' : '';
  }

  function render() {
    if (!container) return;

    if (!estado.grupos.length) {
      container.innerHTML = '<p class="painel-items-vazio">Nenhum item</p>';
      atualizarAlturaArvore();
      return;
    }

    container.innerHTML = estado.grupos
      .map((grupo) => {
        const exp = grupo.expandido !== false;
        const selGrupo = estado.selecionadosIds.has(grupo.id);
        const olhoGrupo = grupo.visivel ? 'fa-eye' : 'fa-eye-slash';

        const filhos = grupo.pecas
          .map((peca) => {
            const sel = estado.selecionadosIds.has(peca.id);
            const olho = peca.visivel ? 'fa-eye' : 'fa-eye-slash';
            const temFilamentos = peca.filamentos?.length >= 2;
            const expFil = peca.filamentosExpandido !== false;
            const swatchesPeca = temFilamentos ? '' : renderSwatchesCores(peca.cores);

            const subFilamentos = temFilamentos && expFil
              ? peca.filamentos
                  .map((fil) => {
                    const olhoFil = fil.visivel ? 'fa-eye' : 'fa-eye-slash';
                    const selFil = estado.selecionadosIds.has(fil.id);
                    return `
              <div class="painel-items-linha painel-items-linha--neto${selFil ? ' is-selecionado' : ''}" data-id="${fil.id}" data-tipo="filamento">
                ${renderSwatchesCores([fil.hex])}
                <span class="painel-items-nome" title="${escapeHtml(fil.nome)}">${escapeHtml(fil.nome)}</span>
                <button type="button" class="painel-items-olho" data-vis="${fil.id}" title="Mostrar/ocultar filamento" aria-label="Visibilidade">
                  <i class="fa-solid ${olhoFil}" aria-hidden="true"></i>
                </button>
              </div>`;
                  })
                  .join('')
              : '';

            const chevronFil = temFilamentos
              ? `<button type="button" class="painel-items-chevron painel-items-chevron--fil${expFil ? ' is-aberto' : ''}" data-expand-fil="${peca.id}" aria-label="Expandir filamentos">
                  ${expFil ? '▾' : '▸'}
                </button>`
              : '<span class="painel-items-chevron-spacer" aria-hidden="true"></span>';

            return `
              <div class="painel-items-peca-bloco">
                <div class="painel-items-linha painel-items-linha--filho${sel ? ' is-selecionado' : ''}" data-id="${peca.id}" data-tipo="peca">
                  ${chevronFil}
                  ${swatchesPeca}
                  <span class="painel-items-nome" title="${escapeHtml(peca.nome)}">${escapeHtml(peca.nome)}</span>
                  <button type="button" class="painel-items-olho" data-vis="${peca.id}" title="Mostrar/ocultar peça" aria-label="Visibilidade">
                    <i class="fa-solid ${olho}" aria-hidden="true"></i>
                  </button>
                </div>
                ${subFilamentos ? `<div class="painel-items-netos">${subFilamentos}</div>` : ''}
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

    atualizarAlturaArvore();
  }

  function ligarEventosArvore() {
    if (!container || container.dataset.itemsDelegacao === '1') return;
    container.dataset.itemsDelegacao = '1';

    container.addEventListener('click', (event) => {
      const olho = event.target.closest('.painel-items-olho');
      if (olho?.dataset.vis) {
        event.preventDefault();
        event.stopPropagation();
        alternarVisibilidade(olho.dataset.vis);
        return;
      }

      const swatch = event.target.closest('.painel-items-cor');
      if (swatch?.dataset.hex) {
        event.preventDefault();
        event.stopPropagation();
        app.onCorClicada?.(swatch.dataset.hex);
        return;
      }

      const expandFil = event.target.closest('[data-expand-fil]');
      if (expandFil) {
        event.preventDefault();
        event.stopPropagation();
        alternarFilamentosPeca(expandFil.getAttribute('data-expand-fil'));
        return;
      }

      const expandGrupo = event.target.closest('[data-expand]');
      if (expandGrupo) {
        event.preventDefault();
        event.stopPropagation();
        alternarGrupo(expandGrupo.dataset.expand);
        return;
      }

      const linha = event.target.closest('.painel-items-linha[data-id]');
      if (!linha) return;

      if (linha.dataset.tipo === 'peca') {
        const peca = encontrarPecaPorId(linha.dataset.id);
        if (pecaTemSubFilamentos(peca) && event.target.closest('.painel-items-chevron--fil')) {
          event.preventDefault();
          event.stopPropagation();
          alternarFilamentosPeca(linha.dataset.id);
          return;
        }
      }

      selecionar(linha.dataset.id, { ctrlKey: event.ctrlKey || event.metaKey });
    });
  }

  function sincronizarFilamentosPeca(peca, dadosFilamentos) {
    if (!dadosFilamentos?.length) return;

    const porUuid = new Map(dadosFilamentos.map((f) => [f.meshUuid, f]));
    const anteriores = new Map((peca.filamentos ?? []).map((f) => [f.meshUuid, f]));

    peca.filamentos = dadosFilamentos.map((f) => {
      const prev = anteriores.get(f.meshUuid);
      return {
        id: prev?.id ?? crypto.randomUUID(),
        nome: f.nome,
        hex: f.hex,
        meshUuid: f.meshUuid,
        slot: f.slot,
        visivel: prev?.visivel ?? true,
        object3d: prev?.object3d ?? null,
      };
    });

    for (const fil of peca.filamentos) {
      if (fil.object3d) continue;
      peca.object3d.traverse((child) => {
        if (child.uuid === fil.meshUuid) fil.object3d = child;
      });
    }
  }

  function atualizarCoresPecas(entradas) {
    const map = new Map((entradas || []).map((e) => [e.id, e]));
    for (const grupo of estado.grupos) {
      for (const peca of grupo.pecas) {
        const dados = map.get(peca.id);
        if (!dados) continue;
        peca.cores = dados.cores || [];
        sincronizarFilamentosPeca(peca, dados.filamentos);
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
        cores: p.cores ?? [],
        filamentosExpandido: true,
        filamentos: (p.filamentos ?? []).map((f) => ({
          id: crypto.randomUUID(),
          nome: f.nome,
          hex: f.hex,
          meshUuid: f.meshUuid,
          slot: f.slot,
          visivel: true,
          object3d: f.object3d,
        })),
      })),
    };
    estado.grupos.push(grupo);
    render();
    return grupo;
  }

  function limpar() {
    for (const g of [...estado.grupos]) removerGrupo(g.id);
    estado.selecionadosIds.clear();
    render();
  }

  /** Limpa só o estado UI (a cena já foi libertada noutro sítio). */
  function resetEstado() {
    estado.grupos = [];
    estado.selecionadosIds.clear();
    render();
  }

  function temItems() {
    return estado.grupos.length > 0;
  }

  function bindUi() {
    container = document.getElementById('painel-items-arvore');
    fileInput = document.getElementById('items-file-input');
    ligarEventosArvore();
    let modoAppend = false;

    function abrirSeletorFicheiros({ append } = {}) {
      if (append === false) {
        modoAppend = false;
      } else if (append === true) {
        modoAppend = true;
      } else {
        modoAppend = app.temModelosNaCena?.() ?? estado.grupos.length > 0;
      }
      fileInput?.click();
    }

    document.getElementById('items-btn-abrir')?.addEventListener('click', (event) => {
      abrirSeletorFicheiros({ append: event.shiftKey ? false : undefined });
    });

    document.getElementById('items-btn-remover')?.addEventListener('click', () => {
      colapsarFilamentos();
    });

    document.getElementById('items-btn-adicionar')?.addEventListener('click', () => {
      expandirFilamentos();
    });

    fileInput?.addEventListener('change', (e) => {
      const ficheiros = Array.from(e.target.files || []);
      e.target.value = '';
      if (ficheiros.length) {
        app.onFicheirosSelecionados?.(ficheiros, { append: modoAppend });
      }
    });

    window.addEventListener('resize', atualizarAlturaArvore);

    document.addEventListener('keydown', (event) => {
      if (event.target.matches('input, select, textarea, [contenteditable="true"]')) return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (!estado.selecionadosIds.size) return;
      event.preventDefault();
      removerSelecionados();
    });

    return { abrirSeletorFicheiros };
  }

  let abrirSeletorFicheiros = null;

  function bindUiWrapper() {
    const ui = bindUi();
    abrirSeletorFicheiros = ui.abrirSeletorFicheiros;
  }

  return {
    bindUi: bindUiWrapper,
    abrirSeletorFicheiros: (...args) => abrirSeletorFicheiros?.(...args),
    adicionarGrupo,
    limpar,
    resetEstado,
    temItems,
    render,
    atualizarCoresPecas,
    getGrupos: () => estado.grupos,
    getGruposSelecionados,
    selecionar,
    selecionarPorObject3d,
    limparSelecao,
    removerSelecionados,
  };
}
