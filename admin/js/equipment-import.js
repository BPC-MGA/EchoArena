import { requireAdmin, logoutAdmin } from './admin-auth.js';

/* =========================================================
   IMPORTAÇÃO DE EQUIPAMENTO POR PRINT — EM LOTE

   Um equipamento gera até 11 prints, um por raridade. Fazer
   um de cada vez é inviável, então este módulo trabalha o
   conjunto inteiro de uma vez:

     1. Você seleciona todos os prints juntos
     2. Marca o recorte UMA vez — vale para todos, porque o
        painel do jogo fica sempre na mesma posição
     3. Um único motor de OCR processa a fila inteira
     4. Os resultados são fundidos em um só equipamento

   Nada é salvo automaticamente: tudo passa pela revisão.
   ========================================================= */

await requireAdmin();
document.getElementById('logout').onclick = logoutAdmin;

/* =========================================================
   VOCABULÁRIO DO JOGO
========================================================= */

const RARITIES = [
  { slug: 'comum',      label: 'Comum' },
  { slug: 'raro',       label: 'Raro' },
  { slug: 'epico',      label: 'Épico' },
  { slug: 'lendario',   label: 'Lendário' },
  { slug: 'mitico',     label: 'Mítico' },
  { slug: 'supremo',    label: 'Supremo' },
  { slug: 'grandioso',  label: 'Grandioso' },
  { slug: 'celestial',  label: 'Celestial' },
  { slug: 'estelar',    label: 'Estelar' },
  { slug: 'imortal',    label: 'Imortal' },
  { slug: 'divino',     label: 'Divino' }
];

const STATS = [
  {
    key: 'vision_range',
    label: 'Alcance de visão do herói',
    percent: false,
    keywords: ['alcance', 'visao', 'heroi']
  },
  {
    key: 'weapon_damage_to_armor_pct',
    label: 'Dano da arma à armadura do inimigo',
    percent: true,
    keywords: ['dano', 'arma', 'armadura', 'inimigo']
  },
  {
    key: 'weapon_damage_to_health_pct',
    label: 'Dano da arma à vida do inimigo',
    percent: true,
    keywords: ['dano', 'arma', 'vida', 'inimigo']
  },
  {
    key: 'weapon_range_franco',
    label: 'Alcance de tiro com mira do herói',
    percent: false,
    keywords: ['alcance', 'tiro', 'mira']
  },
  {
    key: 'special_ability_cooldown_pct',
    label: 'Tempo de recarregamento da arma',
    percent: true,
    keywords: ['tempo', 'recarregamento', 'arma']
  },
  {
    key: 'weapon_swap_time_pct',
    label: 'Tempo de troca de modo da arma',
    percent: true,
    keywords: ['tempo', 'troca', 'modo', 'arma']
  },
  {
    key: 'crate_opening_cooldown_pct',
    label: 'Tempo de abertura de caixa',
    percent: true,
    keywords: ['tempo', 'abertura', 'caixa']
  }
];

/* =========================================================
   ELEMENTOS
========================================================= */

const $ = (id) => document.getElementById(id);

const fileInput = $('screenshot');
const zone = $('dropzone');
const raw = $('raw-text');
const status = $('ocr-status');
const reviewArea = $('review-area');
const sendButton = $('send-editor');
const extractButton = $('extract');
const reviewButton = $('review');

fileInput.multiple = true;

/* =========================================================
   ESTADO
========================================================= */

/* shots: [{ name, image, crop, text, parsed }] */
let shots = [];
let activeIndex = 0;
let merged = null;

const options = {
  invert: true,
  threshold: 55,
  scale: 3,
  sharedCrop: true
};

/* =========================================================
   TEXTO
========================================================= */

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%+\-\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function similarity(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);

  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return 1 - matrix[a.length][b.length] / Math.max(a.length, b.length);
}

/* =========================================================
   INTERFACE
========================================================= */

