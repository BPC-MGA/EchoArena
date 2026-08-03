import { supabase } from '../../js/supabase.js';

const STORAGE_BUCKET = 'game-media';
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const IMPORT_KEY = 'hero-import-draft';
const IMPORT_SCHEMA_VERSION = 1;

const params = new URLSearchParams(location.search);
const heroId = params.get('id');

const form = document.getElementById('hero-form');
const message = document.getElementById('message');
const saveButton = document.getElementById('save-hero-button');

const fields = {
  name: document.getElementById('name'),
  slug: document.getElementById('slug'),
  classId: document.getElementById('class-id'),
  displayOrder: document.getElementById('display-order'),
  description: document.getElementById('description'),
  enabled: document.getElementById('enabled'),
  imageFile: document.getElementById('image-file'),
  cardFile: document.getElementById('card-file'),
  gifFile: document.getElementById('gif-file')
};

const previewElements = {
  live: document.getElementById('hero-live-preview'),
  name: document.getElementById('preview-name'),
  slug: document.getElementById('preview-slug'),
  description: document.getElementById('preview-description'),
  enabled: document.getElementById('preview-enabled')
};


const integratedStats = {
  heroGrid: document.getElementById('hero-stats-grid'),
  weaponGrid: document.getElementById('weapon-stats-grid'),
  heroPreview: document.getElementById('hero-stats-preview'),
  weaponPreview: document.getElementById('weapon-stats-preview'),
  weaponName: document.getElementById('weapon-name'),
  applyImport: document.getElementById('apply-imported-stats'),
  undoImport: document.getElementById('undo-imported-stats')
};

const HERO_STAT_CATEGORIES = new Set([
  'hero',
  'defense',
  'utility'
]);

const WEAPON_STAT_CATEGORIES = new Set([
  'weapon',
  'offense',
  'ability'
]);

const STAT_IMPORT_ALIASES = {
  hero: {
    power: ['power', 'hero_power', 'poder', 'poder geral'],
    health: ['health', 'life', 'hp', 'vida', 'vida total'],
    damage: ['damage', 'hero_damage', 'dano', 'dano do heroi'],
    armor: ['armor', 'armour', 'armadura', 'armadura total'],
    visionRange: ['vision_range', 'visionrange', 'alcance de visao', 'visao'],
    movementNoiseRadius: ['movement_noise_radius', 'noise_radius', 'raio do barulho', 'barulho de movimentacao'],
    maxMovementSpeed: ['max_movement_speed', 'movement_speed', 'velocidade maxima'],
    aimedMovementSpeed: ['aimed_movement_speed', 'movement_speed_aiming', 'velocidade ao mirar'],
    penetrationResistance: ['penetration_resistance', 'resistencia a perfuracao'],
    armorValue: ['armor_value', 'valor de armadura', 'valor da armadura'],
    armorResistance: ['armor_resistance', 'resistencia de armadura']
  },

  weapon: {
    firepower: ['firepower', 'weapon_firepower', 'poder de fogo'],
    armorBreak: ['armor_break', 'armorbreak', 'quebra de armadura'],
    fireRate: ['fire_rate', 'firerate', 'cadencia', 'cadencia de tiro'],
    magazineCapacity: ['magazine_capacity', 'ammo_capacity', 'capacidade de municao'],
    effectiveRange: ['effective_range', 'alcance efetivo'],
    aimingStability: ['aiming_stability', 'estabilidade de mira'],
    damagePerShot: ['damage_per_shot', 'weapon_damage', 'dano por tiro'],
    healthDamageMultiplier: ['health_damage_multiplier', 'modificador contra vida'],
    armorPenetration: ['armor_penetration', 'perfuracao de armadura'],
    penetrationPower: ['penetration_power', 'poder de perfuracao'],
    armorDroneMultiplier: ['armor_drone_multiplier', 'modificador contra armadura e drones'],
    shotsPerSecond: ['shots_per_second', 'tiros por segundo'],
    reloadTime: ['reload_time', 'tempo de recarga'],
    magazineSize: ['magazine_size', 'tamanho do pente'],
    hipFireRange: ['hip_fire_range', 'alcance sem mira'],
    aimedRange: ['aimed_range', 'alcance com mira'],
    dispersion: ['dispersion', 'dispersao'],
    movingDispersion: ['moving_dispersion', 'dispersao em movimento'],
    aimedDispersion: ['aimed_dispersion', 'dispersao com mira'],
    aimTime: ['aim_time', 'tempo de mira'],
    dispersionFactor: ['dispersion_factor', 'fator de dispersao']
  }
};

let statDefinitions = [];
let importedStatsSnapshot = null;

let currentHero = null;
let isSaving = false;
let mainEditor;
let cardEditor;
let gifEditor;

function showMessage(text = '', type = '') {
  if (!message) return;
  message.textContent = text;
  message.className = type;
}

