import { supabase } from '../../js/supabase.js';

const IMPORT_KEY = 'hero-import-draft';

const params = new URLSearchParams(location.search);
const requestedHeroId = params.get('hero');
const importRequested = params.get('import') === '1';

const heroSelect =
  document.getElementById('hero-select');

const heroStatsGrid =
  document.getElementById('hero-stats-grid');

const weaponStatsGrid =
  document.getElementById('weapon-stats-grid');

const previewGrid =
  document.getElementById('preview-grid');

const statsArea =
  document.getElementById('stats-area');

const message =
  document.getElementById('message');

const weaponNameInput =
  document.getElementById('weapon-name');

const saveButton =
  document.getElementById('save-all');

const heroArt =
  document.getElementById('hero-art');

const heroName =
  document.getElementById('hero-name');

const heroSlug =
  document.getElementById('hero-slug');

const backToHeroEditor =
  document.getElementById('back-to-hero-editor');

let heroes = [];
let definitions = [];
let currentHero = null;
let isLoadingHero = false;
let isSaving = false;
let importSnapshot = null;
let importedDraft = null;

const HERO_CATEGORIES = new Set([
  'hero',
  'defense',
  'utility'
]);

const WEAPON_CATEGORIES = new Set([
  'weapon',
  'offense',
  'ability'
]);

/*
 * Cada campo do JSON possui uma lista de nomes possíveis.
 * O sistema compara esses nomes com:
 *   - definition.key
 *   - definition.name
 *
 * Assim ele não depende de um único nome fixo no banco.
 */
const IMPORT_ALIASES = {
  hero: {
    power: [
      'power',
      'hero_power',
      'poder',
      'poder geral'
    ],

    health: [
      'health',
      'life',
      'hp',
      'vida',
      'vida total'
    ],

    damage: [
      'damage',
      'hero_damage',
      'dano',
      'dano do heroi'
    ],

    armor: [
      'armor',
      'armour',
      'armadura',
      'armadura total'
    ],

    visionRange: [
      'vision_range',
      'visionrange',
      'hero_vision_range',
      'alcance de visao',
      'visao'
    ],

    movementNoiseRadius: [
      'movement_noise_radius',
      'movementnoiseradius',
      'noise_radius',
      'raio maximo do barulho de movimentacao do heroi',
      'raio do barulho',
      'barulho de movimentacao'
    ],

    maxMovementSpeed: [
      'max_movement_speed',
      'maxmovementspeed',
      'movement_speed',
      'velocidade maxima de movimentacao do heroi',
      'velocidade maxima'
    ],

    aimedMovementSpeed: [
      'aimed_movement_speed',
      'aimedmovementspeed',
      'movement_speed_aiming',
      'velocidade maxima de movimentacao do heroi ao mirar',
      'velocidade ao mirar'
    ],

    penetrationResistance: [
      'penetration_resistance',
      'penetrationresistance',
      'resistencia a perfuracao do heroi',
      'resistencia a perfuracao'
    ],

    armorValue: [
      'armor_value',
      'armorvalue',
      'valor de armadura',
      'valor da armadura'
    ],

    armorResistance: [
      'armor_resistance',
      'armorresistance',
      'resistencia de armadura'
    ]
  },

  weapon: {
    firepower: [
      'firepower',
      'weapon_firepower',
      'poder de fogo'
    ],

    armorBreak: [
      'armor_break',
      'armorbreak',
      'quebra de armadura'
    ],

    fireRate: [
      'fire_rate',
      'firerate',
      'cadencia',
      'cadencia de tiro'
    ],

    magazineCapacity: [
      'magazine_capacity',
      'magazinecapacity',
      'ammo_capacity',
      'capacidade de municao'
    ],

    effectiveRange: [
      'effective_range',
      'effectiverange',
      'alcance efetivo'
    ],

    aimingStability: [
      'aiming_stability',
      'aimingstability',
      'estabilidade de mira'
    ],

    damagePerShot: [
      'damage_per_shot',
      'damagepershot',
      'weapon_damage',
      'dano da arma por tiro',
      'dano por tiro'
    ],

    healthDamageMultiplier: [
      'health_damage_multiplier',
      'healthdamagemultiplier',
      'damage_to_health_multiplier',
      'modificador de dano da arma a vida',
      'modificador contra vida'
    ],

    armorPenetration: [
      'armor_penetration',
      'armorpenetration',
      'perfuracao de armadura da arma',
      'perfuracao de armadura'
    ],

    penetrationPower: [
      'penetration_power',
      'penetrationpower',
      'poder de perfuracao da arma',
      'poder de perfuracao'
    ],

    armorDroneMultiplier: [
      'armor_drone_multiplier',
      'armordronemultiplier',
      'damage_to_armor_drone_multiplier',
      'modificador de dano por armas a armaduras e drones',
      'modificador contra armadura e drones'
    ],

    shotsPerSecond: [
      'shots_per_second',
      'shotspersecond',
      'fire_rate_per_second',
      'cadencia de tiro da arma por segundo',
      'tiros por segundo'
    ],

    reloadTime: [
      'reload_time',
      'reloadtime',
      'tempo de recarga da arma',
      'tempo de recarga'
    ],

    magazineSize: [
      'magazine_size',
      'magazinesize',
      'tamanho do pente da arma',
      'tamanho do pente'
    ],

    hipFireRange: [
      'hip_fire_range',
      'hipfirerange',
      'weapon_range',
      'alcance do tiro da arma',
      'alcance sem mira'
    ],

    aimedRange: [
      'aimed_range',
      'aimedrange',
      'weapon_aim_range',
      'alcance de tiro da arma ao mirar',
      'alcance com mira'
    ],

    dispersion: [
      'dispersion',
      'weapon_dispersion',
      'dispersao de tiro da arma',
      'dispersao'
    ],

    movingDispersion: [
      'moving_dispersion',
      'movingdispersion',
      'weapon_moving_dispersion',
      'dispersao de tiro da arma ao se movimentar',
      'dispersao em movimento'
    ],

    aimedDispersion: [
      'aimed_dispersion',
      'aimeddispersion',
      'weapon_aimed_dispersion',
      'dispersao de tiro da arma ao mirar',
      'dispersao com mira'
    ],

    aimTime: [
      'aim_time',
      'aimtime',
      'weapon_aim_time',
      'tempo de mira da arma',
      'tempo de mira'
    ],

    dispersionFactor: [
      'dispersion_factor',
      'dispersionfactor',
      'weapon_dispersion_factor',
      'fator de dispersao da arma',
      'fator de dispersao'
    ]
  }
};

