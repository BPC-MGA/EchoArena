import {
  requireAdmin,
  logoutAdmin
} from './admin-auth.js';

import {
  loadEquipmentMeta,
  getEquipmentBySlug,
  saveEquipmentBundle,
  upsertSet
} from './equipment-api.js';

await requireAdmin();

const logoutButton =
  document.getElementById('logout');

if (logoutButton) {
  logoutButton.onclick =
    logoutAdmin;
}


const backButton =
  document.getElementById(
    'equipment-ai-back'
  );

function getSafeReturnDestination() {
  const params =
    new URLSearchParams(
      location.search
    );

  const requestedReturn =
    params.get('returnTo');

  if (!requestedReturn) {
    return './equipments.html';
  }

  try {
    const destination =
      new URL(
        requestedReturn,
        location.href
      );

    const adminDirectory =
      new URL(
        './',
        location.href
      ).pathname;

    if (
      destination.origin !==
        location.origin ||
      !destination.pathname.startsWith(
        adminDirectory
      )
    ) {
      return './equipments.html';
    }

    return (
      destination.pathname +
      destination.search +
      destination.hash
    );
  } catch (error) {
    console.warn(
      'Destino de retorno inválido:',
      error
    );

    return './equipments.html';
  }
}

if (backButton) {
  backButton.href =
    getSafeReturnDestination();
}

const REQUIRED_SLOT_OPTIONS = [
  {
    label: 'Cabeça',
    slugs: ['cabeca']
  },
  {
    label: 'Peito',
    slugs: ['body', 'peito', 'corpo']
  },
  {
    label: 'Mãos',
    slugs: ['maos', 'hands']
  },
  {
    label: 'Pés',
    slugs: ['leg', 'pes', 'perna']
  },
  {
    label: 'Anel',
    slugs: ['ring', 'anel']
  },
  {
    label: 'Gadget',
    slugs: ['especial', 'gadget']
  }
];

const RARITIES = [
  ['comum', 'Comum'],
  ['raro', 'Raro'],
  ['epico', 'Épico'],
  ['lendario', 'Lendário'],
  ['mitico', 'Mítico'],
  ['supremo', 'Supremo'],
  ['grandioso', 'Grandioso'],
  ['celestial', 'Celestial'],
  ['estelar', 'Estelar'],
  ['imortal', 'Imortal'],
  ['divino', 'Divino']
];

const jsonArea =
  document.getElementById(
    'equipment-ai-json'
  );

const slotSelect =
  document.getElementById(
    'equipment-ai-slot'
  );

const validateButton =
  document.getElementById(
    'equipment-ai-validate'
  );

const saveButton =
  document.getElementById(
    'equipment-ai-save'
  );

const clearButton =
  document.getElementById(
    'equipment-ai-clear'
  );

const newButton =
  document.getElementById(
    'equipment-ai-new'
  );

const statusBox =
  document.getElementById(
    'equipment-ai-status'
  );

const successActions =
  document.getElementById(
    'equipment-ai-success-actions'
  );

const editLink =
  document.getElementById(
    'equipment-ai-edit-link'
  );

let meta = null;
let validatedDraft = null;
let isSaving = false;

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
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

  const number =
    Number(normalized);

  return Number.isFinite(number)
    ? number
    : null;
}

function extractJson(value = '') {
  const text =
    String(value).trim();

  if (!text) {
    throw new Error(
      'Cole o JSON retornado pelo ChatGPT.'
    );
  }

  const fenced =
    text.match(
      /```(?:json)?\s*([\s\S]*?)```/i
    );

  const candidate =
    fenced
      ? fenced[1].trim()
      : text;

  const firstBrace =
    candidate.indexOf('{');

  const lastBrace =
    candidate.lastIndexOf('}');

  if (
    firstBrace < 0 ||
    lastBrace < firstBrace
  ) {
    throw new Error(
      'Não foi encontrado um objeto JSON.'
    );
  }

  return candidate.slice(
    firstBrace,
    lastBrace + 1
  );
}