function injectStyles() {
  if ($('imp-style')) return;

  const style = document.createElement('style');
  style.id = 'imp-style';

  style.textContent = `
    #ocr-toolbar{margin-top:12px}
    #ocr-toolbar .ocr-row{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
    #ocr-toolbar .ocr-check{display:flex;align-items:center;gap:7px;font-size:12px;color:#c8cfdd}
    #ocr-toolbar .ocr-check input{width:17px;height:17px;margin:0}
    #ocr-toolbar .ocr-slider{display:flex;align-items:center;gap:8px;font-size:12px;color:#c8cfdd}
    #ocr-toolbar .ocr-slider input{width:100px}
    #ocr-toolbar .ocr-slider output{min-width:28px;color:#9da8bd;font-size:11px}
    #ocr-toolbar .ocr-hint{margin-top:10px;color:#9da8bd;font-size:11.5px;line-height:1.6}

    #ocr-strip{display:flex;gap:8px;margin-top:12px;padding-bottom:6px;
      overflow-x:auto;scrollbar-width:thin}
    #ocr-strip .thumb{position:relative;flex:0 0 84px;height:60px;border-radius:9px;
      overflow:hidden;border:2px solid #26344f;background:#05080f;cursor:pointer}
    #ocr-strip .thumb.is-active{border-color:#8b5cf6}
    #ocr-strip .thumb.is-done{border-color:#28613c}
    #ocr-strip .thumb img{width:100%;height:100%;object-fit:cover;opacity:.75}
    #ocr-strip .thumb .tag{position:absolute;left:0;right:0;bottom:0;padding:2px 4px;
      background:rgba(5,8,15,.85);color:#c8cfdd;font-size:8.5px;text-align:center;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

    #ocr-canvas-wrap{position:relative;margin-top:12px;overflow:hidden;
      border:1px solid #26344f;border-radius:11px;background:#05080f}
    #ocr-canvas{display:block;width:100%;cursor:crosshair;user-select:none;touch-action:none}
    #ocr-crop-box{position:absolute;border:2px dashed #b99eff;
      background:rgba(139,92,246,.15);pointer-events:none;display:none}

    #ocr-preview-wrap{margin-top:12px}
    #ocr-preview-wrap h4{margin-bottom:7px;color:#9da8bd;font-size:10.5px;
      font-weight:800;letter-spacing:.1em;text-transform:uppercase}
    #ocr-preview{display:block;width:100%;border:1px solid #26344f;
      border-radius:11px;background:#fff}

    .ocr-warn{margin-top:10px;padding:11px 13px;border:1px solid #6f5618;
      border-radius:10px;background:#2a2009;color:#ffd76d;font-size:11.5px;line-height:1.6}

    .imp-card{margin-bottom:16px;padding:18px;border:1px solid #26344f;
      border-radius:14px;background:#0f1728}
    .imp-card h3{display:flex;align-items:baseline;gap:10px;margin-bottom:14px;font-size:16px}
    .imp-card h3 small{color:#65718a;font-size:11px;font-weight:500}
    .imp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .imp-grid label{display:block;color:#c8cfdd;font-size:12px;font-weight:600}
    .imp-grid label.full{grid-column:1/-1}
    .imp-grid input,.imp-grid textarea{margin-top:6px}

    .imp-rarity{margin-bottom:12px;padding:13px;border:1px solid #26344f;
      border-radius:11px;background:#09111f}
    .imp-rarity-head{display:flex;justify-content:space-between;align-items:center;
      gap:12px;margin-bottom:10px}
    .imp-rarity-head strong{font-size:13px;text-transform:uppercase;letter-spacing:.05em}
    .imp-rarity-head .eq-btn{min-height:32px;padding:6px 11px;font-size:10.5px}
    .imp-source{color:#65718a;font-size:10px}
    .imp-stats{display:grid;gap:8px}
    .imp-stat{display:grid;grid-template-columns:minmax(0,1.6fr) 110px minmax(0,1fr) 38px;
      gap:8px;align-items:center}
    .imp-stat select,.imp-stat input{min-height:38px;font-size:12px}
    .imp-stat-raw{color:#65718a;font-size:10.5px;white-space:nowrap;
      overflow:hidden;text-overflow:ellipsis}
    .imp-stat .eq-btn,.imp-bonus .eq-btn{min-height:38px;padding:0;font-size:12px}
    .imp-bonus{display:grid;grid-template-columns:90px minmax(0,1fr) minmax(0,1.6fr) 38px;
      gap:8px;margin-bottom:8px}
    .imp-bonus input{min-height:38px;font-size:12px}

    .imp-missing{margin-top:10px;padding:10px 12px;border:1px dashed #6f5618;
      border-radius:10px;color:#ffd76d;font-size:11px;line-height:1.6}

    @media(max-width:820px){
      .imp-grid{grid-template-columns:1fr}
      .imp-stat,.imp-bonus{grid-template-columns:1fr}
      .imp-stat-raw{white-space:normal}
    }
  `;

  document.head.appendChild(style);
}