function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeFilename(filename = '') {
  const extension = filename.includes('.')
    ? filename.split('.').pop().toLowerCase()
    : '';

  const basename = filename
    .replace(/\.[^/.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return extension ? `${basename}.${extension}` : basename;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = typeof value === 'string'
    ? value.replace(',', '.').trim()
    : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function createUniqueId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getPublicUrl(path) {
  if (!path) return '';
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

function validateFile(file, allowedTypes) {
  if (!file) return;
  if (!allowedTypes.includes(file.type)) {
    throw new Error(`Formato não permitido para "${file.name}".`);
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`"${file.name}" deve ter no máximo 25 MB.`);
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setFieldValue(field, value, eventName = 'input') {
  if (!field || value === null || value === undefined) return;

  if (field.type === 'checkbox') {
    field.checked = Boolean(value);
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  field.value = String(value);
  field.dispatchEvent(new Event(eventName, { bubbles: true }));

  if (eventName !== 'change') {
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/* =========================================================
   EDITOR DE MÍDIA
========================================================= */

function createMediaEditor({
  name,
  input,
  canvas,
  image,
  zoom,
  zoomValue,
  centerButton,
  resetButton,
  allowedTypes,
  objectFit = 'cover',
  onChange
}) {
  const state = {
    source: '',
    objectUrl: '',
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    pointerId: null,
    pointerStartX: 0,
    pointerStartY: 0,
    originalOffsetX: 0,
    originalOffsetY: 0
  };

  function notifyChange() {
    if (typeof onChange === 'function') onChange(api);
  }

  function revokeObjectUrl() {
    if (!state.objectUrl) return;
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = '';
  }

  function applyBaseLayout() {
    if (!image) return;
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.objectFit = objectFit;
    image.style.objectPosition = '50% 50%';
  }

  function updateTransform() {
    if (!image) return;

    state.scale = clamp(toNumber(state.scale, 1), 0.5, 3);
    state.offsetX = clamp(toNumber(state.offsetX, 0), -100, 100);
    state.offsetY = clamp(toNumber(state.offsetY, 0), -100, 100);

    image.style.transform =
      `translate(${-50 + state.offsetX}%, ${-50 + state.offsetY}%) scale(${state.scale})`;

    if (zoom) zoom.value = String(state.scale);
    if (zoomValue) zoomValue.textContent = `${Math.round(state.scale * 100)}%`;

    notifyChange();
  }

  function setSource(
    source,
    { scale = 1, offsetX = 0, offsetY = 0, isObjectUrl = false } = {}
  ) {
    if (!source) {
      clear();
      return;
    }

    if (!isObjectUrl) revokeObjectUrl();

    state.source = source;
    state.scale = clamp(toNumber(scale, 1), 0.5, 3);
    state.offsetX = clamp(toNumber(offsetX, 0), -100, 100);
    state.offsetY = clamp(toNumber(offsetY, 0), -100, 100);

    image.onload = () => {
      applyBaseLayout();
      canvas.classList.add('has-image');
      updateTransform();
    };

    image.onerror = () => {
      console.warn(`Não foi possível carregar a mídia "${name}".`);
      canvas.classList.remove('has-image');
    };

    image.src = source;
  }

  function setFile(file) {
    if (!file) return;
    validateFile(file, allowedTypes);
    revokeObjectUrl();
    state.objectUrl = URL.createObjectURL(file);
    setSource(state.objectUrl, {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      isObjectUrl: true
    });
  }

  function center() {
    state.offsetX = 0;
    state.offsetY = 0;
    updateTransform();
  }

  function reset() {
    state.scale = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    updateTransform();
  }

  function clear() {
    revokeObjectUrl();

    state.source = '';
    state.scale = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    state.dragging = false;
    state.pointerId = null;

    canvas?.classList.remove('has-image', 'is-dragging');
    image?.removeAttribute('src');

    if (zoom) zoom.value = '1';
    if (zoomValue) zoomValue.textContent = '100%';

    notifyChange();
  }

  function getState() {
    return {
      source: state.source,
      scale: Number(state.scale.toFixed(3)),
      offsetX: Math.round(state.offsetX),
      offsetY: Math.round(state.offsetY),
      objectFit
    };
  }

  function getSource() {
    return state.source;
  }

  function resize() {
    if (!state.source) return;
    applyBaseLayout();
    updateTransform();
  }

  function bind() {
    if (!canvas || !image || !input) {
      console.warn(`Editor de mídia incompleto: ${name}`);
      return;
    }

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        setFile(file);
      } catch (error) {
        input.value = '';
        showMessage(error.message, 'error');
      }
    });

    zoom?.addEventListener('input', event => {
      state.scale = toNumber(event.target.value, 1);
      updateTransform();
    });

    centerButton?.addEventListener('click', center);
    resetButton?.addEventListener('click', reset);

    canvas.addEventListener('pointerdown', event => {
      if (!state.source) return;

      state.dragging = true;
      state.pointerId = event.pointerId;
      state.pointerStartX = event.clientX;
      state.pointerStartY = event.clientY;
      state.originalOffsetX = state.offsetX;
      state.originalOffsetY = state.offsetY;

      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
    });

    canvas.addEventListener('pointermove', event => {
      if (!state.dragging || event.pointerId !== state.pointerId) return;

      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;

      state.offsetX =
        state.originalOffsetX +
        ((event.clientX - state.pointerStartX) / width) * 100;

      state.offsetY =
        state.originalOffsetY +
        ((event.clientY - state.pointerStartY) / height) * 100;

      updateTransform();
    });

    function stopDragging(event) {
      if (event.pointerId !== state.pointerId) return;

      state.dragging = false;
      state.pointerId = null;
      canvas.classList.remove('is-dragging');

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    }

    canvas.addEventListener('pointerup', stopDragging);
    canvas.addEventListener('pointercancel', stopDragging);
  }

  const api = {
    bind,
    setSource,
    setFile,
    center,
    reset,
    clear,
    resize,
    getState,
    getSource
  };

  bind();
  return api;
}

function createAllMediaEditors() {
  const sharedImageTypes = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ];

  mainEditor = createMediaEditor({
    name: 'imagem principal',
    input: fields.imageFile,
    canvas: document.getElementById('main-image-canvas'),
    image: document.getElementById('main-image-element'),
    zoom: document.getElementById('main-image-zoom'),
    zoomValue: document.getElementById('main-image-zoom-value'),
    centerButton: document.getElementById('main-image-center'),
    resetButton: document.getElementById('main-image-reset'),
    allowedTypes: sharedImageTypes,
    objectFit: 'contain',
    onChange: updateLivePreview
  });

  cardEditor = createMediaEditor({
    name: 'imagem do card',
    input: fields.cardFile,
    canvas: document.getElementById('card-image-canvas'),
    image: document.getElementById('card-image-element'),
    zoom: document.getElementById('card-image-zoom'),
    zoomValue: document.getElementById('card-image-zoom-value'),
    centerButton: document.getElementById('card-image-center'),
    resetButton: document.getElementById('card-image-reset'),
    allowedTypes: sharedImageTypes,
    objectFit: 'cover'
  });

  gifEditor = createMediaEditor({
    name: 'GIF animado',
    input: fields.gifFile,
    canvas: document.getElementById('gif-image-canvas'),
    image: document.getElementById('gif-image-element'),
    zoom: document.getElementById('gif-image-zoom'),
    zoomValue: document.getElementById('gif-image-zoom-value'),
    centerButton: document.getElementById('gif-image-center'),
    resetButton: document.getElementById('gif-image-reset'),
    allowedTypes: ['image/gif'],
    objectFit: 'cover'
  });
}

/* =========================================================
   PRÉVIA E EVENTOS
========================================================= */

function updateInformationPreview() {
  if (previewElements.name) {
    previewElements.name.textContent =
      fields.name?.value.trim() || 'Novo herói';
  }

  if (previewElements.slug) {
    previewElements.slug.textContent =
      fields.slug?.value.trim() || '—';
  }

  if (previewElements.description) {
    previewElements.description.textContent =
      fields.description?.value.trim() || 'Nenhuma descrição cadastrada.';
  }

  if (previewElements.enabled) {
    previewElements.enabled.textContent =
      fields.enabled?.checked ? 'Ativo' : 'Inativo';
  }
}

function updateLivePreview() {
  const container = previewElements.live;
  if (!container || !mainEditor) return;

  const source = mainEditor.getSource();
  const state = mainEditor.getState();

  if (!source) {
    container.textContent = 'Sem mídia selecionada';
    return;
  }

  container.innerHTML = `
    <div style="position:relative;width:100%;height:100%;overflow:hidden">
      <img
        src="${source}"
        alt=""
        style="
          position:absolute;
          left:50%;
          top:50%;
          width:100%;
          height:100%;
          object-fit:${state.objectFit};
          object-position:50% 50%;
          pointer-events:none;
          transform:
            translate(${-50 + state.offsetX}%, ${-50 + state.offsetY}%)
            scale(${state.scale});
          transform-origin:center center;
        "
      >
    </div>
  `;
}

function updateAllPreviews() {
  updateInformationPreview();
  updateLivePreview();
}

function bindAutomaticSlug() {
  fields.name?.addEventListener('input', () => {
    fields.slug.value = slugify(fields.name.value);
    updateInformationPreview();
  });
}

function bindGeneralPreview() {
  fields.description?.addEventListener('input', updateInformationPreview);
  fields.enabled?.addEventListener('change', updateInformationPreview);
}

/* =========================================================
   CLASSES E ORDEM
========================================================= */

async function loadHeroClasses() {
  let result = await supabase
    .from('hero_classes')
    .select('id,name,slug')
    .order('name');

  if (result.error) {
    result = await supabase
      .from('classes')
      .select('id,name,slug')
      .order('name');
  }

  if (result.error) {
    console.warn('Não foi possível carregar as classes:', result.error);
    return;
  }

  const classes = result.data ?? [];

  fields.classId.innerHTML = `
    <option value="">Sem classe</option>
    ${classes.map(heroClass => `
      <option
        value="${heroClass.id}"
        data-slug="${heroClass.slug || ''}"
      >${heroClass.name}</option>
    `).join('')}
  `;
}

async function loadNextDisplayOrder() {
  if (heroId) return;

  const { data, error } = await supabase
    .from('heroes')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1);

  if (error) {
    console.warn('Não foi possível calcular a ordem:', error);
    fields.displayOrder.value = '0';
    return;
  }

  const highestOrder = toNumber(data?.[0]?.display_order, -1);
  fields.displayOrder.value = String(highestOrder + 1);
}


/* =========================================================
   STATUS E ARMA INTEGRADOS
========================================================= */

function getStatInputStep(definition) {
  const decimals = Math.max(0, toNumber(definition.decimals, 0));
  return decimals === 0
    ? '1'
    : String(1 / Math.pow(10, decimals));
}

function formatIntegratedStatValue(value, definition = {}) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  const decimals = Math.max(0, toNumber(definition.decimals, 0));

  const formatted = number.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });

  if (!definition.unit) return formatted;
  if (definition.unit === 'x') return `x${formatted}`;
  return `${formatted}${definition.unit}`;
}