function normalizeAttribute(attribute) {
  if (
    !attribute ||
    typeof attribute !== 'object'
  ) {
    return null;
  }

  const label =
    String(
      attribute.label ??
      attribute.name ??
      attribute.raw ??
      ''
    ).trim();

  const raw =
    String(
      attribute.raw ??
      ''
    ).trim();

  if (!label && !raw) {
    return null;
  }

  const value =
    attribute.value ??
    '';

  return {
    label:
      label || raw,
    value:
      String(value).trim()
  };
}

function normalizeBonus(bonus) {
  if (
    !bonus ||
    typeof bonus !== 'object'
  ) {
    return null;
  }

  const requiredPieces =
    nullableNumber(
      bonus.required_pieces ??
      bonus.requiredPieces
    ) || 2;

  const title =
    String(
      bonus.title ??
      `${requiredPieces} Equipamentos`
    ).trim();

  const description =
    String(
      bonus.description ??
      ''
    ).trim();

  if (!title || !description) {
    return null;
  }

  return {
    required_pieces:
      requiredPieces,
    title,
    description
  };
}

function normalizeData(source = {}) {
  if (
    !source ||
    typeof source !== 'object' ||
    Array.isArray(source)
  ) {
    throw new Error(
      'O conteúdo principal precisa ser um objeto JSON.'
    );
  }

  const equipment =
    source.equipment &&
    typeof source.equipment === 'object'
      ? source.equipment
      : source;

  const sourceVariants =
    source.variants &&
    typeof source.variants === 'object'
      ? source.variants
      : {};

  const variants = {};

  for (const [slug] of RARITIES) {
    variants[slug] =
      Array.isArray(
        sourceVariants[slug]
      )
        ? sourceVariants[slug]
            .map(
              normalizeAttribute
            )
            .filter(Boolean)
        : [];
  }

  return {
    name:
      String(
        equipment.name ??
        source.name ??
        ''
      ).trim(),

    slug:
      String(
        equipment.slug ??
        source.slug ??
        ''
      ).trim(),

    setName:
      String(
        equipment.setName ??
        equipment.set_name ??
        source.setName ??
        source.set_name ??
        ''
      ).trim(),

    description:
      String(
        equipment.description ??
        source.description ??
        ''
      ).trim(),

    recommendation:
      String(
        equipment.recommendation ??
        source.recommendation ??
        ''
      ).trim(),

    displayOrder:
      nullableNumber(
        equipment.displayOrder ??
        equipment.display_order ??
        source.displayOrder ??
        source.display_order
      ),

    enabled:
      equipment.enabled ??
      source.enabled ??
      true,

    variants,

    bonuses:
      Array.isArray(
        source.bonuses
      )
        ? source.bonuses
            .map(
              normalizeBonus
            )
            .filter(Boolean)
        : []
  };
}

function showStatus(
  text,
  type = ''
) {
  statusBox.textContent =
    text;

  statusBox.className =
    `equipment-ai-status is-visible ${type}`.trim();
}

function populateSlots() {
  slotSelect.innerHTML = `
    <option value="">
      Selecione um slot
    </option>
  `;

  for (
    const option
    of REQUIRED_SLOT_OPTIONS
  ) {
    const match =
      meta.slots.find(item => {
        const itemSlug =
          normalizeText(
            item.slug
          );

        const itemName =
          normalizeText(
            item.name
          );

        return option.slugs.some(
          candidate => {
            const normalized =
              normalizeText(
                candidate
              );

            return (
              itemSlug === normalized ||
              itemName === normalized
            );
          }
        );
      });

    if (!match) {
      console.warn(
        `[equipamento] Slot não encontrado para "${option.label}".`
      );
      continue;
    }

    const element =
      document.createElement(
        'option'
      );

    element.value =
      match.id;

    element.textContent =
      option.label;

    element.dataset.slug =
      match.slug || '';

    slotSelect.appendChild(
      element
    );
  }
}

function findSet(value) {
  const wanted =
    normalizeText(value);

  if (!wanted) {
    return null;
  }

  return (
    meta.sets.find(item =>
      normalizeText(item.name) === wanted ||
      normalizeText(item.slug) === wanted
    ) ||
    null
  );
}

