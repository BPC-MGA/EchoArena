import {
  requireAdmin,
  logoutAdmin
} from './admin-auth.js';

await requireAdmin();

const logoutButton =
  document.getElementById('logout');

if (logoutButton) {
  logoutButton.onclick =
    logoutAdmin;
}

const IMPORT_KEY =
  'equipment-import-draft';

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

const validateButton =
  document.getElementById(
    'equipment-ai-validate'
  );

const sendButton =
  document.getElementById(
    'equipment-ai-send'
  );

const clearButton =
  document.getElementById(
    'equipment-ai-clear'
  );

const statusBox =
  document.getElementById(
    'equipment-ai-status'
  );

let validatedDraft = null;

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

function normalizeAttribute(
  attribute
) {
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

  const number =
    nullableNumber(
      attribute.value
    );

  const percent =
    Boolean(
      attribute.percent ||
      raw.includes('%') ||
      label.includes('%')
    );

  return {
    label:
      label || raw,

    value:
      number === null
        ? (
            attribute.value ??
            ''
          )
        : (
            `${number}${percent ? '%' : ''}`
          ),

    raw:
      raw || label,

    percent
  };
}

function normalizeBonus(
  bonus
) {
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
      `Bônus de ${requiredPieces} peças`
    ).trim();

  const description =
    String(
      bonus.description ??
      ''
    ).trim();

  if (!title && !description) {
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

  for (
    const [slug]
    of RARITIES
  ) {
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

    slot:
      String(
        equipment.slot ??
        source.slot ??
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

function renderReview(draft) {
  const warnings = [];

  if (!draft.name) {
    warnings.push(
      'O nome do equipamento não foi informado.'
    );
  }

  if (!draft.slot) {
    warnings.push(
      'O slot não foi informado.'
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
      'review-slot'
    )
    .textContent =
      draft.slot ||
      'Não informado';

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

  sendButton.disabled =
    !draft.name;

  showStatus(
    warnings.length
      ? `JSON válido com ${warnings.length} aviso(s).`
      : 'JSON válido e pronto para preencher o editor.',
    warnings.length
      ? 'warn'
      : 'ok'
  );

  return warnings;
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

      renderReview(
        validatedDraft
      );
    } catch (error) {
      validatedDraft = null;

      sendButton.disabled =
        true;

      showStatus(
        error.message ||
        'Não foi possível validar o JSON.',
        'error'
      );
    }
  }
);

sendButton.addEventListener(
  'click',
  () => {
    if (!validatedDraft) {
      showStatus(
        'Valide o JSON antes de continuar.',
        'error'
      );

      return;
    }

    sessionStorage.setItem(
      IMPORT_KEY,
      JSON.stringify(
        validatedDraft
      )
    );

    location.href =
      './equipment-editor.html?import=1';
  }
);

clearButton.addEventListener(
  'click',
  () => {
    jsonArea.value = '';
    validatedDraft = null;
    sendButton.disabled = true;

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
        '—';

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

    jsonArea.focus();
  }
);

jsonArea.addEventListener(
  'input',
  () => {
    validatedDraft = null;
    sendButton.disabled = true;
  }
);