function buildToolbar() {
  if ($('ocr-toolbar')) return;

  const bar = document.createElement('div');
  bar.id = 'ocr-toolbar';

  bar.innerHTML = `
    <div class="ocr-row">
      <label class="ocr-check">
        <input type="checkbox" id="opt-invert" checked>
        Inverter cores
      </label>

      <label class="ocr-check">
        <input type="checkbox" id="opt-shared" checked>
        Mesmo recorte para todos
      </label>

      <label class="ocr-slider">
        Contraste
        <input type="range" id="opt-threshold" min="20" max="85" value="55">
        <output id="opt-threshold-value">55</output>
      </label>

      <label class="ocr-slider">
        Escala
        <input type="range" id="opt-scale" min="2" max="5" step="1" value="3">
        <output id="opt-scale-value">3×</output>
      </label>

      <button type="button" class="eq-btn" id="opt-reset-crop">Limpar recorte</button>
    </div>

    <p class="ocr-hint">
      Marque com o mouse <strong>apenas o painel de efeitos</strong> em um print.
      Como o jogo desenha o painel sempre no mesmo lugar, o mesmo recorte vale
      para os outros — leia todos de uma vez.
    </p>
  `;

  zone.parentElement.insertBefore(bar, zone.nextSibling);

  $('opt-invert').addEventListener('change', (event) => {
    options.invert = event.target.checked;
    renderPreview();
  });

  $('opt-shared').addEventListener('change', (event) => {
    options.sharedCrop = event.target.checked;
  });

  $('opt-threshold').addEventListener('input', (event) => {
    options.threshold = Number(event.target.value);
    $('opt-threshold-value').textContent = event.target.value;
    renderPreview();
  });

  $('opt-scale').addEventListener('input', (event) => {
    options.scale = Number(event.target.value);
    $('opt-scale-value').textContent = `${event.target.value}×`;
  });

  $('opt-reset-crop').addEventListener('click', () => {
    shots.forEach(shot => { shot.crop = null; });
    $('ocr-crop-box').style.display = 'none';
    renderPreview();
  });
}

function buildWorkArea() {
  if ($('ocr-canvas-wrap')) return;

  const strip = document.createElement('div');
  strip.id = 'ocr-strip';

  const wrap = document.createElement('div');
  wrap.id = 'ocr-canvas-wrap';
  wrap.innerHTML = `
    <canvas id="ocr-canvas"></canvas>
    <div id="ocr-crop-box"></div>
  `;

  const preview = document.createElement('div');
  preview.id = 'ocr-preview-wrap';
  preview.innerHTML = `
    <h4>Como o leitor enxerga</h4>
    <canvas id="ocr-preview"></canvas>
  `;

  const toolbar = $('ocr-toolbar');
  toolbar.parentElement.insertBefore(strip, toolbar.nextSibling);
  strip.parentElement.insertBefore(wrap, strip.nextSibling);
  wrap.parentElement.insertBefore(preview, wrap.nextSibling);

  strip.addEventListener('click', (event) => {
    const thumb = event.target.closest('.thumb');
    if (!thumb) return;

    activeIndex = Number(thumb.dataset.index);
    renderStrip();
    renderPreview();
  });

  bindCropSelection();
}

