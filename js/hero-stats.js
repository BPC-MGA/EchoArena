import { supabase } from '../../js/supabase.js';
import { requireAdmin, logoutAdmin } from './admin-auth.js';

await requireAdmin();
document.getElementById('logout').onclick = logoutAdmin;

const heroSelect = document.getElementById('hero-select');
const heroStatsGrid = document.getElementById('hero-stats-grid');
const weaponStatsGrid = document.getElementById('weapon-stats-grid');
const previewGrid = document.getElementById('preview-grid');
const statsArea = document.getElementById('stats-area');
const message = document.getElementById('message');
const weaponNameInput = document.getElementById('weapon-name');

let heroes = [];
let definitions = [];
let currentHero = null;

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

function publicMediaUrl(path) {
  if (!path) return '';

  return supabase.storage
    .from('game-media')
    .getPublicUrl(path)
    .data
    .publicUrl;
}

function formatValue(value, definition) {
  const number = Number(value ?? 0);
  const decimals = Number(definition.decimals ?? 0);

  const formatted = number.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });

  if (!definition.unit) return formatted;
  if (definition.unit === 'x') return `x${formatted}`;

  return `${formatted}${definition.unit}`;
}

function createStatField(definition, group, currentValue = '') {
  const wrapper = document.createElement('div');
  wrapper.className = 'stat-field';
  wrapper.dataset.statKey = definition.key;
  wrapper.dataset.group = group;

  wrapper.innerHTML = `
    <label>
      ${definition.name}
      ${definition.unit ? `<span class="unit">${definition.unit}</span>` : ''}
    </label>
    <small>${definition.description || ''}</small>
    <input
      type="number"
      step="${definition.decimals > 0 ? '0.01' : '1'}"
      value="${currentValue ?? ''}"
      placeholder="0"
    >
  `;

  wrapper.querySelector('input').addEventListener('input', renderPreview);

  return wrapper;
}

function renderFields(heroValues = {}, weaponValues = {}) {
  heroStatsGrid.innerHTML = '';
  weaponStatsGrid.innerHTML = '';

  const heroDefinitions = definitions.filter(definition =>
    HERO_CATEGORIES.has(definition.category)
  );

  const weaponDefinitions = definitions.filter(definition =>
    WEAPON_CATEGORIES.has(definition.category)
  );

  heroDefinitions.forEach(definition => {
    heroStatsGrid.appendChild(
      createStatField(
        definition,
        'hero',
        heroValues[definition.key] ?? ''
      )
    );
  });

  weaponDefinitions.forEach(definition => {
    weaponStatsGrid.appendChild(
      createStatField(
        definition,
        'weapon',
        weaponValues[definition.key] ?? ''
      )
    );
  });

  renderPreview();
}

function collectFields(group) {
  return [...document.querySelectorAll(`[data-group="${group}"]`)]
    .map(field => ({
      stat_key: field.dataset.statKey,
      value: field.querySelector('input').value
    }))
    .filter(item => item.value !== '')
    .map(item => ({
      stat_key: item.stat_key,
      value: Number(item.value)
    }));
}

function renderPreview() {
  const allFields = [
    ...document.querySelectorAll('.stat-field')
  ];

  previewGrid.innerHTML = allFields
    .filter(field => field.querySelector('input').value !== '')
    .map(field => {
      const definition = definitions.find(
        item => item.key === field.dataset.statKey
      );

      const value = field.querySelector('input').value;

      return `
        <div class="preview-stat">
          <span>${definition?.name || field.dataset.statKey}</span>
          <strong>${formatValue(value, definition || {})}</strong>
        </div>
      `;
    })
    .join('') || '<div class="stats-message">Nenhum valor cadastrado ainda.</div>';
}

async function loadInitialData() {
  message.textContent = 'Carregando dados...';

  const [heroesResult, definitionsResult] = await Promise.all([
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
      .order('display_order')
  ]);

  if (heroesResult.error) throw heroesResult.error;
  if (definitionsResult.error) throw definitionsResult.error;

  heroes = heroesResult.data || [];
  definitions = definitionsResult.data || [];

  heroSelect.innerHTML =
    '<option value="">Selecione um herói</option>' +
    heroes.map(hero =>
      `<option value="${hero.id}">${hero.name}</option>`
    ).join('');

  message.textContent = '';
}

async function loadHeroStats(heroId) {
  currentHero = heroes.find(hero => hero.id === heroId);

  if (!currentHero) {
    statsArea.classList.add('hidden');
    return;
  }

  message.textContent = 'Carregando status...';

  const [heroStatsResult, weaponStatsResult] = await Promise.all([
    supabase
      .from('hero_base_stats')
      .select('stat_key,value')
      .eq('hero_id', heroId),

    supabase
      .from('hero_weapon_stats')
      .select('stat_key,value,weapon_name')
      .eq('hero_id', heroId)
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

  weaponNameInput.value =
    weaponStatsResult.data?.[0]?.weapon_name || '';

  document.getElementById('hero-name').textContent =
    currentHero.name;

  document.getElementById('hero-slug').textContent =
    currentHero.slug;

  const path =
    currentHero.card_image_path ||
    currentHero.image_path ||
    currentHero.gif_path;

  document.getElementById('hero-art').innerHTML = path
    ? `<img src="${publicMediaUrl(path)}" alt="">`
    : 'Sem imagem';

  renderFields(heroValues, weaponValues);
  statsArea.classList.remove('hidden');
  message.textContent = '';
}

async function replaceStats(table, heroId, rows, extra = {}) {
  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .eq('hero_id', heroId);

  if (deleteError) throw deleteError;

  if (!rows.length) return;

  const payload = rows.map(row => ({
    hero_id: heroId,
    stat_key: row.stat_key,
    value: row.value,
    ...extra
  }));

  const { error: insertError } = await supabase
    .from(table)
    .insert(payload);

  if (insertError) throw insertError;
}

heroSelect.addEventListener('change', async event => {
  try {
    await loadHeroStats(event.target.value);
  } catch (error) {
    message.textContent = error.message;
    message.className = 'stats-message error';
  }
});

document.getElementById('save-all').addEventListener('click', async () => {
  if (!currentHero) {
    message.textContent = 'Selecione um herói.';
    message.className = 'stats-message error';
    return;
  }

  message.textContent = 'Salvando status...';
  message.className = 'stats-message';

  try {
    const heroRows = collectFields('hero');
    const weaponRows = collectFields('weapon');

    await replaceStats(
      'hero_base_stats',
      currentHero.id,
      heroRows
    );

    await replaceStats(
      'hero_weapon_stats',
      currentHero.id,
      weaponRows,
      {
        weapon_name: weaponNameInput.value.trim() || null
      }
    );

    message.textContent = 'Status salvos com sucesso.';
    message.className = 'stats-message ok';
  } catch (error) {
    message.textContent = error.message;
    message.className = 'stats-message error';
  }
});

try {
  await loadInitialData();
} catch (error) {
  message.textContent = error.message;
  message.className = 'stats-message error';
}