/* =========================================================
   UTILITÁRIOS
========================================================= */

function setMessage(
  text = '',
  type = ''
) {
  if (!message) {
    return;
  }

  message.textContent = text;
  message.className =
    `stats-message${type ? ` ${type}` : ''}`;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

function slugify(value = '') {
  return normalizeText(value)
    .replace(/\s+/g, '-');
}

function toNumber(
  value,
  fallback = 0
) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function nullableNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const normalized =
    typeof value === 'string'
      ? value.replace(',', '.').trim()
      : value;

  const number = Number(normalized);

  return Number.isFinite(number)
    ? number
    : null;
}

function publicMediaUrl(path) {
  if (!path) {
    return '';
  }

  return supabase.storage
    .from('game-media')
    .getPublicUrl(path)
    .data
    .publicUrl;
}

function formatValue(
  value,
  definition = {}
) {
  const number =
    toNumber(value, 0);

  const decimals =
    Math.max(
      0,
      toNumber(
        definition.decimals,
        0
      )
    );

  const formatted =
    number.toLocaleString(
      'pt-BR',
      {
        minimumFractionDigits:
          decimals,

        maximumFractionDigits:
          decimals
      }
    );

  if (!definition.unit) {
    return formatted;
  }

  if (definition.unit === 'x') {
    return `x${formatted}`;
  }

  return `${formatted}${definition.unit}`;
}

function getInputStep(definition) {
  const decimals =
    Math.max(
      0,
      toNumber(
        definition.decimals,
        0
      )
    );

  if (decimals === 0) {
    return '1';
  }

  return String(
    1 / Math.pow(10, decimals)
  );
}

function findDefinition(statKey) {
  return definitions.find(
    definition =>
      definition.key === statKey
  );
}

function loadImportDraft() {
  try {
    const stored =
      sessionStorage.getItem(
        IMPORT_KEY
      );

    if (!stored) {
      return null;
    }

    const parsed =
      JSON.parse(stored);

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.data
    ) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn(
      'Rascunho de importação inválido:',
      error
    );

    return null;
  }
}