function countDraft() {
  const rarityCount =
    Object.values(
      validatedDraft?.variants || {}
    ).filter(
      list =>
        Array.isArray(list) &&
        list.length
    ).length;

  const attributeCount =
    Object.values(
      validatedDraft?.variants || {}
    ).reduce(
      (total, list) =>
        total +
        (
          Array.isArray(list)
            ? list.length
            : 0
        ),
      0
    );

  return {
    rarityCount,
    attributeCount
  };
}

function updateSaveState() {
  saveButton.disabled =
    !validatedDraft ||
    !slotSelect.value ||
    isSaving;
}

function renderReview(draft) {
  const warnings = [];

  if (!draft.name) {
    warnings.push(
      'O nome do equipamento não foi informado.'
    );
  }

  if (!draft.setName) {
    warnings.push(
      'O conjunto não foi informado.'
    );
  }

  let rarityCount = 0;
  let attributeCount = 0;
  const rarityBlocks = [];

  for (
    const [slug, label]
    of RARITIES
  ) {
    const attributes =
      draft.variants[slug] || [];

    if (!attributes.length) {
      continue;
    }

    rarityCount += 1;
    attributeCount +=
      attributes.length;

    rarityBlocks.push(`
      <article class="equipment-ai-rarity">
        <div class="equipment-ai-rarity-head">
          <strong>
            ${escapeHtml(label)}
          </strong>

          <span>
            ${attributes.length} atributo(s)
          </span>
        </div>
      </article>
    `);
  }

  document
    .getElementById(
      'review-name'
    )
    .textContent =
      draft.name ||
      'Sem nome';

  document
    .getElementById(
      'review-set'
    )
    .textContent =
      draft.setName ||
      'Não informado';

  document
    .getElementById(
      'review-rarities'
    )
    .textContent =
      String(rarityCount);

  document
    .getElementById(
      'review-attributes'
    )
    .textContent =
      String(attributeCount);

  document
    .getElementById(
      'review-rarity-list'
    )
    .innerHTML =
      rarityBlocks.join('');

  document
    .getElementById(
      'review-warnings'
    )
    .innerHTML =
      warnings.map(
        warning => `
          <div class="equipment-ai-warning">
            ${escapeHtml(warning)}
          </div>
        `
      ).join('');

  slotSelect.disabled =
    !draft.name;

  updateSaveState();

  showStatus(
    warnings.length
      ? `JSON válido com ${warnings.length} aviso(s). Escolha o slot para salvar.`
      : 'JSON válido. Escolha o slot para liberar o salvamento.',
    warnings.length
      ? 'warn'
      : 'ok'
  );
}

function buildVariants() {
  return meta.rarities.map(
    rarity => ({
      rarity_id:
        rarity.id,

      attributes:
        validatedDraft
          .variants[
            rarity.slug
          ] || []
    })
  );
}

async function resolveSetId() {
  if (!validatedDraft.setName) {
    return null;
  }

  const existingSet =
    findSet(
      validatedDraft.setName
    );

  if (existingSet) {
    return existingSet.id;
  }

  const createdSet =
    await upsertSet({
      name:
        validatedDraft.setName,
      slug:
        slugify(
          validatedDraft.setName
        ),
      description:
        ''
    });

  meta.sets.push(
    createdSet
  );

  return createdSet.id;
}