function getIntegratedDefinitions(group) {
  const categories =
    group === 'hero'
      ? HERO_STAT_CATEGORIES
      : WEAPON_STAT_CATEGORIES;

  return statDefinitions.filter(definition =>
    categories.has(definition.category)
  );
}

function createIntegratedStatField(definition, group, currentValue = '') {
  const wrapper = document.createElement('div');
  wrapper.className = 'integrated-stat-field stat-field';
  wrapper.dataset.statKey = definition.key;
  wrapper.dataset.group = group;

  const label = document.createElement('label');
  const labelText = document.createElement('span');
  labelText.textContent = definition.name || definition.key;
  label.appendChild(labelText);

  if (definition.unit) {
    const unit = document.createElement('span');
    unit.className = 'unit';
    unit.textContent = definition.unit;
    label.appendChild(unit);
  }

  const description = document.createElement('small');
  description.textContent = definition.description || '';

  const input = document.createElement('input');
  input.type = 'number';
  input.step =
    definition.value_type === 'integer'
      ? '1'
      : getStatInputStep(definition);

  input.value =
    currentValue === null || currentValue === undefined
      ? ''
      : String(currentValue);

  input.placeholder = '0';
  input.addEventListener('input', renderIntegratedStatsPreview);

  wrapper.append(label, description, input);
  return wrapper;
}

function renderIntegratedStatsFields(heroValues = {}, weaponValues = {}) {
  const heroDefinitions = getIntegratedDefinitions('hero');
  const weaponDefinitions = getIntegratedDefinitions('weapon');

  if (integratedStats.heroGrid) {
    integratedStats.heroGrid.innerHTML = '';

    if (!heroDefinitions.length) {
      integratedStats.heroGrid.innerHTML = `
        <div class="integrated-stats-empty">
          Nenhuma definição de status do herói foi encontrada.
        </div>
      `;
    } else {
      heroDefinitions.forEach(definition => {
        integratedStats.heroGrid.appendChild(
          createIntegratedStatField(
            definition,
            'hero',
            heroValues[definition.key] ?? ''
          )
        );
      });
    }
  }

  if (integratedStats.weaponGrid) {
    integratedStats.weaponGrid.innerHTML = '';

    if (!weaponDefinitions.length) {
      integratedStats.weaponGrid.innerHTML = `
        <div class="integrated-stats-empty">
          Nenhuma definição de status da arma foi encontrada.
        </div>
      `;
    } else {
      weaponDefinitions.forEach(definition => {
        integratedStats.weaponGrid.appendChild(
          createIntegratedStatField(
            definition,
            'weapon',
            weaponValues[definition.key] ?? ''
          )
        );
      });
    }
  }

  renderIntegratedStatsPreview();
}

function collectIntegratedStatFields(group) {
  return [
    ...document.querySelectorAll(
      `.stat-field[data-group="${group}"]`
    )
  ]
    .map(field => {
      const input = field.querySelector('input');
      const rawValue = input?.value.trim() ?? '';

      return {
        stat_key: field.dataset.statKey,
        rawValue
      };
    })
    .filter(item => item.stat_key && item.rawValue !== '')
    .map(item => {
      const value = Number(item.rawValue);

      if (!Number.isFinite(value)) {
        throw new Error(`Valor inválido em "${item.stat_key}".`);
      }

      return {
        stat_key: item.stat_key,
        value
      };
    });
}