function renderStrip() {
  const strip = $('ocr-strip');
  if (!strip) return;

  strip.innerHTML = shots.map((shot, index) => `
    <div class="thumb ${index === activeIndex ? 'is-active' : ''} ${shot.text ? 'is-done' : ''}"
         data-index="${index}">
      <img src="${shot.url}" alt="">
      <span class="tag">${escapeHtml(shot.label || `#${index + 1}`)}</span>
    </div>
  `).join('');
}

/* =========================================================
   RECORTE
========================================================= */

function currentShot() {
  return shots[activeIndex] || null;
}

function effectiveCrop(shot) {
  if (!shot) return null;
  if (shot.crop) return shot.crop;

  if (options.sharedCrop) {
    const reference = shots.find(item => item.crop);
    if (reference) return reference.crop;
  }

  return null;
}

function bindCropSelection() {
  const canvas = $('ocr-canvas');
  const box = $('ocr-crop-box');

  let dragging = false;
  let startX = 0;
  let startY = 0;

  canvas.addEventListener('pointerdown', (event) => {
    const shot = currentShot();
    if (!shot) return;

    dragging = true;
    canvas.setPointerCapture(event.pointerId);

    const rect = canvas.getBoundingClientRect();
    startX = event.clientX - rect.left;
    startY = event.clientY - rect.top;

    box.style.display = 'block';
    box.style.left = `${startX}px`;
    box.style.top = `${startY}px`;
    box.style.width = '0px';
    box.style.height = '0px';
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    box.style.left = `${Math.min(startX, x)}px`;
    box.style.top = `${Math.min(startY, y)}px`;
    box.style.width = `${Math.abs(x - startX)}px`;
    box.style.height = `${Math.abs(y - startY)}px`;
  });

  function finish() {
    if (!dragging) return;
    dragging = false;

    const shot = currentShot();
    if (!shot) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = shot.image.naturalWidth / rect.width;

    const left = parseFloat(box.style.left);
    const top = parseFloat(box.style.top);
    const width = parseFloat(box.style.width);
    const height = parseFloat(box.style.height);

    if (width < 20 || height < 20) {
      shot.crop = null;
      box.style.display = 'none';
    } else {
      /* Guarda em proporção (0 a 1) para funcionar mesmo se
         os prints tiverem resoluções diferentes. */
      shot.crop = {
        x: (left * ratio) / shot.image.naturalWidth,
        y: (top * ratio) / shot.image.naturalHeight,
        w: (width * ratio) / shot.image.naturalWidth,
        h: (height * ratio) / shot.image.naturalHeight
      };
    }

    renderPreview();
  }

  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
}

/* =========================================================
   PREPARO DA IMAGEM
========================================================= */

function buildProcessedCanvas(shot) {
  if (!shot) return null;

  const image = shot.image;
  const relative = effectiveCrop(shot);

  const area = relative
    ? {
        x: relative.x * image.naturalWidth,
        y: relative.y * image.naturalHeight,
        w: relative.w * image.naturalWidth,
        h: relative.h * image.naturalHeight
      }
    : { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };

  const scale = options.scale;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(area.w * scale));
  canvas.height = Math.max(1, Math.round(area.h * scale));

  const context = canvas.getContext('2d', { willReadFrequently: true });

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  context.drawImage(
    image,
    area.x, area.y, area.w, area.h,
    0, 0, canvas.width, canvas.height
  );

  const buffer = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = buffer.data;
  const cut = (options.threshold / 100) * 255;

  for (let i = 0; i < data.length; i += 4) {
    let value = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

    if (options.invert) value = 255 - value;

    value = value > cut ? 255 : 0;

    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  context.putImageData(buffer, 0, 0);

  return canvas;
}

function renderPreview() {
  const shot = currentShot();
  if (!shot) return;

  const canvas = $('ocr-canvas');
  const context = canvas.getContext('2d');

  canvas.width = shot.image.naturalWidth;
  canvas.height = shot.image.naturalHeight;
  context.drawImage(shot.image, 0, 0);

  /* Desenha o recorte herdado, se houver. */
  const box = $('ocr-crop-box');
  const relative = effectiveCrop(shot);

  if (relative) {
    const rect = canvas.getBoundingClientRect();

    box.style.display = 'block';
    box.style.left = `${relative.x * rect.width}px`;
    box.style.top = `${relative.y * rect.height}px`;
    box.style.width = `${relative.w * rect.width}px`;
    box.style.height = `${relative.h * rect.height}px`;
  } else {
    box.style.display = 'none';
  }

  const processed = buildProcessedCanvas(shot);
  if (!processed) return;

  const preview = $('ocr-preview');
  preview.width = processed.width;
  preview.height = processed.height;
  preview.getContext('2d').drawImage(processed, 0, 0);
}

/* =========================================================
   AVISOS
========================================================= */

function showWarnings() {
  document.querySelectorAll('.ocr-warn').forEach(item => item.remove());

  const warnings = [];
  const shot = currentShot();

  if (shot && !effectiveCrop(shot)) {
    const ratio = shot.image.naturalWidth / shot.image.naturalHeight;

    if (ratio > 2.2 || shot.image.naturalWidth > 2200) {
      warnings.push(
        'A imagem parece conter vários painéis juntos. Marque com o mouse ' +
        'apenas o painel de efeitos de um item.'
      );
    }
  }

  if (!warnings.length) return;

  const container = document.createElement('div');
  container.className = 'ocr-warn';
  container.innerHTML = warnings.map(escapeHtml).join('<br><br>');

  status.parentElement.insertBefore(container, status);
}

/* =========================================================
   LEITURA ESTRUTURADA
========================================================= */

function matchRarity(line) {
  const clean = normalize(line);
  if (!clean || clean.length > 22) return null;

  const letters = clean.replace(/[^a-z]/g, '');
  if (letters.length < 4) return null;

  let best = null;
  let bestScore = 0;

  for (const rarity of RARITIES) {
    const score = similarity(letters, normalize(rarity.label));

    if (score > bestScore) {
      bestScore = score;
      best = rarity;
    }
  }

  return bestScore >= 0.72 ? best : null;
}

function matchStat(line) {
  const clean = normalize(line);

  const numberMatch = clean.match(/([+-]?\s*\d+(?:[.,]\d+)?)\s*(%?)/);
  if (!numberMatch) return null;

  const value = Number(String(numberMatch[1]).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(value)) return null;

  const isPercent = numberMatch[2] === '%' || clean.includes('%');

  let best = null;
  let bestScore = 0;

  for (const stat of STATS) {
    const hits = stat.keywords.filter(word => clean.includes(word)).length;
    const score = hits / stat.keywords.length + (stat.percent === isPercent ? 0.12 : 0);

    if (score > bestScore) {
      bestScore = score;
      best = stat;
    }
  }

  if (!best || bestScore < 0.5) {
    return { key: null, label: line.trim(), value, percent: isPercent, raw: line.trim() };
  }

  return {
    key: best.key,
    label: best.label,
    value,
    percent: best.percent,
    raw: line.trim()
  };
}

function matchSetBonusHeader(line) {
  const clean = normalize(line);
  if (!clean.includes('equipamento')) return null;

  const numberMatch = clean.match(/(\d+)/);
  return numberMatch ? Number(numberMatch[1]) : null;
}

function parseText(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const result = {
    name: '',
    setName: '',
    variants: {},
    bonuses: []
  };

  for (const line of lines.slice(0, 12)) {
    const clean = normalize(line);

    if (!result.setName && clean.includes('conjunto')) {
      result.setName = line
        .replace(/conjunto\s*(de\s*equipamento[s]?)?/i, '')
        .replace(/\(\s*\d+\s*\/\s*\d+\s*\)/, '')
        .trim();
      continue;
    }

    if (!result.name && line.length >= 4 && !matchRarity(line) && !matchStat(line)) {
      result.name = line.replace(/\s{2,}/g, ' ').trim();
    }
  }

  let currentRarity = null;
  let currentBonus = null;

  for (const line of lines) {
    const rarity = matchRarity(line);

    if (rarity) {
      currentRarity = rarity.slug;
      currentBonus = null;
      if (!result.variants[currentRarity]) result.variants[currentRarity] = [];
      continue;
    }

    const pieces = matchSetBonusHeader(line);

    if (pieces) {
      currentBonus = {
        required_pieces: pieces,
        title: `Bônus de ${pieces} peças`,
        description: ''
      };

      result.bonuses.push(currentBonus);
      currentRarity = null;
      continue;
    }

    const stat = matchStat(line);
    if (!stat) continue;

    if (currentBonus) {
      currentBonus.description = currentBonus.description
        ? `${currentBonus.description} · ${stat.raw}`
        : stat.raw;
      continue;
    }

    if (currentRarity) {
      result.variants[currentRarity].push(stat);
    }
  }

  for (const [slug, attrs] of Object.entries(result.variants)) {
    if (!attrs.length) delete result.variants[slug];
  }

  return result;
}

/* =========================================================
   FUSÃO DOS PRINTS

   Cada print traz uma raridade expandida. Juntamos tudo num
   equipamento só, escolhendo o valor mais frequente quando
   houver divergência entre leituras.
========================================================= */

function mostFrequent(values) {
  const tally = new Map();

  values.filter(Boolean).forEach(value => {
    const clean = String(value).trim();
    if (!clean) return;
    tally.set(clean, (tally.get(clean) ?? 0) + 1);
  });

  let best = '';
  let bestCount = 0;

  for (const [value, count] of tally) {
    if (count > bestCount || (count === bestCount && value.length > best.length)) {
      best = value;
      bestCount = count;
    }
  }

  return best;
}

function mergeShots() {
  const readable = shots.filter(shot => shot.parsed);

  const result = {
    name: mostFrequent(readable.map(shot => shot.parsed.name)),
    setName: mostFrequent(readable.map(shot => shot.parsed.setName)),
    description: '',
    recommendation: '',
    variants: {},
    bonuses: [],
    sources: {}
  };

  /* Atributos por raridade: o print que trouxe mais atributos
     reconhecidos para aquela raridade vence. */
  for (const shot of readable) {
    for (const [slug, attrs] of Object.entries(shot.parsed.variants)) {
      const known = attrs.filter(attr => attr.key).length;
      const current = result.variants[slug];
      const currentKnown = current ? current.filter(attr => attr.key).length : -1;

      if (known > currentKnown) {
        result.variants[slug] = attrs;
        result.sources[slug] = shot.label;
      }
    }
  }

  /* Bônus: junta sem repetir a mesma quantidade de peças. */
  const seen = new Set();

  for (const shot of readable) {
    for (const bonus of shot.parsed.bonuses) {
      if (seen.has(bonus.required_pieces)) continue;
      seen.add(bonus.required_pieces);
      result.bonuses.push(bonus);
    }
  }

  result.bonuses.sort((a, b) => a.required_pieces - b.required_pieces);

  return result;
}

/* =========================================================
   REVISÃO
========================================================= */

function statRow(attr, rarity) {
  const options = STATS.map(stat => `
    <option value="${stat.key}" ${stat.key === attr.key ? 'selected' : ''}>
      ${escapeHtml(stat.label)}
    </option>
  `).join('');

  return `
    <div class="imp-stat" data-rarity="${escapeHtml(rarity)}">
      <select class="admin-select imp-stat-key">
        <option value="">— não reconhecido —</option>
        ${options}
      </select>

      <input class="admin-input imp-stat-value" type="number" step="0.01"
             value="${Number.isFinite(attr.value) ? attr.value : ''}">

      <span class="imp-stat-raw" title="${escapeHtml(attr.raw || '')}">
        ${escapeHtml(attr.raw || '')}
      </span>

      <button type="button" class="eq-btn imp-remove" title="Remover">✕</button>
    </div>
  `;
}

function renderReview(data) {
  const found = RARITIES.filter(rarity => data.variants[rarity.slug]);
  const missing = RARITIES.filter(rarity => !data.variants[rarity.slug]);

  const rarityBlocks = found.map(rarity => {
    const attrs = data.variants[rarity.slug];
    const source = data.sources?.[rarity.slug];

    return `
      <div class="imp-rarity" data-rarity="${rarity.slug}">
        <div class="imp-rarity-head">
          <div>
            <strong>${escapeHtml(rarity.label)}</strong>
            ${source ? `<div class="imp-source">de ${escapeHtml(source)}</div>` : ''}
          </div>

          <button type="button" class="eq-btn imp-add" data-rarity="${rarity.slug}">
            Adicionar atributo
          </button>
        </div>

        <div class="imp-stats">
          ${attrs.map(attr => statRow(attr, rarity.slug)).join('')}
        </div>
      </div>
    `;
  }).join('');

  const bonusRows = (data.bonuses || []).map(bonus => `
    <div class="imp-bonus">
      <input class="admin-input" type="number" min="1" max="6"
             value="${bonus.required_pieces}" title="Peças">
      <input class="admin-input" value="${escapeHtml(bonus.title)}" title="Título">
      <input class="admin-input" value="${escapeHtml(bonus.description)}" title="Descrição">
      <button type="button" class="eq-btn imp-bonus-remove">✕</button>
    </div>
  `).join('');

  reviewArea.innerHTML = `
    <div class="imp-card">
      <h3>Identificação</h3>

      <div class="imp-grid">
        <label>Nome
          <input class="admin-input" id="r-name" value="${escapeHtml(data.name)}">
        </label>

        <label>Conjunto
          <input class="admin-input" id="r-set" value="${escapeHtml(data.setName)}">
        </label>

        <label class="full">Descrição
          <textarea class="admin-textarea" id="r-desc" rows="3">${escapeHtml(data.description)}</textarea>
        </label>

        <label class="full">Recomendação
          <textarea class="admin-textarea" id="r-rec" rows="3">${escapeHtml(data.recommendation)}</textarea>
        </label>
      </div>
    </div>

    <div class="imp-card">
      <h3>Raridades
        <small>${found.length} de ${RARITIES.length} reconhecidas</small>
      </h3>

      ${rarityBlocks || '<div class="admin-empty">Nenhuma raridade reconhecida. Refaça o recorte ou ajuste o contraste.</div>'}

      ${missing.length ? `
        <div class="imp-missing">
          Faltando: ${missing.map(rarity => escapeHtml(rarity.label)).join(', ')}.
          Adicione os prints correspondentes e leia de novo.
        </div>
      ` : ''}
    </div>

    <div class="imp-card">
      <h3>Bônus do conjunto</h3>
      <div id="imp-bonuses">
        ${bonusRows || '<div class="admin-empty">Nenhum bônus reconhecido.</div>'}
      </div>
    </div>
  `;

  bindReviewEvents();
  sendButton.disabled = false;
}

function bindReviewEvents() {
  reviewArea.querySelectorAll('.imp-remove').forEach(button => {
    button.addEventListener('click', () => button.closest('.imp-stat').remove());
  });

  reviewArea.querySelectorAll('.imp-bonus-remove').forEach(button => {
    button.addEventListener('click', () => button.closest('.imp-bonus').remove());
  });

  reviewArea.querySelectorAll('.imp-add').forEach(button => {
    button.addEventListener('click', () => {
      const rarity = button.dataset.rarity;
      const list = reviewArea.querySelector(`.imp-rarity[data-rarity="${rarity}"] .imp-stats`);

      const wrapper = document.createElement('div');
      wrapper.innerHTML = statRow({ key: null, value: 0, raw: '' }, rarity);

      const node = wrapper.firstElementChild;
      list.appendChild(node);

      node.querySelector('.imp-remove')
        .addEventListener('click', () => node.remove());
    });
  });
}

/* =========================================================
   SELEÇÃO DE ARQUIVOS
========================================================= */

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => resolve({ image, url });
    image.onerror = () => reject(new Error(`Não foi possível abrir ${file.name}`));
    image.src = url;
  });
}

fileInput.addEventListener('change', async () => {
  const files = [...(fileInput.files || [])];
  if (!files.length) return;

  status.textContent = `Carregando ${files.length} imagem(ns)...`;

  injectStyles();

  const loaded = [];

  for (const file of files) {
    try {
      const { image, url } = await loadImage(file);

      loaded.push({
        label: file.name.replace(/\.[^.]+$/, '').slice(0, 24),
        image,
        url,
        crop: null,
        text: '',
        parsed: null
      });
    } catch (error) {
      console.warn('[import]', error.message);
    }
  }

  if (!loaded.length) {
    status.textContent = 'Nenhuma imagem pôde ser aberta.';
    return;
  }

  shots = loaded;
  activeIndex = 0;
  merged = null;

  zone.style.display = 'none';

  buildToolbar();
  buildWorkArea();
  renderStrip();
  renderPreview();
  showWarnings();

  status.textContent =
    `${shots.length} print(s) carregado(s). Marque o painel de efeitos em um ` +
    'deles — o recorte vale para todos.';
});

/* =========================================================
   EXTRAÇÃO EM LOTE
========================================================= */

extractButton.addEventListener('click', async () => {
  if (!shots.length) {
    status.textContent = 'Selecione os prints primeiro.';
    return;
  }

  extractButton.disabled = true;

  let worker = null;

  try {
    status.textContent = 'Preparando o leitor...';

    /* Um único motor para a fila inteira: o idioma é carregado
       uma vez só, em vez de a cada imagem. */
    worker = await Tesseract.createWorker('por');

    await worker.setParameters({
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1',
      tessedit_char_whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZÀÁÂÃÉÊÍÓÔÕÚÇ' +
        'abcdefghijklmnopqrstuvwxyzàáâãéêíóôõúç' +
        '0123456789+-%.,/() '
    });

    const chunks = [];

    for (let index = 0; index < shots.length; index += 1) {
      const shot = shots[index];

      status.textContent = `Lendo ${index + 1} de ${shots.length} — ${shot.label}`;

      const canvas = buildProcessedCanvas(shot);
      const { data } = await worker.recognize(canvas);

      shot.text = (data.text || '').trim();
      shot.parsed = parseText(shot.text);

      chunks.push(`===== ${shot.label} =====\n${shot.text}`);

      renderStrip();
    }

    raw.value = chunks.join('\n\n');

    const recognized = new Set();
    shots.forEach(shot => {
      Object.keys(shot.parsed?.variants || {}).forEach(slug => recognized.add(slug));
    });

    status.textContent =
      `Leitura concluída. ${recognized.size} de ${RARITIES.length} raridades ` +
      'reconhecidas. Monte a revisão para conferir.';
  } catch (error) {
    console.error('[OCR]', error);
    status.textContent = `Falha na leitura: ${error.message}`;
  } finally {
    if (worker) await worker.terminate();
    extractButton.disabled = false;
  }
});

/* =========================================================
   REVISÃO E ENVIO
========================================================= */

reviewButton.addEventListener('click', () => {
  if (!shots.some(shot => shot.parsed)) {
    /* Permite revisar texto colado manualmente. */
    merged = parseText(raw.value);
    merged.description = '';
    merged.recommendation = '';
    merged.sources = {};
  } else {
    merged = mergeShots();
  }

  renderReview(merged);

  const count = Object.keys(merged.variants).length;

  status.textContent = count
    ? `Revisão montada com ${count} raridade(s). Confira antes de enviar.`
    : 'Nenhuma raridade reconhecida. Revise o texto extraído.';
});

sendButton.addEventListener('click', () => {
  const variants = {};

  reviewArea.querySelectorAll('.imp-rarity').forEach(block => {
    const rarity = block.dataset.rarity;
    const stats = {};

    block.querySelectorAll('.imp-stat').forEach(row => {
      const key = row.querySelector('.imp-stat-key').value;
      const value = Number(row.querySelector('.imp-stat-value').value);

      if (!key || !Number.isFinite(value)) return;

      stats[key] = value;
    });

    if (Object.keys(stats).length) variants[rarity] = stats;
  });

  const bonuses = [...reviewArea.querySelectorAll('.imp-bonus')].map(row => {
    const inputs = row.querySelectorAll('input');

    return {
      required_pieces: Number(inputs[0].value) || 0,
      title: inputs[1].value.trim(),
      description: inputs[2].value.trim()
    };
  }).filter(bonus => bonus.required_pieces > 0);

  const draft = {
    name: $('r-name')?.value.trim() || '',
    setName: $('r-set')?.value.trim() || '',
    description: $('r-desc')?.value.trim() || '',
    recommendation: $('r-rec')?.value.trim() || '',
    variants,
    bonuses
  };

  if (!draft.name) {
    status.textContent = 'Informe o nome do equipamento antes de enviar.';
    return;
  }

  sessionStorage.setItem('equipment-import-draft', JSON.stringify(draft));
  location.href = './equipment-editor.html?import=1';
});