async function saveEquipment() {
  if (
    isSaving ||
    !validatedDraft ||
    !slotSelect.value
  ) {
    return;
  }

  isSaving = true;
  updateSaveState();

  const originalText =
    saveButton.textContent;

  saveButton.textContent =
    'Salvando...';

  successActions.classList.remove(
    'is-visible'
  );

  try {
    const slug =
      validatedDraft.slug ||
      slugify(
        validatedDraft.name
      );

    if (!slug) {
      throw new Error(
        'Não foi possível gerar o slug do equipamento.'
      );
    }

    const existing =
      await getEquipmentBySlug(
        slug
      );

    const setId =
      await resolveSetId();

    const saved =
      await saveEquipmentBundle({
        equipmentId:
          existing?.id || null,

        equipment: {
          name:
            validatedDraft.name,
          slug,
          slot_id:
            slotSelect.value,
          set_id:
            setId,
          description:
            validatedDraft.description,
          recommendation:
            validatedDraft.recommendation,
          image_path:
            existing?.image_path || null,
          enabled:
            validatedDraft.enabled !== false,
          display_order:
            validatedDraft.displayOrder ??
            existing?.display_order ??
            0
        },

        variants:
          buildVariants(),

        bonuses:
          validatedDraft.bonuses.map(
            (
              bonus,
              index
            ) => ({
              ...bonus,
              display_order:
                index + 1
            })
          )
      });

    const operationText =
      saved.operation === 'updated'
        ? 'Equipamento existente atualizado com sucesso.'
        : 'Equipamento criado com sucesso.';

    showStatus(
      operationText,
      'ok'
    );

    editLink.href =
      `./equipment-editor.html?id=${encodeURIComponent(
        saved.id
      )}`;

    successActions.classList.add(
      'is-visible'
    );
  } catch (error) {
    console.error(
      'Erro ao salvar equipamento:',
      error
    );

    showStatus(
      error.message ||
      'Não foi possível salvar o equipamento.',
      'error'
    );
  } finally {
    isSaving = false;
    saveButton.textContent =
      originalText;
    updateSaveState();
  }
}

function clearAll() {
  jsonArea.value = '';
  validatedDraft = null;
  slotSelect.value = '';
  slotSelect.disabled = true;

  slotSelect.innerHTML = `
    <option value="">
      Valide o JSON primeiro
    </option>
  `;

  document
    .getElementById(
      'review-name'
    )
    .textContent =
      'Aguardando JSON';

  document
    .getElementById(
      'review-slot'
    )
    .textContent =
      'Não selecionado';

  document
    .getElementById(
      'review-set'
    )
    .textContent =
      '—';

  document
    .getElementById(
      'review-rarities'
    )
    .textContent =
      '0';

  document
    .getElementById(
      'review-attributes'
    )
    .textContent =
      '0';

  document
    .getElementById(
      'review-rarity-list'
    )
    .innerHTML =
      '';

  document
    .getElementById(
      'review-warnings'
    )
    .innerHTML =
      '';

  statusBox.className =
    'equipment-ai-status';

  statusBox.textContent =
    '';

  successActions.classList.remove(
    'is-visible'
  );

  updateSaveState();

  jsonArea.focus();
}

validateButton.addEventListener(
  'click',
  () => {
    try {
      const parsed =
        JSON.parse(
          extractJson(
            jsonArea.value
          )
        );

      validatedDraft =
        normalizeData(
          parsed
        );

      if (!validatedDraft.name) {
        throw new Error(
          'O JSON precisa conter o nome do equipamento.'
        );
      }

      populateSlots();
      renderReview(
        validatedDraft
      );
    } catch (error) {
      validatedDraft = null;
      slotSelect.disabled = true;
      updateSaveState();

      showStatus(
        error.message ||
        'Não foi possível validar o JSON.',
        'error'
      );
    }
  }
);

slotSelect.addEventListener(
  'change',
  () => {
    const selectedOption =
      slotSelect.options[
        slotSelect.selectedIndex
      ];

    document
      .getElementById(
        'review-slot'
      )
      .textContent =
        selectedOption?.value
          ? selectedOption.textContent
          : 'Não selecionado';

    updateSaveState();
  }
);

saveButton.addEventListener(
  'click',
  saveEquipment
);

clearButton.addEventListener(
  'click',
  clearAll
);

newButton.addEventListener(
  'click',
  clearAll
);

jsonArea.addEventListener(
  'input',
  () => {
    validatedDraft = null;
    slotSelect.disabled = true;
    successActions.classList.remove(
      'is-visible'
    );
    updateSaveState();
  }
);

meta =
  await loadEquipmentMeta();

updateSaveState();