function hasImportedData(draft) {
  return Boolean(
    draft?.data?.status ||
    draft?.data?.weaponSummary ||
    draft?.data?.weaponDetails
  );
}

/* =========================================================
   BOTÕES DE IMPORTAÇÃO E DESFAZER
========================================================= */

function injectImportControls() {
  if (
    document.getElementById(
      'apply-imported-stats'
    )
  ) {
    return;
  }

  const actions =
    document.querySelector(
      '.hero-stats-toolbar-actions'
    );

  if (!actions) {
    return;
  }

  const applyButton =
    document.createElement('button');

  applyButton.id =
    'apply-imported-stats';

  applyButton.type =
    'button';

  applyButton.className =
    'admin-button';

  applyButton.textContent =
    'Aplicar dados importados';

  applyButton.hidden =
    !hasImportedData(
      importedDraft
    );

  const undoButton =
    document.createElement('button');

  undoButton.id =
    'undo-imported-stats';

  undoButton.type =
    'button';

  undoButton.className =
    'admin-button';

  undoButton.textContent =
    'Desfazer preenchimento';

  undoButton.disabled =
    true;

  actions.insertBefore(
    applyButton,
    saveButton
  );

  actions.insertBefore(
    undoButton,
    saveButton
  );

  applyButton.addEventListener(
    'click',
    () => {
      applyImportedStats({
        announce: true
      });
    }
  );

  undoButton.addEventListener(
    'click',
    undoImportedStats
  );
}

function updateUndoButton() {
  const undoButton =
    document.getElementById(
      'undo-imported-stats'
    );

  if (undoButton) {
    undoButton.disabled =
      !importSnapshot;
  }
}

function captureCurrentFormSnapshot() {
  const values = {};

  document
    .querySelectorAll(
      '.stat-field'
    )
    .forEach(field => {
      const input =
        field.querySelector('input');

      if (!input) {
        return;
      }

      values[
        `${field.dataset.group}:${field.dataset.statKey}`
      ] = input.value;
    });

  return {
    heroId:
      currentHero?.id || null,

    weaponName:
      weaponNameInput.value,

    values
  };
}

function restoreFormSnapshot(snapshot) {
  if (!snapshot) {
    return;
  }

  if (
    snapshot.heroId &&
    currentHero &&
    String(snapshot.heroId) !==
      String(currentHero.id)
  ) {
    setMessage(
      'O backup pertence a outro herói.',
      'error'
    );

    return;
  }

  weaponNameInput.value =
    snapshot.weaponName ?? '';

  document
    .querySelectorAll(
      '.stat-field'
    )
    .forEach(field => {
      const input =
        field.querySelector('input');

      if (!input) {
        return;
      }

      const key =
        `${field.dataset.group}:${field.dataset.statKey}`;

      input.value =
        snapshot.values[key] ?? '';
    });

  renderPreview();
}

function undoImportedStats() {
  if (!importSnapshot) {
    setMessage(
      'Não há preenchimento para desfazer.',
      'error'
    );

    return;
  }

  restoreFormSnapshot(
    importSnapshot
  );

  importSnapshot =
    null;

  updateUndoButton();

  setMessage(
    'Os valores anteriores foram restaurados. Nada foi salvo.',
    'ok'
  );
}

/* =========================================================
   CAMPOS DE STATUS
========================================================= */

function createStatField(
  definition,
  group,
  currentValue = ''
) {
  const wrapper =
    document.createElement('div');

  wrapper.className =
    'stat-field';

  wrapper.dataset.statKey =
    definition.key;

  wrapper.dataset.group =
    group;

  const label =
    document.createElement('label');

  const labelText =
    document.createElement('span');

  labelText.textContent =
    definition.name ||
    definition.key;

  label.appendChild(labelText);

  if (definition.unit) {
    const unit =
      document.createElement('span');

    unit.className = 'unit';
    unit.textContent =
      definition.unit;

    label.appendChild(unit);
  }

  const description =
    document.createElement('small');

  description.textContent =
    definition.description || '';

  const input =
    document.createElement('input');

  input.type = 'number';
  input.step =
    getInputStep(definition);

  input.value =
    currentValue === null ||
    currentValue === undefined
      ? ''
      : String(currentValue);

  input.placeholder = '0';

  if (
    definition.value_type ===
    'integer'
  ) {
    input.step = '1';
  }

  input.addEventListener(
    'input',
    renderPreview
  );

  wrapper.append(
    label,
    description,
    input
  );

  return wrapper;
}