function renderIntegratedPreviewGroup(group, container) {
  if (!container) return;

  const fields = [
    ...document.querySelectorAll(
      `.stat-field[data-group="${group}"]`
    )
  ].filter(field => {
    const input = field.querySelector('input');
    return input && input.value.trim() !== '';
  });

  if (!fields.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = fields
    .map(field => {
      const statKey = field.dataset.statKey;
      const definition = statDefinitions.find(item => item.key === statKey);
      const value = field.querySelector('input').value;

      return `
        <div class="integrated-preview-stat">
          <span>${escapeHtml(definition?.name || statKey)}</span>
          <strong>${escapeHtml(
            formatIntegratedStatValue(value, definition || {})
          )}</strong>
        </div>
      `;
    })
    .join('');
}

function renderIntegratedStatsPreview() {
  renderIntegratedPreviewGroup(
    'hero',
    integratedStats.heroPreview
  );

  renderIntegratedPreviewGroup(
    'weapon',
    integratedStats.weaponPreview
  );
}

async function loadStatDefinitions() {
  const { data, error } = await supabase
    .from('stat_definitions')
    .select(`
      key,
      name,
      category,
      unit,
      value_type,
      decimals,
      higher_is_better,
      description,
      display_order
    `)
    .eq('enabled', true)
    .order('display_order', {
      ascending: true
    });

  if (error) throw error;

  statDefinitions = data || [];
  renderIntegratedStatsFields();
}

async function loadIntegratedStats(targetHeroId) {
  if (!targetHeroId) {
    renderIntegratedStatsFields();
    if (integratedStats.weaponName) {
      integratedStats.weaponName.value = '';
    }
    return;
  }

  const [
    heroStatsResult,
    weaponStatsResult
  ] = await Promise.all([
    supabase
      .from('hero_base_stats')
      .select('stat_key,value')
      .eq('hero_id', targetHeroId),

    supabase
      .from('hero_weapon_stats')
      .select('stat_key,value,weapon_name')
      .eq('hero_id', targetHeroId)
  ]);

  if (heroStatsResult.error) throw heroStatsResult.error;
  if (weaponStatsResult.error) throw weaponStatsResult.error;

  const heroValues = Object.fromEntries(
    (heroStatsResult.data || []).map(row => [
      row.stat_key,
      row.value
    ])
  );

  const weaponValues = Object.fromEntries(
    (weaponStatsResult.data || []).map(row => [
      row.stat_key,
      row.value
    ])
  );

  renderIntegratedStatsFields(
    heroValues,
    weaponValues
  );

  if (integratedStats.weaponName) {
    integratedStats.weaponName.value =
      weaponStatsResult.data?.[0]?.weapon_name || '';
  }
}

async function getExistingIntegratedStatKeys(table, targetHeroId) {
  const { data, error } = await supabase
    .from(table)
    .select('stat_key')
    .eq('hero_id', targetHeroId);

  if (error) throw error;

  return (data || []).map(row => row.stat_key);
}

async function syncIntegratedStats(
  table,
  targetHeroId,
  rows,
  extra = {}
) {
  const existingKeys =
    await getExistingIntegratedStatKeys(
      table,
      targetHeroId
    );

  const incomingKeys =
    rows.map(row => row.stat_key);

  if (rows.length) {
    const payload = rows.map(row => ({
      hero_id: targetHeroId,
      stat_key: row.stat_key,
      value: row.value,
      ...extra
    }));

    const { error: upsertError } = await supabase
      .from(table)
      .upsert(payload, {
        onConflict: 'hero_id,stat_key'
      });

    if (upsertError) throw upsertError;
  }

  const removedKeys = existingKeys.filter(
    key => !incomingKeys.includes(key)
  );

  if (removedKeys.length) {
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq('hero_id', targetHeroId)
      .in('stat_key', removedKeys);

    if (deleteError) throw deleteError;
  }
}

async function saveIntegratedStats(targetHeroId) {
  const heroRows =
    collectIntegratedStatFields('hero');

  const weaponRows =
    collectIntegratedStatFields('weapon');

  const weaponName =
    integratedStats.weaponName?.value.trim() ||
    null;

  await syncIntegratedStats(
    'hero_base_stats',
    targetHeroId,
    heroRows
  );

  await syncIntegratedStats(
    'hero_weapon_stats',
    targetHeroId,
    weaponRows,
    {
      weapon_name: weaponName
    }
  );

  importedStatsSnapshot = null;
  updateIntegratedUndoButton();
}

function scoreIntegratedDefinitionMatch(definition, aliases) {
  const key = normalizeText(definition.key);
  const name = normalizeText(definition.name);
  let bestScore = 0;

  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias) continue;

    if (key === normalizedAlias || name === normalizedAlias) {
      bestScore = Math.max(bestScore, 100);
      continue;
    }

    if (
      key.replace(/\s/g, '') === normalizedAlias.replace(/\s/g, '') ||
      name.replace(/\s/g, '') === normalizedAlias.replace(/\s/g, '')
    ) {
      bestScore = Math.max(bestScore, 95);
      continue;
    }

    if (
      key.includes(normalizedAlias) ||
      name.includes(normalizedAlias) ||
      normalizedAlias.includes(key) ||
      normalizedAlias.includes(name)
    ) {
      bestScore = Math.max(bestScore, 70);
    }
  }

  return bestScore;
}

function findIntegratedDefinition(group, aliases) {
  const categories =
    group === 'hero'
      ? HERO_STAT_CATEGORIES
      : WEAPON_STAT_CATEGORIES;

  return statDefinitions
    .filter(definition =>
      categories.has(definition.category)
    )
    .map(definition => ({
      definition,
      score: scoreIntegratedDefinitionMatch(
        definition,
        aliases
      )
    }))
    .filter(item => item.score > 0)
    .sort((first, second) =>
      second.score - first.score
    )[0]?.definition || null;
}

function getIntegratedInput(group, definition) {
  if (!definition) return null;

  return document.querySelector(
    `.stat-field[data-group="${group}"][data-stat-key="${CSS.escape(definition.key)}"] input`
  );
}

function captureIntegratedStatsSnapshot() {
  const values = {};

  document
    .querySelectorAll('.stat-field')
    .forEach(field => {
      const input = field.querySelector('input');
      if (!input) return;

      values[
        `${field.dataset.group}:${field.dataset.statKey}`
      ] = input.value;
    });

  return {
    weaponName:
      integratedStats.weaponName?.value || '',
    values
  };
}

function restoreIntegratedStatsSnapshot(snapshot) {
  if (!snapshot) return;

  if (integratedStats.weaponName) {
    integratedStats.weaponName.value =
      snapshot.weaponName || '';
  }

  document
    .querySelectorAll('.stat-field')
    .forEach(field => {
      const input = field.querySelector('input');
      if (!input) return;

      const key =
        `${field.dataset.group}:${field.dataset.statKey}`;

      input.value =
        snapshot.values[key] ?? '';
    });

  renderIntegratedStatsPreview();
}

function updateIntegratedUndoButton() {
  if (integratedStats.undoImport) {
    integratedStats.undoImport.disabled =
      !importedStatsSnapshot;
  }
}

function hasImportedStatsData(data) {
  return Boolean(
    data?.status ||
    data?.weaponSummary ||
    data?.weaponDetails
  );
}

function applyImportedStatsData(data, {
  announce = false
} = {}) {
  if (!hasImportedStatsData(data)) {
    return {
      applied: 0,
      missing: []
    };
  }

  if (!importedStatsSnapshot) {
    importedStatsSnapshot =
      captureIntegratedStatsSnapshot();
    updateIntegratedUndoButton();
  }

  const heroSource = data.status || {};
  const weaponSource = {
    ...(data.weaponSummary || {}),
    ...(data.weaponDetails || {})
  };

  let applied = 0;
  const missing = [];

  for (const [sourceKey, aliases] of Object.entries(STAT_IMPORT_ALIASES.hero)) {
    const value = nullableNumber(heroSource[sourceKey]);
    if (value === null) continue;

    const definition =
      findIntegratedDefinition('hero', aliases);

    const input =
      getIntegratedInput('hero', definition);

    if (!definition || !input) {
      missing.push(`Herói: ${sourceKey}`);
      continue;
    }

    input.value = String(value);
    applied += 1;
  }

  for (const [sourceKey, aliases] of Object.entries(STAT_IMPORT_ALIASES.weapon)) {
    const value = nullableNumber(weaponSource[sourceKey]);
    if (value === null) continue;

    const definition =
      findIntegratedDefinition('weapon', aliases);

    const input =
      getIntegratedInput('weapon', definition);

    if (!definition || !input) {
      missing.push(`Arma: ${sourceKey}`);
      continue;
    }

    input.value = String(value);
    applied += 1;
  }

  const weaponName =
    data.weaponSummary?.name ||
    data.weaponDetails?.name ||
    null;

  if (weaponName && integratedStats.weaponName) {
    integratedStats.weaponName.value =
      String(weaponName);
    applied += 1;
  }

  renderIntegratedStatsPreview();

  if (announce) {
    let text =
      `${applied} campo(s) de status e arma preenchido(s).`;

    if (missing.length) {
      text +=
        ` ${missing.length} campo(s) não possuem definição correspondente.`;
    }

    showMessage(
      text,
      applied ? 'ok' : 'error'
    );
  }

  return {
    applied,
    missing
  };
}

