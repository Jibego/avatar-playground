/* ============================================
   Avatar Playground — Application Logic
   ============================================ */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────
  const state = {
    name: '',
    saturation: 65,
    lightness: 45,
    fontSize: 40,
    letterSpacing: 0,
    fontWeight: 600,
    useFullNameColor: false,
    limitedPalette: false,
    darkMode: false,
    contrastLevel: 4.5,
    forceAAA: false,
    dataset: [],
  };

  // ── DOM refs ───────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const nameInput = $('#name-input');
  const avatarPreview = $('#avatar-preview');
  const avatarInitialsEl = $('#avatar-initials');
  const metaInitials = $('#meta-initials');
  const metaHex = $('#meta-hex');
  const metaHsl = $('#meta-hsl');
  const metaTextColor = $('#meta-text-color');
  const metaContrast = $('#meta-contrast');
  const metaWcag = $('#meta-wcag');
  const gridEl = $('#avatar-grid');
  const gridCount = $('#grid-count');
  const tooltip = $('#grid-tooltip');
  const hueCanvas = $('#hue-wheel');
  const distWarnings = $('#distribution-warnings');

  // ── Initials extraction ────────────────────────────
  const PREFIXES = new Set([
    'van', 'de', 'der', 'den', 'het', 'ter', 'ten', 'te',
    'la', 'le', 'les', 'du', 'des', 'von', 'zu', 'di', 'da', 'del', 'della',
    'el', 'al', 'bin', 'ibn',
  ]);

  function getInitials(name) {
    const trimmed = name.trim();
    if (!trimmed) return '?';

    const words = trimmed.split(/\s+/);
    const significant = words.filter(
      (w) => !PREFIXES.has(w.toLowerCase())
    );

    // If all words were prefixes, use the original words
    const source = significant.length > 0 ? significant : words;

    if (source.length === 1) {
      // Single word: take first character (handles unicode)
      return getFirstChar(source[0]).toUpperCase();
    }

    // Multiple words: first char of first and last significant word
    const first = getFirstChar(source[0]).toUpperCase();
    const last = getFirstChar(source[source.length - 1]).toUpperCase();
    return first + last;
  }

  function getFirstChar(str) {
    // Handle surrogate pairs / combining marks
    const segments = [...str];
    return segments.length > 0 ? segments[0] : '?';
  }

  // ── Deterministic hashing ─────────────────────────
  function hashString(str) {
    // Simple but effective: cyrb53-like hash
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }

  function nameToHue(name) {
    const basis = state.useFullNameColor
      ? name.trim().toLowerCase()
      : getInitials(name);
    const hash = hashString(basis);

    if (state.limitedPalette) {
      // 12 evenly spaced hues
      const bucket = Math.abs(hash) % 12;
      return bucket * 30;
    }

    return Math.abs(hash) % 360;
  }

  // ── Color utilities ────────────────────────────────
  function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  // Relative luminance (WCAG 2.1)
  function relativeLuminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  function contrastRatio(l1, l2) {
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function bestTextColor(bgR, bgG, bgB) {
    const bgLum = relativeLuminance(bgR, bgG, bgB);
    const whiteContrast = contrastRatio(1, bgLum);
    const blackContrast = contrastRatio(bgLum, 0);
    return whiteContrast >= blackContrast ? '#ffffff' : '#000000';
  }

  function getContrastInfo(bgR, bgG, bgB, textHex) {
    const bgLum = relativeLuminance(bgR, bgG, bgB);
    const textRgb = hexToRgb(textHex);
    const textLum = relativeLuminance(textRgb[0], textRgb[1], textRgb[2]);
    const ratio = contrastRatio(bgLum, textLum);
    return { ratio, bgLum, textLum };
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16),
    ];
  }

  function wcagLevel(ratio, requiredLevel) {
    if (ratio >= 7) return { label: 'AAA Pass', cssClass: 'wcag-pass-aaa' };
    if (ratio >= 4.5) {
      if (requiredLevel >= 7) return { label: 'AA Pass (AAA Fail)', cssClass: 'wcag-warn' };
      return { label: 'AA Pass', cssClass: 'wcag-pass-aa' };
    }
    if (ratio >= 3) return { label: 'Onvoldoende (AA Fail)', cssClass: 'wcag-warn' };
    return { label: 'Onvoldoende', cssClass: 'wcag-fail' };
  }

  // Adjust lightness to meet contrast requirement
  function adjustForContrast(h, s, l, requiredRatio) {
    // Try the original first
    let rgb = hslToRgb(h, s, l);
    let textHex = bestTextColor(...rgb);
    let info = getContrastInfo(...rgb, textHex);
    if (info.ratio >= requiredRatio) return l;

    // Determine direction: should we go darker or lighter?
    // If text is white, make background darker; if text is black, make background lighter
    if (textHex === '#ffffff') {
      // Darken background
      for (let tryL = l; tryL >= 10; tryL -= 1) {
        rgb = hslToRgb(h, s, tryL);
        info = getContrastInfo(...rgb, '#ffffff');
        if (info.ratio >= requiredRatio) return tryL;
      }
    } else {
      // Lighten background
      for (let tryL = l; tryL <= 90; tryL += 1) {
        rgb = hslToRgb(h, s, tryL);
        info = getContrastInfo(...rgb, '#000000');
        if (info.ratio >= requiredRatio) return tryL;
      }
    }
    return l; // fallback
  }

  // ── Avatar computation ────────────────────────────
  function computeAvatar(name) {
    const initials = getInitials(name);
    const hue = nameToHue(name);
    let s = state.saturation;
    let l = state.lightness;

    if (state.forceAAA) {
      l = adjustForContrast(hue, s, l, 7);
    }

    const rgb = hslToRgb(hue, s, l);
    const hex = rgbToHex(...rgb);
    const textColor = bestTextColor(...rgb);
    const contrastInfo = getContrastInfo(...rgb, textColor);
    const wcag = wcagLevel(contrastInfo.ratio, state.contrastLevel);

    return {
      name: name.trim(),
      initials,
      hue,
      saturation: s,
      lightness: l,
      rgb,
      hex,
      textColor,
      contrastRatio: contrastInfo.ratio,
      wcag,
    };
  }

  // ── Render single preview ─────────────────────────
  function renderSinglePreview() {
    const name = state.name;
    if (!name.trim()) {
      avatarPreview.style.backgroundColor = '#e5e7eb';
      avatarInitialsEl.textContent = '?';
      avatarInitialsEl.style.color = '#9ca3af';
      metaInitials.textContent = '—';
      metaHex.textContent = '—';
      metaHsl.textContent = '—';
      metaTextColor.textContent = '—';
      metaContrast.textContent = '—';
      metaWcag.textContent = '—';
      metaWcag.className = 'meta-value';
      return;
    }

    const av = computeAvatar(name);

    avatarPreview.style.backgroundColor = av.hex;
    avatarInitialsEl.textContent = av.initials;
    avatarInitialsEl.style.color = av.textColor;
    avatarInitialsEl.style.fontSize = `${state.fontSize}px`;
    avatarInitialsEl.style.letterSpacing = `${state.letterSpacing}px`;
    avatarInitialsEl.style.fontWeight = state.fontWeight;

    metaInitials.textContent = av.initials;
    metaHex.textContent = av.hex.toUpperCase();
    metaHsl.textContent = `hsl(${av.hue}, ${av.saturation}%, ${av.lightness}%)`;
    metaTextColor.textContent = av.textColor === '#ffffff' ? 'Wit (#FFF)' : 'Zwart (#000)';
    metaContrast.textContent = av.contrastRatio.toFixed(2) + ':1';
    metaWcag.textContent = av.wcag.label;
    metaWcag.className = 'meta-value ' + av.wcag.cssClass;
  }

  // ── Render grid ───────────────────────────────────
  function renderGrid() {
    gridEl.innerHTML = '';
    const names = state.dataset;
    gridCount.textContent = names.length > 0 ? `(${names.length})` : '';

    names.forEach((name) => {
      const av = computeAvatar(name);
      const item = document.createElement('div');
      item.className = 'avatar-grid-item';
      item.dataset.name = name;
      item.dataset.hex = av.hex;
      item.dataset.hsl = `hsl(${av.hue}, ${av.saturation}%, ${av.lightness}%)`;
      item.dataset.contrast = av.contrastRatio.toFixed(2);
      item.dataset.wcag = av.wcag.label;

      // Contrast dot
      let dotClass = 'pass';
      if (av.contrastRatio < 3) dotClass = 'fail';
      else if (av.contrastRatio < state.contrastLevel) dotClass = 'warn';

      item.innerHTML = `
        <div class="avatar avatar-small" style="background-color:${av.hex}">
          <span class="avatar-initials" style="color:${av.textColor};font-size:${Math.round(state.fontSize * 0.375)}px;letter-spacing:${state.letterSpacing}px;font-weight:${state.fontWeight}">${av.initials}</span>
        </div>
        <div class="contrast-dot ${dotClass}"></div>
        <span class="avatar-grid-name">${escapeHtml(name.split(' ')[0])}</span>
      `;

      item.addEventListener('mouseenter', showTooltip);
      item.addEventListener('mousemove', moveTooltip);
      item.addEventListener('mouseleave', hideTooltip);

      gridEl.appendChild(item);
    });

    renderDistribution(names);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Tooltip ───────────────────────────────────────
  function showTooltip(e) {
    const item = e.currentTarget;
    tooltip.innerHTML = `
      <div class="tt-name">${escapeHtml(item.dataset.name)}</div>
      <div class="tt-row"><span>HEX</span><span class="tt-val">${item.dataset.hex.toUpperCase()}</span></div>
      <div class="tt-row"><span>HSL</span><span class="tt-val">${item.dataset.hsl}</span></div>
      <div class="tt-row"><span>Contrast</span><span class="tt-val">${item.dataset.contrast}:1</span></div>
      <div class="tt-row"><span>WCAG</span><span class="tt-val">${item.dataset.wcag}</span></div>
    `;
    tooltip.classList.add('visible');
  }

  function moveTooltip(e) {
    tooltip.style.left = e.clientX + 12 + 'px';
    tooltip.style.top = e.clientY + 12 + 'px';
  }

  function hideTooltip() {
    tooltip.classList.remove('visible');
  }

  // ── Color distribution analysis ───────────────────
  function renderDistribution(names) {
    const ctx = hueCanvas.getContext('2d');
    const w = hueCanvas.width;
    const h = hueCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - 20;

    ctx.clearRect(0, 0, w, h);

    if (names.length === 0) return;

    // Draw hue wheel background
    for (let angle = 0; angle < 360; angle++) {
      const rad1 = ((angle - 1) * Math.PI) / 180;
      const rad2 = ((angle + 1) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, rad1 - Math.PI / 2, rad2 - Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = `hsl(${angle}, 40%, 85%)`;
      ctx.fill();
    }

    // Inner white/dark circle
    const isDark = state.darkMode;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 20, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
    ctx.fill();

    // Plot dots for each name
    const hues = [];
    names.forEach((name) => {
      const av = computeAvatar(name);
      hues.push(av.hue);

      const dotRadius = radius - 10;
      const rad = ((av.hue - 90) * Math.PI) / 180;
      const dx = cx + Math.cos(rad) * dotRadius;
      const dy = cy + Math.sin(rad) * dotRadius;

      ctx.beginPath();
      ctx.arc(dx, dy, 5, 0, Math.PI * 2);
      ctx.fillStyle = av.hex;
      ctx.fill();
      ctx.strokeStyle = isDark ? '#f1f5f9' : '#1a1a2e';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Center label
    ctx.fillStyle = isDark ? '#f1f5f9' : '#1a1a2e';
    ctx.font = '600 13px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${names.length} namen`, cx, cy - 8);
    ctx.font = '400 11px -apple-system, sans-serif';
    ctx.fillStyle = isDark ? '#94a3b8' : '#6b7280';
    ctx.fillText('hue spread', cx, cy + 8);

    // Analyze for collisions
    analyzeDistribution(hues, names);
  }

  function analyzeDistribution(hues, names) {
    distWarnings.innerHTML = '';

    if (names.length < 2) return;

    // Sort hues and find minimum gap
    const sorted = [...hues].sort((a, b) => a - b);
    let minGap = 360;
    let collisions = 0;
    const THRESHOLD = 10; // degrees

    for (let i = 0; i < sorted.length; i++) {
      const next = (i + 1) % sorted.length;
      let gap = sorted[next] - sorted[i];
      if (next === 0) gap = 360 - sorted[i] + sorted[0];
      if (gap < minGap) minGap = gap;
      if (gap < THRESHOLD) collisions++;
    }

    // Ideal spread
    const idealGap = 360 / names.length;

    if (collisions > 0) {
      addWarning(
        'warning',
        `${collisions} kleurpaar/paren liggen binnen ${THRESHOLD} graden van elkaar — mogelijk moeilijk te onderscheiden.`
      );
    }

    if (minGap < 5 && names.length > 3) {
      addWarning(
        'warning',
        `Minimale hue-afstand is slechts ${minGap.toFixed(1)}°. Overweeg een beperkt kleurenpalet of andere hash-strategie.`
      );
    }

    addWarning(
      'info',
      `Hue spread: min ${minGap.toFixed(1)}° | ideaal ${idealGap.toFixed(1)}° per naam | ${state.limitedPalette ? '12-kleurenpalet' : 'volledig spectrum'}`
    );
  }

  function addWarning(type, msg) {
    const div = document.createElement('div');
    div.className = `warning-item ${type}`;
    div.textContent = msg;
    distWarnings.appendChild(div);
  }

  // ── Random name generator ─────────────────────────
  const FIRST_NAMES = [
    'Emma', 'Noah', 'Sophie', 'Liam', 'Julia', 'Lucas', 'Mila', 'Daan',
    'Tess', 'Finn', 'Sara', 'Sem', 'Anna', 'Milan', 'Eva', 'James',
    'Olivia', 'Alexander', 'Maria', 'Mohammed', 'Fatima', 'Jan', 'Petra',
    'Pieter', 'Ingrid', 'Carlos', 'Jose', 'Yuki', 'Akira', 'Priya',
    'Lars', 'Freya', 'Bjorn', 'Astrid', 'Marco', 'Isabella', 'Andre',
    'Chen', 'Wei', 'Aisha', 'Omar', 'Elena', 'Viktor', 'Anastasia',
    'Dmitri', 'Sakura', 'Hiroshi', 'Amara', 'Kwame', 'Zara',
  ];

  const LAST_NAMES = [
    'de Vries', 'Jansen', 'van den Berg', 'van Dijk', 'Bakker',
    'Janssen', 'Visser', 'de Boer', 'Mulder', 'de Groot',
    'Bos', 'Vos', 'Peters', 'Hendriks', 'van Leeuwen',
    'Dekker', 'Brouwer', 'de Wit', 'Dijkstra', 'Smit',
    'Smith', 'Johnson', 'Williams', 'Brown', 'Garcia',
    'Mueller', 'Schmidt', 'Schneider', 'Fischer', 'Weber',
    'Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi',
    'Tanaka', 'Watanabe', 'Yamamoto', 'Nakamura', 'Kobayashi',
    'Johansson', 'Andersson', 'Nilsson', 'Eriksson', 'Larsson',
    'van der Linden', 'ter Haar', 'ten Brink', 'van Houten', 'de Jong',
  ];

  function generateRandomNames(count) {
    const names = [];
    const used = new Set();
    while (names.length < count) {
      const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
      const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
      const full = first + ' ' + last;
      if (!used.has(full)) {
        used.add(full);
        names.push(full);
      }
      // Safety valve
      if (used.size >= FIRST_NAMES.length * LAST_NAMES.length) break;
    }
    return names;
  }

  // ── Design token export ───────────────────────────
  function exportDesignTokens() {
    const names = state.dataset.length > 0 ? state.dataset : (state.name.trim() ? [state.name.trim()] : []);
    if (names.length === 0) {
      alert('Geen namen beschikbaar om te exporteren. Voer een naam in of genereer een dataset.');
      return;
    }

    const tokens = {
      'avatar-color-strategy': {
        description: 'Avatar kleurstrategie — gegenereerd door Avatar Playground',
        settings: {
          saturation: state.saturation,
          lightness: state.lightness,
          palette: state.limitedPalette ? 'limited-12' : 'full-spectrum',
          'color-basis': state.useFullNameColor ? 'full-name' : 'initials',
          'forced-contrast': state.forceAAA ? 'AAA' : 'none',
        },
        colors: {},
      },
    };

    names.forEach((name) => {
      const av = computeAvatar(name);
      const key = name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      tokens['avatar-color-strategy'].colors[key] = {
        name: name.trim(),
        initials: av.initials,
        background: av.hex,
        'text-color': av.textColor,
        hsl: `hsl(${av.hue}, ${av.saturation}%, ${av.lightness}%)`,
        'contrast-ratio': Number(av.contrastRatio.toFixed(2)),
        wcag: av.wcag.label,
      };
    });

    const json = JSON.stringify(tokens, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'avatar-design-tokens.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Full render ───────────────────────────────────
  function render() {
    renderSinglePreview();
    renderGrid();
  }

  // ── Event bindings ────────────────────────────────
  function init() {
    // Name input
    nameInput.addEventListener('input', (e) => {
      state.name = e.target.value;
      render();
    });

    // Toggles
    $('#toggle-fullname-color').addEventListener('change', (e) => {
      state.useFullNameColor = e.target.checked;
      render();
    });

    $('#toggle-limited-palette').addEventListener('change', (e) => {
      state.limitedPalette = e.target.checked;
      render();
    });

    $('#toggle-dark-mode').addEventListener('change', (e) => {
      state.darkMode = e.target.checked;
      document.body.classList.toggle('dark-mode', state.darkMode);
      render();
    });

    // Sliders
    $('#slider-saturation').addEventListener('input', (e) => {
      state.saturation = Number(e.target.value);
      $('#val-saturation').textContent = state.saturation;
      render();
    });

    $('#slider-lightness').addEventListener('input', (e) => {
      state.lightness = Number(e.target.value);
      $('#val-lightness').textContent = state.lightness;
      render();
    });

    $('#slider-font-size').addEventListener('input', (e) => {
      state.fontSize = Number(e.target.value);
      $('#val-font-size').textContent = state.fontSize;
      render();
    });

    $('#slider-letter-spacing').addEventListener('input', (e) => {
      state.letterSpacing = Number(e.target.value);
      $('#val-letter-spacing').textContent = state.letterSpacing;
      render();
    });

    // Font weight
    $('#select-font-weight').addEventListener('change', (e) => {
      state.fontWeight = e.target.value;
      render();
    });

    // Contrast level
    $('#select-contrast-level').addEventListener('change', (e) => {
      state.contrastLevel = Number(e.target.value);
      render();
    });

    $('#toggle-force-aaa').addEventListener('change', (e) => {
      state.forceAAA = e.target.checked;
      render();
    });

    // Dataset buttons
    $('#btn-generate-dataset').addEventListener('click', () => {
      state.dataset = generateRandomNames(50);
      render();
    });

    $('#btn-clear-dataset').addEventListener('click', () => {
      state.dataset = [];
      render();
    });

    // Export
    $('#btn-export-tokens').addEventListener('click', exportDesignTokens);

    // Initial render
    render();
  }

  // ── Boot ──────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