function renderEmptyDefinitions(
  container,
  text
) {
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="stats-empty">
      ${escapeHtml(text)}
    </div>
  `;
}

function renderFields(
  heroValues = {},
  weaponValues = {}
) {
  heroStatsGrid.innerHTML = '';
  weaponStatsGrid.innerHTML = '';

  const heroDefinitions =
    definitions.filter(
      definition =>
        HERO_CATEGORIES.has(
          definition.category
        )
    );

  const weaponDefinitions =
    definitions.filter(
      definition =>
        WEAPON_CATEGORIES.has(
          definition.category
        )
    );

  if (!heroDefinitions.length) {
    renderEmptyDefinitions(
      heroStatsGrid,
      'Nenhuma definição de status do herói foi encontrada.'
    );
  } else {
    heroDefinitions.forEach(
      definition => {
        heroStatsGrid.appendChild(
          createStatField(
            definition,
            'hero',
            heroValues[
              definition.key
            ] ?? ''
          )
        );
      }
    );
  }

  if (!weaponDefinitions.length) {
    renderEmptyDefinitions(
      weaponStatsGrid,
      'Nenhuma definição de status da arma foi encontrada.'
    );
  } else {
    weaponDefinitions.forEach(
      definition => {
        weaponStatsGrid.appendChild(
          createStatField(
            definition,
            'weapon',
            weaponValues[
              definition.key
            ] ?? ''
          )
        );
      }
    );
  }

  renderPreview();
}

function collectFields(group) {
  const fields = [
    ...document.querySelectorAll(
      `.stat-field[data-group="${group}"]`
    )
  ];

  return fields
    .map(field => {
      const input =
        field.querySelector('input');

      const rawValue =
        input?.value.trim() ?? '';

      return {
        stat_key:
          field.dataset.statKey,

        rawValue
      };
    })
    .filter(
      item =>
        item.stat_key &&
        item.rawValue !== ''
    )
    .map(item => {
      const value =
        Number(item.rawValue);

      if (!Number.isFinite(value)) {
        throw new Error(
          `Valor inválido em "${item.stat_key}".`
        );
      }

      return {
        stat_key:
          item.stat_key,

        value
      };
    });
}

/* =========================================================
   LOCALIZAÇÃO DINÂMICA DE DEFINIÇÕES
========================================================= */

function scoreDefinitionMatch(
  definition,
  aliases
) {
  const key =
    normalizeText(
      definition.key
    );

  const name =
    normalizeText(
      definition.name
    );

  let bestScore = 0;

  for (const alias of aliases) {
    const normalizedAlias =
      normalizeText(alias);

    if (!normalizedAlias) {
      continue;
    }

    if (
      key === normalizedAlias ||
      name === normalizedAlias
    ) {
      bestScore =
        Math.max(
          bestScore,
          100
        );

      continue;
    }

    if (
      key.replace(/\s/g, '') ===
        normalizedAlias.replace(/\s/g, '') ||
      name.replace(/\s/g, '') ===
        normalizedAlias.replace(/\s/g, '')
    ) {
      bestScore =
        Math.max(
          bestScore,
          95
        );

      continue;
    }

    if (
      key.includes(normalizedAlias) ||
      name.includes(normalizedAlias) ||
      normalizedAlias.includes(key) ||
      normalizedAlias.includes(name)
    ) {
      bestScore =
        Math.max(
          bestScore,
          70
        );
    }
  }

  return bestScore;
}

function findBestDefinition(
  group,
  aliases
) {
  const allowedCategories =
    group === 'hero'
      ? HERO_CATEGORIES
      : WEAPON_CATEGORIES;

  const candidates =
    definitions
      .filter(
        definition =>
          allowedCategories.has(
            definition.category
          )
      )
      .map(definition => ({
        definition,

        score:
          scoreDefinitionMatch(
            definition,
            aliases
          )
      }))
      .filter(
        item =>
          item.score > 0
      )
      .sort(
        (first, second) =>
          second.score -
          first.score
      );

  return candidates[0]?.definition ||
    null;
}

function findInputForDefinition(
  group,
  definition
) {
  if (!definition) {
    return null;
  }

  return document.querySelector(
    `.stat-field[data-group="${group}"][data-stat-key="${CSS.escape(definition.key)}"] input`
  );
}

/* =========================================================
   APLICAÇÃO DOS DADOS IMPORTADOS
========================================================= */

function buildImportEntries() {
  const data =
    importedDraft?.data || {};

  const heroData =
    data.status || {};

  const weaponSummary =
    data.weaponSummary || {};

  const weaponDetails =
    data.weaponDetails || {};

  const heroEntries =
    Object.entries(
      IMPORT_ALIASES.hero
    ).map(
      ([sourceKey, aliases]) => ({
        sourceKey,
        aliases,
        value:
          nullableNumber(
            heroData[sourceKey]
          )
      })
    );

  const weaponSource = {
    ...weaponSummary,
    ...weaponDetails
  };

  const weaponEntries =
    Object.entries(
      IMPORT_ALIASES.weapon
    ).map(
      ([sourceKey, aliases]) => ({
        sourceKey,
        aliases,
        value:
          nullableNumber(
            weaponSource[sourceKey]
          )
      })
    );

  return {
    heroEntries,
    weaponEntries,
    weaponName:
      weaponSummary.name ||
      weaponDetails.name ||
      null
  };
}

function applyImportedStats({
  announce = false
} = {}) {
  if (!currentHero) {
    if (announce) {
      setMessage(
        'Selecione ou identifique um herói antes de aplicar os dados.',
        'error'
      );
    }

    return {
      applied: 0,
      missing: []
    };
  }

  if (!hasImportedData(importedDraft)) {
    if (announce) {
      setMessage(
        'Nenhum dado importado foi encontrado no navegador.',
        'error'
      );
    }

    return {
      applied: 0,
      missing: []
    };
  }

  /*
   * O snapshot é criado somente na primeira aplicação.
   * Assim o botão Desfazer sempre volta aos valores que
   * existiam antes da importação.
   */
  if (!importSnapshot) {
    importSnapshot =
      captureCurrentFormSnapshot();

    updateUndoButton();
  }

  const {
    heroEntries,
    weaponEntries,
    weaponName
  } =
    buildImportEntries();

  let applied = 0;
  const missing = [];

  for (
    const entry
    of heroEntries
  ) {
    if (entry.value === null) {
      continue;
    }

    const definition =
      findBestDefinition(
        'hero',
        entry.aliases
      );

    const input =
      findInputForDefinition(
        'hero',
        definition
      );

    if (!definition || !input) {
      missing.push(
        `Herói: ${entry.sourceKey}`
      );

      continue;
    }

    input.value =
      String(entry.value);

    applied += 1;
  }

  for (
    const entry
    of weaponEntries
  ) {
    if (entry.value === null) {
      continue;
    }

    const definition =
      findBestDefinition(
        'weapon',
        entry.aliases
      );

    const input =
      findInputForDefinition(
        'weapon',
        definition
      );

    if (!definition || !input) {
      missing.push(
        `Arma: ${entry.sourceKey}`
      );

      continue;
    }

    input.value =
      String(entry.value);

    applied += 1;
  }

  if (weaponName) {
    weaponNameInput.value =
      String(weaponName);

    applied += 1;
  }

  renderPreview();

  if (announce) {
    let text =
      `${applied} campo(s) preenchido(s) automaticamente.`;

    if (missing.length) {
      text +=
        ` ${missing.length} campo(s) não possuem definição correspondente no banco.`;
    }

    text +=
      ' Revise e clique em Salvar alterações.';

    setMessage(
      text,
      applied
        ? 'ok'
        : 'error'
    );
  }

  return {
    applied,
    missing
  };
}

/* =========================================================
   PRÉVIA
========================================================= */

function renderPreview() {
  const fields = [
    ...document.querySelectorAll(
      '.stat-field'
    )
  ];

  const filledFields =
    fields.filter(field => {
      const input =
        field.querySelector('input');

      return (
        input &&
        input.value.trim() !== ''
      );
    });

  if (!filledFields.length) {
    previewGrid.innerHTML = `
      <div class="stats-empty">
        Nenhum valor cadastrado ainda.
      </div>
    `;

    return;
  }

  previewGrid.innerHTML =
    filledFields
      .map(field => {
        const statKey =
          field.dataset.statKey;

        const definition =
          findDefinition(statKey);

        const value =
          field
            .querySelector('input')
            .value;

        return `
          <div class="preview-stat">
            <span>
              ${escapeHtml(
                definition?.name ||
                statKey
              )}
            </span>

            <strong>
              ${escapeHtml(
                formatValue(
                  value,
                  definition || {}
                )
              )}
            </strong>
          </div>
        `;
      })
      .join('');
}

/* =========================================================
   HERO SUMMARY
========================================================= */

function clearHeroSummary() {
  currentHero = null;
  importSnapshot = null;

  updateUndoButton();

  heroName.textContent =
    'Nenhum herói selecionado';

  heroSlug.textContent = '—';

  heroArt.textContent =
    'Sem herói';

  weaponNameInput.value = '';

  statsArea.classList.add(
    'hidden'
  );

  if (backToHeroEditor) {
    backToHeroEditor.href =
      './heroes.html';
  }
}

function renderHeroSummary(hero) {
  heroName.textContent =
    hero.name ||
    'Herói sem nome';

  heroSlug.textContent =
    hero.slug ||
    '—';

  const mediaPath =
    hero.card_image_path ||
    hero.image_path ||
    hero.gif_path;

  if (mediaPath) {
    heroArt.innerHTML = `
      <img
        src="${publicMediaUrl(mediaPath)}"
        alt="${escapeHtml(
          hero.name || ''
        )}"
      >
    `;
  } else {
    heroArt.textContent =
      'Sem imagem';
  }

  if (backToHeroEditor) {
    backToHeroEditor.href =
      `./hero-editor.html?id=${encodeURIComponent(
        hero.id
      )}&tab=stats`;
  }
}

/* =========================================================
   IDENTIFICAÇÃO AUTOMÁTICA DO HERÓI
========================================================= */

function findImportedHero() {
  if (!importedDraft) {
    return null;
  }

  const importedId =
    importedDraft.heroId ||
    importedDraft.data?.hero?.id ||
    null;

  if (importedId) {
    const byId =
      heroes.find(
        hero =>
          String(hero.id) ===
          String(importedId)
      );

    if (byId) {
      return byId;
    }
  }

  const importedSlug =
    importedDraft.heroSlug ||
    importedDraft.data?.hero?.slug ||
    (
      importedDraft.data?.hero?.name
        ? slugify(
            importedDraft.data.hero.name
          )
        : ''
    );

  if (importedSlug) {
    const normalizedSlug =
      slugify(importedSlug);

    const bySlug =
      heroes.find(
        hero =>
          slugify(hero.slug) ===
            normalizedSlug ||
          slugify(hero.name) ===
            normalizedSlug
      );

    if (bySlug) {
      return bySlug;
    }
  }

  const importedName =
    importedDraft.heroName ||
    importedDraft.data?.hero?.name ||
    '';

  if (importedName) {
    const normalizedName =
      normalizeText(
        importedName
      );

    const byName =
      heroes.find(
        hero =>
          normalizeText(
            hero.name
          ) === normalizedName
      );

    if (byName) {
      return byName;
    }
  }

  return null;
}

async function selectHeroAutomatically() {
  let hero = null;

  if (requestedHeroId) {
    hero =
      heroes.find(
        item =>
          String(item.id) ===
          String(requestedHeroId)
      ) || null;
  }

  if (!hero) {
    hero =
      findImportedHero();
  }

  if (!hero) {
    return false;
  }

  heroSelect.value =
    String(hero.id);

  const url =
    new URL(
      location.href
    );

  url.searchParams.set(
    'hero',
    hero.id
  );

  if (hasImportedData(importedDraft)) {
    url.searchParams.set(
      'import',
      '1'
    );
  }

  history.replaceState(
    {},
    '',
    url
  );

  await loadHeroStats(
    hero.id,
    {
      applyImport:
        hasImportedData(
          importedDraft
        )
    }
  );

  return true;
}

/* =========================================================
   CARREGAMENTO INICIAL
========================================================= */

function populateHeroSelect() {
  heroSelect.innerHTML = '';

  const emptyOption =
    document.createElement('option');

  emptyOption.value = '';
  emptyOption.textContent =
    'Selecione um herói';

  heroSelect.appendChild(
    emptyOption
  );

  heroes.forEach(hero => {
    const option =
      document.createElement('option');

    option.value = hero.id;
    option.textContent =
      hero.enabled === false
        ? `${hero.name} — inativo`
        : hero.name;

    heroSelect.appendChild(
      option
    );
  });
}

async function loadInitialData() {
  setMessage(
    'Carregando dados...'
  );

  const [
    heroesResult,
    definitionsResult
  ] = await Promise.all([
    supabase
      .from('heroes')
      .select(`
        id,
        name,
        slug,
        image_path,
        card_image_path,
        gif_path,
        enabled
      `)
      .order('name'),

    supabase
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
      .order(
        'display_order',
        {
          ascending: true
        }
      )
  ]);

  if (heroesResult.error) {
    throw heroesResult.error;
  }

  if (definitionsResult.error) {
    throw definitionsResult.error;
  }

  heroes =
    heroesResult.data || [];

  definitions =
    definitionsResult.data || [];

  populateHeroSelect();

  setMessage('');
}

/* =========================================================
   CARREGAMENTO DOS STATUS
========================================================= */

async function loadHeroStats(
  heroId,
  {
    applyImport = false
  } = {}
) {
  if (isLoadingHero) {
    return;
  }

  if (!heroId) {
    clearHeroSummary();
    return;
  }

  const selectedHero =
    heroes.find(
      hero =>
        String(hero.id) ===
        String(heroId)
    );

  if (!selectedHero) {
    clearHeroSummary();

    setMessage(
      'O herói selecionado não foi encontrado.',
      'error'
    );

    return;
  }

  isLoadingHero = true;
  currentHero = selectedHero;
  importSnapshot = null;

  updateUndoButton();

  statsArea.classList.add(
    'hidden'
  );

  setMessage(
    'Carregando status...'
  );

  try {
    const [
      heroStatsResult,
      weaponStatsResult
    ] = await Promise.all([
      supabase
        .from('hero_base_stats')
        .select(
          'stat_key,value'
        )
        .eq(
          'hero_id',
          selectedHero.id
        ),

      supabase
        .from('hero_weapon_stats')
        .select(
          'stat_key,value,weapon_name'
        )
        .eq(
          'hero_id',
          selectedHero.id
        )
    ]);

    if (heroStatsResult.error) {
      throw heroStatsResult.error;
    }

    if (weaponStatsResult.error) {
      throw weaponStatsResult.error;
    }

    const heroValues =
      Object.fromEntries(
        (
          heroStatsResult.data ||
          []
        ).map(row => [
          row.stat_key,
          row.value
        ])
      );

    const weaponValues =
      Object.fromEntries(
        (
          weaponStatsResult.data ||
          []
        ).map(row => [
          row.stat_key,
          row.value
        ])
      );

    weaponNameInput.value =
      weaponStatsResult
        .data?.[0]
        ?.weapon_name ||
      '';

    renderHeroSummary(
      selectedHero
    );

    renderFields(
      heroValues,
      weaponValues
    );

    statsArea.classList.remove(
      'hidden'
    );

    if (applyImport) {
      const result =
        applyImportedStats();

      let text =
        `Herói identificado automaticamente: ${selectedHero.name}. ` +
        `${result.applied} campo(s) importado(s).`;

      if (result.missing.length) {
        text +=
          ` ${result.missing.length} campo(s) não possuem definição correspondente.`;
      }

      text +=
        ' Revise os valores antes de salvar.';

      setMessage(
        text,
        result.applied
          ? 'ok'
          : 'error'
      );
    } else {
      setMessage('');
    }
  } finally {
    isLoadingHero = false;
  }
}

/* =========================================================
   SALVAMENTO SEGURO
========================================================= */

async function getExistingStatKeys(
  table,
  heroId
) {
  const { data, error } =
    await supabase
      .from(table)
      .select('stat_key')
      .eq('hero_id', heroId);

  if (error) {
    throw error;
  }

  return (
    data || []
  ).map(
    row =>
      row.stat_key
  );
}

async function syncStats(
  table,
  heroId,
  rows,
  extra = {}
) {
  const existingKeys =
    await getExistingStatKeys(
      table,
      heroId
    );

  const incomingKeys =
    rows.map(
      row =>
        row.stat_key
    );

  if (rows.length) {
    const payload =
      rows.map(row => ({
        hero_id:
          heroId,

        stat_key:
          row.stat_key,

        value:
          row.value,

        ...extra
      }));

    const { error: upsertError } =
      await supabase
        .from(table)
        .upsert(
          payload,
          {
            onConflict:
              'hero_id,stat_key'
          }
        );

    if (upsertError) {
      throw upsertError;
    }
  }

  const removedKeys =
    existingKeys.filter(
      key =>
        !incomingKeys.includes(key)
    );

  if (removedKeys.length) {
    const { error: deleteError } =
      await supabase
        .from(table)
        .delete()
        .eq(
          'hero_id',
          heroId
        )
        .in(
          'stat_key',
          removedKeys
        );

    if (deleteError) {
      throw deleteError;
    }
  }
}

async function saveAllStats() {
  if (isSaving) {
    return;
  }

  if (!currentHero) {
    setMessage(
      'Selecione um herói.',
      'error'
    );

    return;
  }

  isSaving = true;

  const originalButtonText =
    saveButton.textContent;

  saveButton.disabled = true;
  saveButton.textContent =
    'Salvando...';

  setMessage(
    'Salvando status...'
  );

  try {
    const heroRows =
      collectFields('hero');

    const weaponRows =
      collectFields('weapon');

    const weaponName =
      weaponNameInput
        .value
        .trim() ||
      null;

    await syncStats(
      'hero_base_stats',
      currentHero.id,
      heroRows
    );

    await syncStats(
      'hero_weapon_stats',
      currentHero.id,
      weaponRows,
      {
        weapon_name:
          weaponName
      }
    );

    /*
     * Após salvar com sucesso, o preenchimento deixa de ser
     * apenas temporário. O botão Desfazer local é desativado.
     * A restauração persistente será uma etapa posterior.
     */
    importSnapshot =
      null;

    updateUndoButton();

    setMessage(
      'Status salvos com sucesso.',
      'ok'
    );
  } catch (error) {
    console.error(
      'Erro ao salvar status:',
      error
    );

    setMessage(
      error.message ||
      'Não foi possível salvar os status.',
      'error'
    );
  } finally {
    isSaving = false;

    saveButton.disabled = false;
    saveButton.textContent =
      originalButtonText;
  }
}

/* =========================================================
   EVENTOS
========================================================= */

heroSelect.addEventListener(
  'change',
  async event => {
    const selectedHeroId =
      event.target.value;

    const url =
      new URL(location.href);

    if (selectedHeroId) {
      url.searchParams.set(
        'hero',
        selectedHeroId
      );
    } else {
      url.searchParams.delete(
        'hero'
      );
    }

    history.replaceState(
      {},
      '',
      url
    );

    try {
      await loadHeroStats(
        selectedHeroId,
        {
          applyImport:
            Boolean(
              selectedHeroId &&
              hasImportedData(
                importedDraft
              ) &&
              findImportedHero() &&
              String(
                findImportedHero().id
              ) ===
              String(
                selectedHeroId
              )
            )
        }
      );
    } catch (error) {
      console.error(
        'Erro ao carregar status:',
        error
      );

      setMessage(
        error.message ||
        'Não foi possível carregar os status.',
        'error'
      );
    }
  }
);

weaponNameInput.addEventListener(
  'input',
  () => {
    if (
      currentHero &&
      message.classList.contains('ok')
    ) {
      setMessage('');
    }
  }
);

saveButton.addEventListener(
  'click',
  saveAllStats
);

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

async function initialize() {
  try {
    importedDraft =
      loadImportDraft();

    clearHeroSummary();

    await loadInitialData();

    injectImportControls();

    const selectedAutomatically =
      await selectHeroAutomatically();

    if (selectedAutomatically) {
      return;
    }

    if (
      requestedHeroId &&
      !heroes.some(
        hero =>
          String(hero.id) ===
          String(requestedHeroId)
      )
    ) {
      setMessage(
        'O herói informado na URL não foi encontrado.',
        'error'
      );

      return;
    }

    if (
      hasImportedData(
        importedDraft
      )
    ) {
      const importedName =
        importedDraft.data?.hero?.name ||
        'o herói importado';

      setMessage(
        `Os dados de ${importedName} estão disponíveis, ` +
        'mas o herói ainda não foi encontrado no banco. ' +
        'Salve o herói primeiro ou selecione-o manualmente.',
        'error'
      );
    }
  } catch (error) {
    console.error(
      'Erro ao iniciar editor de status:',
      error
    );

    setMessage(
      error.message ||
      'Não foi possível carregar o editor de status.',
      'error'
    );
  }
}

await initialize();