function bindIntegratedStatsControls() {
  integratedStats.applyImport?.addEventListener(
    'click',
    () => {
      const stored = loadImportDraft();
      applyImportedStatsData(
        stored?.data,
        {
          announce: true
        }
      );
    }
  );

  integratedStats.undoImport?.addEventListener(
    'click',
    () => {
      if (!importedStatsSnapshot) {
        showMessage(
          'Não há preenchimento para desfazer.',
          'error'
        );
        return;
      }

      restoreIntegratedStatsSnapshot(
        importedStatsSnapshot
      );

      importedStatsSnapshot = null;
      updateIntegratedUndoButton();

      showMessage(
        'Os valores anteriores foram restaurados. Nada foi salvo.',
        'ok'
      );
    }
  );

  integratedStats.weaponName?.addEventListener(
    'input',
    renderIntegratedStatsPreview
  );
}

function refreshImportedStatsButton() {
  const stored = loadImportDraft();

  if (integratedStats.applyImport) {
    integratedStats.applyImport.hidden =
      !hasImportedStatsData(
        stored?.data
      );
  }
}


/* =========================================================
   IMPORTAÇÃO ASSISTIDA
========================================================= */

function getImportPrompt() {
  return `Analise os prints enviados de um herói do jogo Bullet Echo.

Extraia apenas os dados claramente visíveis. Não estime, não invente e não calcule valores ausentes. Quando um campo não estiver visível ou não puder ser confirmado, use null.

Responda SOMENTE com JSON válido, sem explicações antes ou depois:

{
  "schemaVersion": 1,
  "hero": {
    "name": null,
    "class": null,
    "description": null,
    "displayOrder": null,
    "active": true
  },
  "status": {
    "power": null,
    "health": null,
    "damage": null,
    "armor": null,
    "visionRange": null,
    "movementNoiseRadius": null,
    "maxMovementSpeed": null,
    "aimedMovementSpeed": null,
    "penetrationResistance": null,
    "armorValue": null,
    "armorResistance": null
  },
  "weaponSummary": {
    "name": null,
    "firepower": null,
    "armorBreak": null,
    "fireRate": null,
    "magazineCapacity": null,
    "effectiveRange": null,
    "aimingStability": null
  },
  "weaponDetails": {
    "damagePerShot": null,
    "healthDamageMultiplier": null,
    "armorPenetration": null,
    "penetrationPower": null,
    "armorDroneMultiplier": null,
    "shotsPerSecond": null,
    "reloadTime": null,
    "magazineSize": null,
    "hipFireRange": null,
    "aimedRange": null,
    "dispersion": null,
    "movingDispersion": null,
    "aimedDispersion": null,
    "aimTime": null,
    "dispersionFactor": null
  },
  "meta": {
    "rarity": null,
    "faction": null
  }
}

Regras:
- Preserve números decimais.
- Remova símbolos de unidade do valor numérico.
- Em "class", use o nome mostrado no jogo.
- Em "description", transcreva somente a descrição do herói.
- Nunca coloque texto fora do JSON.`;
}

