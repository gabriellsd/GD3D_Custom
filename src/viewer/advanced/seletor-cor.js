import { normalizarHexCor } from "./cores-modelo.js";

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function hexParaRgb(hex) {
  const norm = normalizarHexCor(hex);
  if (!norm) return { r: 204, g: 204, b: 204 };
  return {
    r: parseInt(norm.slice(1, 3), 16),
    g: parseInt(norm.slice(3, 5), 16),
    b: parseInt(norm.slice(5, 7), 16),
  };
}

function rgbParaHex(r, g, b) {
  const p = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${p(r)}${p(g)}${p(b)}`.toUpperCase();
}

function rgbParaHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  const v = max;
  const s = max === 0 ? 0 : d / max;

  if (d !== 0) {
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
        break;
      case gn:
        h = ((bn - rn) / d + 2) / 6;
        break;
      default:
        h = ((rn - gn) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s, v };
}

function hsvParaRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];

  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

function estadoFromHex(hex) {
  const { r, g, b } = hexParaRgb(hex);
  const hsv = rgbParaHsv(r, g, b);
  return { h: hsv.h, s: hsv.s, v: hsv.v };
}

function hexFromEstado(estado) {
  const { r, g, b } = hsvParaRgb(estado.h, estado.s, estado.v);
  return rgbParaHex(r, g, b);
}

export function criarSeletorCor() {
  let root = null;
  let aberto = false;
  let estado = { h: 0, s: 1, v: 1 };
  let onAlterar = null;
  let onFechar = null;
  let arrastandoSv = false;
  let arrastandoHue = false;
  let ignorarInputHex = false;

  let elSv;
  let elSvCursor;
  let elHue;
  let elHueCursor;
  let elPreview;
  let elHexInput;

  function emitirAlteracao() {
    const hex = hexFromEstado(estado);
    onAlterar?.(hex);
    return hex;
  }

  function atualizarUi({ emitir = true } = {}) {
    const hex = hexFromEstado(estado);
    elSv.style.backgroundColor = `hsl(${estado.h} 100% 50%)`;
    elSvCursor.style.left = `${estado.s * 100}%`;
    elSvCursor.style.top = `${(1 - estado.v) * 100}%`;
    elHueCursor.style.left = `${(estado.h / 360) * 100}%`;
    elPreview.style.backgroundColor = hex;
    ignorarInputHex = true;
    elHexInput.value = hex;
    ignorarInputHex = false;
    if (emitir) emitirAlteracao();
  }

  function posicionar(anchor) {
    if (!root || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const viewer = document.querySelector(".viewer");
    const viewerRect = viewer?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

    root.style.visibility = "hidden";
    root.classList.remove("hidden");
    const popW = root.offsetWidth || 220;
    const popH = root.offsetHeight || 260;

    let left = rect.left - viewerRect.left;
    let top = rect.bottom - viewerRect.top + 8;

    if (left + popW > viewerRect.width - 8) {
      left = Math.max(8, viewerRect.width - popW - 8);
    }
    if (top + popH > viewerRect.height - 8) {
      top = rect.top - viewerRect.top - popH - 8;
    }

    root.style.left = `${Math.max(8, left)}px`;
    root.style.top = `${Math.max(8, top)}px`;
    root.style.visibility = "";
  }

  function fechar() {
    if (!aberto) return;
    aberto = false;
    arrastandoSv = false;
    arrastandoHue = false;
    root?.classList.add("hidden");
    onFechar?.();
  }

  function definirFromHex(hex, { emitir = true } = {}) {
    estado = estadoFromHex(hex);
    atualizarUi({ emitir });
  }

  function atualizarFromSvEvent(event) {
    const rect = elSv.getBoundingClientRect();
    estado.s = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    estado.v = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
    atualizarUi({ emitir: true });
  }

  function atualizarFromHueEvent(event) {
    const rect = elHue.getBoundingClientRect();
    estado.h = clamp(((event.clientX - rect.left) / rect.width) * 360, 0, 359.999);
    atualizarUi({ emitir: true });
  }

  function montar() {
    root = document.createElement("div");
    root.className = "seletor-cor-popover hidden";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Seletor de cor");
    root.innerHTML = `
      <div class="seletor-cor-sv" tabindex="0" aria-label="Saturação e brilho">
        <div class="seletor-cor-sv-white"></div>
        <div class="seletor-cor-sv-black"></div>
        <span class="seletor-cor-cursor" aria-hidden="true"></span>
      </div>
      <div class="seletor-cor-hue" tabindex="0" aria-label="Matiz">
        <span class="seletor-cor-hue-cursor" aria-hidden="true"></span>
      </div>
      <div class="seletor-cor-hex-row">
        <span class="seletor-cor-preview" aria-hidden="true"></span>
        <label class="seletor-cor-hex-label">
          <span class="seletor-cor-hex-titulo">HEX</span>
          <input type="text" class="seletor-cor-hex-input" maxlength="7" spellcheck="false" autocomplete="off" />
        </label>
      </div>`;

    document.querySelector(".viewer")?.appendChild(root);

    elSv = root.querySelector(".seletor-cor-sv");
    elSvCursor = root.querySelector(".seletor-cor-cursor");
    elHue = root.querySelector(".seletor-cor-hue");
    elHueCursor = root.querySelector(".seletor-cor-hue-cursor");
    elPreview = root.querySelector(".seletor-cor-preview");
    elHexInput = root.querySelector(".seletor-cor-hex-input");

    elSv.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      arrastandoSv = true;
      elSv.setPointerCapture(event.pointerId);
      atualizarFromSvEvent(event);
    });

    elHue.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      arrastandoHue = true;
      elHue.setPointerCapture(event.pointerId);
      atualizarFromHueEvent(event);
    });

    elSv.addEventListener("pointermove", (event) => {
      if (!arrastandoSv) return;
      atualizarFromSvEvent(event);
    });

    elHue.addEventListener("pointermove", (event) => {
      if (!arrastandoHue) return;
      atualizarFromHueEvent(event);
    });

    const pararArrasto = () => {
      arrastandoSv = false;
      arrastandoHue = false;
    };
    elSv.addEventListener("pointerup", pararArrasto);
    elSv.addEventListener("pointercancel", pararArrasto);
    elHue.addEventListener("pointerup", pararArrasto);
    elHue.addEventListener("pointercancel", pararArrasto);

    elHexInput.addEventListener("input", () => {
      if (ignorarInputHex) return;
      const hex = normalizarHexCor(elHexInput.value);
      if (!hex) return;
      definirFromHex(hex, { emitir: true });
    });

    elHexInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        elHexInput.blur();
      }
      event.stopPropagation();
    });

    root.addEventListener("pointerdown", (event) => event.stopPropagation());

    document.addEventListener("pointerdown", (event) => {
      if (!aberto || root.contains(event.target)) return;
      fechar();
    });

    document.addEventListener("keydown", (event) => {
      if (!aberto) return;
      if (event.key === "Escape") fechar();
    });
  }

  function abrir({ anchor, hexInicial = "#FFFFFF", onChange, onClose } = {}) {
    if (!root) montar();
    onAlterar = onChange ?? null;
    onFechar = onClose ?? null;
    aberto = true;
    definirFromHex(hexInicial, { emitir: false });
    posicionar(anchor);
    root.classList.remove("hidden");
    emitirAlteracao();
    elHexInput?.focus();
    elHexInput?.select();
  }

  return { abrir, fechar, estaAberto: () => aberto };
}
