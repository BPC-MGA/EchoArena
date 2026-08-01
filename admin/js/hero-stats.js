import { supabase } from '../../js/supabase.js';

const params = new URLSearchParams(location.search);
const requestedHeroId = params.get('hero');

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

function toNumber(
  value,
  fallback = 0
) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
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

async function loadHeroStats(heroId) {
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

    setMessage('');
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

  /*
   * Primeiro cria ou atualiza os valores.
   * Só depois remove os campos apagados.
   *
   * Isso evita apagar todos os status antes
   * de descobrir que a inserção falhou.
   */
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
        selectedHeroId
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
    clearHeroSummary();

    await loadInitialData();

    if (requestedHeroId) {
      const heroExists =
        heroes.some(
          hero =>
            String(hero.id) ===
            String(requestedHeroId)
        );

      if (!heroExists) {
        setMessage(
          'O herói informado na URL não foi encontrado.',
          'error'
        );

        return;
      }

      heroSelect.value =
        requestedHeroId;

      await loadHeroStats(
        requestedHeroId
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