function extractJsonText(value = '') {
  const text = String(value).trim();

  if (!text) {
    throw new Error('Cole o JSON retornado pelo ChatGPT.');
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');

  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error('Não foi encontrado um objeto JSON válido.');
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

function normalizeImportedData(source = {}) {
  const hero = source.hero && typeof source.hero === 'object'
    ? source.hero
    : source;

  const status = source.status && typeof source.status === 'object'
    ? source.status
    : (source.heroParameters || {});

  const summary = source.weaponSummary && typeof source.weaponSummary === 'object'
    ? source.weaponSummary
    : {};

  const weapon = source.weaponDetails && typeof source.weaponDetails === 'object'
    ? source.weaponDetails
    : (source.weapon || {});

  const meta = source.meta && typeof source.meta === 'object'
    ? source.meta
    : {};

  return {
    schemaVersion: Number(source.schemaVersion) || IMPORT_SCHEMA_VERSION,

    hero: {
      name: hero.name ?? source.name ?? null,
      class: hero.class ?? hero.heroClass ?? source.heroClass ?? source.class ?? null,
      description: hero.description ?? source.description ?? null,
      displayOrder: nullableNumber(
        hero.displayOrder ?? hero.display_order ??
        source.displayOrder ?? source.display_order
      ),
      active: hero.active ?? hero.enabled ?? source.active ?? source.enabled ?? null
    },

    status: {
      power: nullableNumber(status.power ?? source.power),
      health: nullableNumber(status.health ?? status.life ?? source.health),
      damage: nullableNumber(status.damage ?? source.damage),
      armor: nullableNumber(status.armor ?? source.armor),
      visionRange: nullableNumber(status.visionRange ?? status.vision_range),
      movementNoiseRadius: nullableNumber(
        status.movementNoiseRadius ?? status.movement_noise_radius
      ),
      maxMovementSpeed: nullableNumber(
        status.maxMovementSpeed ?? status.max_movement_speed
      ),
      aimedMovementSpeed: nullableNumber(
        status.aimedMovementSpeed ?? status.aimed_movement_speed
      ),
      penetrationResistance: nullableNumber(
        status.penetrationResistance ?? status.penetration_resistance
      ),
      armorValue: nullableNumber(status.armorValue ?? status.armor_value),
      armorResistance: nullableNumber(
        status.armorResistance ?? status.armor_resistance
      )
    },

    weaponSummary: {
      name: summary.name ?? weapon.name ?? null,
      firepower: nullableNumber(summary.firepower ?? weapon.firepower),
      armorBreak: nullableNumber(
        summary.armorBreak ?? summary.armor_break ?? weapon.armorBreak
      ),
      fireRate: nullableNumber(
        summary.fireRate ?? summary.fire_rate ?? weapon.fireRate
      ),
      magazineCapacity: nullableNumber(
        summary.magazineCapacity ??
        summary.magazine_capacity ??
        weapon.magazineCapacity
      ),
      effectiveRange: nullableNumber(
        summary.effectiveRange ?? summary.effective_range ?? weapon.effectiveRange
      ),
      aimingStability: nullableNumber(
        summary.aimingStability ??
        summary.aiming_stability ??
        weapon.aimingStability
      )
    },

    weaponDetails: {
      damagePerShot: nullableNumber(
        weapon.damagePerShot ?? weapon.damage_per_shot
      ),
      healthDamageMultiplier: nullableNumber(
        weapon.healthDamageMultiplier ?? weapon.health_damage_multiplier
      ),
      armorPenetration: nullableNumber(
        weapon.armorPenetration ?? weapon.armor_penetration
      ),
      penetrationPower: nullableNumber(
        weapon.penetrationPower ?? weapon.penetration_power
      ),
      armorDroneMultiplier: nullableNumber(
        weapon.armorDroneMultiplier ?? weapon.armor_drone_multiplier
      ),
      shotsPerSecond: nullableNumber(
        weapon.shotsPerSecond ?? weapon.shots_per_second
      ),
      reloadTime: nullableNumber(
        weapon.reloadTime ?? weapon.reload_time
      ),
      magazineSize: nullableNumber(
        weapon.magazineSize ?? weapon.magazine_size
      ),
      hipFireRange: nullableNumber(
        weapon.hipFireRange ?? weapon.hip_fire_range
      ),
      aimedRange: nullableNumber(
        weapon.aimedRange ?? weapon.aimed_range
      ),
      dispersion: nullableNumber(weapon.dispersion),
      movingDispersion: nullableNumber(
        weapon.movingDispersion ?? weapon.moving_dispersion
      ),
      aimedDispersion: nullableNumber(
        weapon.aimedDispersion ?? weapon.aimed_dispersion
      ),
      aimTime: nullableNumber(
        weapon.aimTime ?? weapon.aim_time
      ),
      dispersionFactor: nullableNumber(
        weapon.dispersionFactor ?? weapon.dispersion_factor
      )
    },

    meta: {
      rarity: meta.rarity ?? source.rarity ?? null,
      faction: meta.faction ?? source.faction ?? null
    }
  };
}

function countValues(object) {
  return Object.values(object || {}).filter(
    value => value !== null && value !== undefined && value !== ''
  ).length;
}

function findClassOption(className) {
  if (!fields.classId || !className) return null;

  const wanted = normalizeText(className);
  const options = [...fields.classId.options];

  return options.find(option => {
    if (!option.value) return false;
    return (
      normalizeText(option.textContent) === wanted ||
      normalizeText(option.dataset.slug) === wanted
    );
  }) || options.find(option => {
    if (!option.value) return false;

    const text = normalizeText(option.textContent);
    const slug = normalizeText(option.dataset.slug);

    return (
      text.includes(wanted) ||
      wanted.includes(text) ||
      slug.includes(wanted) ||
      wanted.includes(slug)
    );
  }) || null;
}

function saveImportDraft(data) {
  sessionStorage.setItem(
    IMPORT_KEY,
    JSON.stringify({
      schemaVersion: IMPORT_SCHEMA_VERSION,
      importedAt: new Date().toISOString(),
      heroId: heroId || currentHero?.id || null,
      heroSlug: fields.slug?.value.trim() || null,
      data
    })
  );
}

function loadImportDraft() {
  try {
    const raw = sessionStorage.getItem(IMPORT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.data ? parsed : null;
  } catch (error) {
    console.warn('Rascunho de importação inválido:', error);
    return null;
  }
}

function updateImportDraftAfterSave(savedHero, slug) {
  const stored = loadImportDraft();
  if (!stored) return;

  stored.heroId = savedHero?.id || heroId || null;
  stored.heroSlug = slug || savedHero?.slug || null;
  stored.heroName = savedHero?.name || fields.name?.value.trim() || null;
  stored.savedAt = new Date().toISOString();

  sessionStorage.setItem(IMPORT_KEY, JSON.stringify(stored));
}

function applyImportedData(data) {
  const applied = [];
  const warnings = [];
  const hero = data.hero || {};

  if (hero.name) {
    setFieldValue(fields.name, hero.name, 'input');
    applied.push('nome');
  }

  if (hero.class) {
    const option = findClassOption(hero.class);

    if (option) {
      fields.classId.value = option.value;
      fields.classId.dispatchEvent(new Event('change', { bubbles: true }));
      applied.push('classe');
    } else {
      warnings.push(`Classe "${hero.class}" não encontrada.`);
    }
  }

  if (hero.description) {
    setFieldValue(fields.description, hero.description, 'input');
    applied.push('descrição');
  }

  if (hero.displayOrder !== null) {
    setFieldValue(fields.displayOrder, hero.displayOrder);
    applied.push('ordem');
  }

  if (hero.active !== null) {
    setFieldValue(fields.enabled, hero.active);
    applied.push('publicação');
  }

  const statsOutcome =
    applyImportedStatsData(
      data,
      {
        announce: false
      }
    );

  if (statsOutcome.applied) {
    applied.push(
      `${statsOutcome.applied} campo(s) de status/arma`
    );
  }

  if (statsOutcome.missing.length) {
    warnings.push(
      `${statsOutcome.missing.length} campo(s) de status/arma sem correspondência.`
    );
  }

  updateAllPreviews();
  saveImportDraft(data);
  refreshImportedStatsButton();

  return { applied, warnings };
}

function injectImportUi() {
  if (document.getElementById('hero-import-open')) return;

  const style = document.createElement('style');
  style.id = 'hero-import-style';

  style.textContent = `
    .hero-import-backdrop{
      position:fixed;inset:0;z-index:10000;display:none;
      align-items:center;justify-content:center;padding:18px;
      background:rgba(2,6,15,.84);backdrop-filter:blur(8px)
    }
    .hero-import-backdrop.is-open{display:flex}
    .hero-import-modal{
      width:min(920px,100%);max-height:calc(100vh - 36px);
      overflow:auto;border:1px solid var(--admin-line);
      border-radius:16px;background:#0b1324;
      box-shadow:0 24px 80px rgba(0,0,0,.52)
    }
    .hero-import-head{
      position:sticky;top:0;z-index:2;display:flex;
      justify-content:space-between;gap:16px;padding:18px 20px;
      border-bottom:1px solid var(--admin-line);background:#0b1324
    }
    .hero-import-head h2{margin:0;font-size:20px}
    .hero-import-head p{margin:6px 0 0;color:var(--admin-muted);font-size:12px}
    .hero-import-body{display:grid;gap:16px;padding:20px}
    .hero-import-card{
      padding:15px;border:1px solid var(--admin-line);
      border-radius:12px;background:#08101e
    }
    .hero-import-card h3{margin:0 0 7px;font-size:14px}
    .hero-import-card p{margin:0;color:var(--admin-muted);font-size:11px}
    .hero-import-textarea{
      width:100%;min-height:220px;margin-top:12px;resize:vertical;
      font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace
    }
    #hero-import-prompt{min-height:170px}
    .hero-import-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:12px}
    .hero-import-result{display:grid;gap:8px;margin-top:12px}
    .hero-import-summary{
      display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px
    }
    .hero-import-summary div{
      padding:10px;border:1px solid var(--admin-line);
      border-radius:9px;background:#0c1729
    }
    .hero-import-summary small{
      display:block;color:var(--admin-muted);font-size:9px;
      font-weight:800;text-transform:uppercase
    }
    .hero-import-summary strong{display:block;margin-top:4px;font-size:15px}
    .hero-import-note{
      padding:9px 11px;border:1px solid var(--admin-line);
      border-radius:8px;background:#0c1729;color:#c8cfdd;
      font-size:11px;line-height:1.5
    }
    .hero-import-note.ok{border-color:#28583a;color:#8fd3a6}
    .hero-import-note.warn{border-color:#6f5618;color:#ffd76d}
    .hero-import-note.error{border-color:#75353d;color:#ff9da5}
    @media(max-width:700px){
      .hero-import-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
  `;

  document.head.appendChild(style);

  const actions = document.querySelector('.hero-editor-toolbar-actions');
  if (!actions) return;

  const openButton = document.createElement('button');
  openButton.id = 'hero-import-open';
  openButton.type = 'button';
  openButton.className = 'admin-button';
  openButton.textContent = 'Importar dados';
  actions.insertBefore(openButton, actions.firstChild);

  const backdrop = document.createElement('div');
  backdrop.id = 'hero-import-backdrop';
  backdrop.className = 'hero-import-backdrop';

  backdrop.innerHTML = `
    <section class="hero-import-modal" role="dialog" aria-modal="true">
      <header class="hero-import-head">
        <div>
          <h2>Importar dados do herói</h2>
          <p>Cole o JSON produzido pelo ChatGPT. Nada será salvo automaticamente.</p>
        </div>
        <button id="hero-import-close" type="button" class="admin-button">✕</button>
      </header>

      <div class="hero-import-body">
        <section class="hero-import-card">
          <h3>1. Prompt para o ChatGPT</h3>
          <p>Envie os prints do herói e cole este prompt.</p>
          <textarea
            id="hero-import-prompt"
            class="admin-textarea hero-import-textarea"
            readonly
          ></textarea>
          <div class="hero-import-actions">
            <button id="hero-import-copy" type="button" class="admin-button">
              Copiar prompt
            </button>
          </div>
        </section>

        <section class="hero-import-card">
          <h3>2. JSON retornado</h3>
          <p>É aceito JSON puro ou dentro de um bloco de código.</p>
          <textarea
            id="hero-import-json"
            class="admin-textarea hero-import-textarea"
            placeholder="Cole aqui o JSON..."
          ></textarea>

          <div class="hero-import-actions">
            <button id="hero-import-validate" type="button" class="admin-button">
              Validar dados
            </button>
            <button
              id="hero-import-apply"
              type="button"
              class="admin-button primary"
              disabled
            >
              Preencher formulário
            </button>
            <button id="hero-import-clear" type="button" class="admin-button">
              Limpar
            </button>
          </div>

          <div id="hero-import-result" class="hero-import-result"></div>
        </section>

        <div class="hero-import-note">
          Informações gerais, status e arma são preenchidos nesta mesma tela.
          Mídias e habilidades continuam manuais.
        </div>
      </div>
    </section>
  `;

  document.body.appendChild(backdrop);

  const promptArea = document.getElementById('hero-import-prompt');
  const jsonArea = document.getElementById('hero-import-json');
  const resultArea = document.getElementById('hero-import-result');
  const applyButton = document.getElementById('hero-import-apply');

  let validatedData = null;

  promptArea.value = getImportPrompt();

  function closeModal() {
    backdrop.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function openModal() {
    backdrop.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    const stored = loadImportDraft();
    if (stored?.data && !jsonArea.value.trim()) {
      jsonArea.value = JSON.stringify(stored.data, null, 2);
    }

    jsonArea.focus();
  }

  function clearValidation() {
    validatedData = null;
    applyButton.disabled = true;
    resultArea.innerHTML = '';
  }

  function validateJson() {
    try {
      const parsed = JSON.parse(extractJsonText(jsonArea.value));
      validatedData = normalizeImportedData(parsed);

      const classOption = validatedData.hero.class
        ? findClassOption(validatedData.hero.class)
        : null;

      resultArea.innerHTML = `
        <div class="hero-import-summary">
          <div><small>Informações</small><strong>${countValues(validatedData.hero)}</strong></div>
          <div><small>Status</small><strong>${countValues(validatedData.status)}</strong></div>
          <div><small>Arma resumida</small><strong>${countValues(validatedData.weaponSummary)}</strong></div>
          <div><small>Arma detalhada</small><strong>${countValues(validatedData.weaponDetails)}</strong></div>
        </div>

        <div class="hero-import-note ${validatedData.hero.name ? 'ok' : 'warn'}">
          ${validatedData.hero.name
            ? `Nome reconhecido: ${escapeHtml(validatedData.hero.name)}.`
            : 'Nome não informado.'}
        </div>

        <div class="hero-import-note ${classOption ? 'ok' : 'warn'}">
          ${validatedData.hero.class
            ? (
                classOption
                  ? `Classe encontrada: ${escapeHtml(classOption.textContent.trim())}.`
                  : `Classe não encontrada: ${escapeHtml(validatedData.hero.class)}.`
              )
            : 'Classe não informada.'}
        </div>
      `;

      applyButton.disabled = false;
      showMessage('JSON validado. Revise antes de preencher.', 'ok');
      return validatedData;
    } catch (error) {
      clearValidation();
      resultArea.innerHTML = `
        <div class="hero-import-note error">
          ${escapeHtml(error.message || 'JSON inválido.')}
        </div>
      `;
      showMessage(error.message || 'JSON inválido.', 'error');
      return null;
    }
  }

  openButton.addEventListener('click', openModal);
  document.getElementById('hero-import-close').addEventListener('click', closeModal);

  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeModal();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && backdrop.classList.contains('is-open')) {
      closeModal();
    }
  });

  document.getElementById('hero-import-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getImportPrompt());
    } catch {
      promptArea.select();
      document.execCommand('copy');
    }
    showMessage('Prompt copiado.', 'ok');
  });

  document.getElementById('hero-import-validate').addEventListener('click', validateJson);

  document.getElementById('hero-import-apply').addEventListener('click', () => {
    const data = validatedData || validateJson();
    if (!data) return;

    const outcome = applyImportedData(data);
    let text = outcome.applied.length
      ? `${outcome.applied.length} campo(s) preenchido(s): ${outcome.applied.join(', ')}.`
      : 'Nenhum campo geral pôde ser preenchido.';

    if (outcome.warnings.length) {
      text += ` ${outcome.warnings.join(' ')}`;
    }

    showMessage(text, outcome.applied.length ? 'ok' : 'error');
    closeModal();
  });

  document.getElementById('hero-import-clear').addEventListener('click', () => {
    jsonArea.value = '';
    clearValidation();
    jsonArea.focus();
  });

  jsonArea.addEventListener('input', clearValidation);
}

/* =========================================================
   CARREGAMENTO DO HERÓI
========================================================= */

function populateHero(hero) {
  currentHero = hero;

  fields.name.value = hero.name ?? '';
  fields.slug.value = hero.slug ?? '';
  fields.classId.value = hero.class_id ?? '';
  fields.displayOrder.value = String(hero.display_order ?? 0);
  fields.description.value = hero.description ?? '';
  fields.enabled.checked = hero.enabled !== false;

  mainEditor.setSource(getPublicUrl(hero.image_path), {
    scale: hero.image_scale ?? 1,
    offsetX: hero.image_offset_x ?? 0,
    offsetY: hero.image_offset_y ?? 0
  });

  cardEditor.setSource(getPublicUrl(hero.card_image_path), {
    scale: hero.card_image_scale ?? 1,
    offsetX: hero.card_image_offset_x ?? 0,
    offsetY: hero.card_image_offset_y ?? 0
  });

  gifEditor.setSource(getPublicUrl(hero.gif_path), {
    scale: hero.gif_scale ?? 1,
    offsetX: hero.gif_offset_x ?? 0,
    offsetY: hero.gif_offset_y ?? 0
  });

  const editorTitle = document.getElementById('editor-title');
  if (editorTitle) editorTitle.textContent = `Editar ${hero.name}`;
  if (saveButton) saveButton.textContent = 'Atualizar herói';

  updateAllPreviews();
}

async function loadHero() {
  if (!heroId) return;

  showMessage('Carregando herói...');

  const { data, error } = await supabase
    .from('heroes')
    .select(`
      id, name, slug, description, class_id, enabled, display_order,
      image_path, image_scale, image_offset_x, image_offset_y,
      card_image_path, card_image_scale, card_image_offset_x, card_image_offset_y,
      gif_path, gif_scale, gif_offset_x, gif_offset_y
    `)
    .eq('id', heroId)
    .single();

  if (error) throw error;

  populateHero(data);
  await loadIntegratedStats(data.id);
  refreshImportedStatsButton();
  showMessage('');
}

/* =========================================================
   VALIDAÇÃO, UPLOAD E SALVAMENTO
========================================================= */

function validateForm() {
  const name = fields.name.value.trim();

  if (!name) throw new Error('Informe o nome do herói.');

  const slug = slugify(name);

  if (!slug) throw new Error('Não foi possível gerar o identificador.');

  fields.slug.value = slug;
  return slug;
}

async function validateSlugAvailability(slug) {
  let query = supabase
    .from('heroes')
    .select('id')
    .eq('slug', slug)
    .limit(1);

  if (heroId) query = query.neq('id', heroId);

  const { data, error } = await query;

  if (error) throw error;

  if (data?.length) {
    throw new Error(`Já existe outro herói usando o identificador "${slug}".`);
  }
}

async function uploadFile({ file, heroSlug, mediaType, allowedTypes }) {
  if (!file) return null;

  validateFile(file, allowedTypes);

  const path =
    `Heros/${heroSlug}/${mediaType}/` +
    `${createUniqueId()}-${sanitizeFilename(file.name)}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type
    });

  if (error) throw error;
  return path;
}

async function uploadSelectedMedia(slug) {
  const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

  const [imagePath, cardImagePath, gifPath] = await Promise.all([
    uploadFile({
      file: fields.imageFile.files?.[0],
      heroSlug: slug,
      mediaType: 'Main',
      allowedTypes: imageTypes
    }),
    uploadFile({
      file: fields.cardFile.files?.[0],
      heroSlug: slug,
      mediaType: 'Card',
      allowedTypes: imageTypes
    }),
    uploadFile({
      file: fields.gifFile.files?.[0],
      heroSlug: slug,
      mediaType: 'GIF',
      allowedTypes: ['image/gif']
    })
  ]);

  return { imagePath, cardImagePath, gifPath };
}

function collectPayload(slug, uploadedMedia) {
  const mainState = mainEditor.getState();
  const cardState = cardEditor.getState();
  const gifState = gifEditor.getState();

  return {
    name: fields.name.value.trim(),
    slug,
    description: fields.description.value.trim() || null,
    class_id: fields.classId.value || null,
    enabled: fields.enabled.checked,
    display_order: toNumber(fields.displayOrder.value, 0),

    image_path: uploadedMedia.imagePath || currentHero?.image_path || null,
    image_fit: 'contain',
    image_position: '50% 50%',
    image_scale: mainState.scale,
    image_offset_x: mainState.offsetX,
    image_offset_y: mainState.offsetY,

    card_image_path:
      uploadedMedia.cardImagePath || currentHero?.card_image_path || null,
    card_image_scale: cardState.scale,
    card_image_offset_x: cardState.offsetX,
    card_image_offset_y: cardState.offsetY,

    gif_path: uploadedMedia.gifPath || currentHero?.gif_path || null,
    gif_scale: gifState.scale,
    gif_offset_x: gifState.offsetX,
    gif_offset_y: gifState.offsetY
  };
}

async function createHero(payload) {
  const { data, error } = await supabase
    .from('heroes')
    .insert(payload)
    .select('id,name,slug')
    .single();

  if (error) throw error;
  return data;
}

async function updateHero(payload) {
  const { data, error } = await supabase
    .from('heroes')
    .update(payload)
    .eq('id', heroId)
    .select('id,name,slug')
    .single();

  if (error) throw error;
  return data;
}

async function saveHero(event) {
  event.preventDefault();

  if (isSaving) return;
  isSaving = true;

  const originalButtonText = saveButton?.textContent || 'Salvar herói';

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Salvando...';
  }

  try {
    const slug = validateForm();

    await validateSlugAvailability(slug);

    showMessage('Enviando mídias...');
    const uploadedMedia = await uploadSelectedMedia(slug);

    showMessage(heroId ? 'Atualizando herói...' : 'Criando herói...');
    const payload = collectPayload(slug, uploadedMedia);

    const savedHero = heroId
      ? await updateHero(payload)
      : await createHero(payload);

    showMessage('Salvando status e arma...');
    await saveIntegratedStats(savedHero.id);

    updateImportDraftAfterSave(savedHero, slug);

    showMessage(
      heroId
        ? 'Herói, status e arma atualizados com sucesso.'
        : 'Herói, status e arma criados com sucesso.',
      'ok'
    );

    if (!heroId) {
      setTimeout(() => {
        location.href = `./hero-editor.html?id=${savedHero.id}&tab=stats`;
      }, 700);
      return;
    }

    currentHero = { ...currentHero, ...payload, id: savedHero.id };

    fields.imageFile.value = '';
    fields.cardFile.value = '';
    fields.gifFile.value = '';

    updateAllPreviews();
  } catch (error) {
    console.error('Erro ao salvar herói:', error);
    showMessage(error.message || 'Não foi possível salvar o herói.', 'error');
  } finally {
    isSaving = false;

    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = heroId ? 'Atualizar herói' : originalButtonText;
    }
  }
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

async function initialize() {
  try {
    showMessage('Preparando editor...');

    createAllMediaEditors();
    bindAutomaticSlug();
    bindGeneralPreview();
    bindIntegratedStatsControls();

    form?.addEventListener('submit', saveHero);

    await Promise.all([
      loadHeroClasses(),
      loadStatDefinitions()
    ]);

    if (heroId) {
      await loadHero();
    } else {
      await loadNextDisplayOrder();
      fields.enabled.checked = true;

      mainEditor.reset();
      cardEditor.reset();
      gifEditor.reset();
      renderIntegratedStatsFields();

      showMessage('');
    }

    injectImportUi();
    refreshImportedStatsButton();
    updateAllPreviews();

    window.addEventListener('resize', () => {
      mainEditor.resize();
      cardEditor.resize();
      gifEditor.resize();
    });
  } catch (error) {
    console.error('Erro ao iniciar editor:', error);
    showMessage(error.message || 'Não foi possível carregar o editor.', 'error');
  }
}

await initialize();