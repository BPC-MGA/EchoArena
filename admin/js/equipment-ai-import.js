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

const RARITIES = [
  {
    slug: 'comum',
    label: 'Comum'
  },
  {
    slug: 'raro',
    label: 'Raro'
  },
  {
    slug: 'epico',
    label: 'Épico'
  },
  {
    slug: 'lendario',
    label: 'Lendário'
  },
  {
    slug: 'mitico',
    label: 'Mítico'
  },
  {
    slug: 'supremo',
    label: 'Supremo'
  },
  {
    slug: 'grandioso',
    label: 'Grandioso'
  },
  {
    slug: 'celestial',
    label: 'Celestial'
  },
  {
    slug: 'estelar',
    label: 'Estelar'
  },
  {
    slug: 'imortal',
    label: 'Imortal'
  },
  {
    slug: 'divino',
    label: 'Divino'
  }
];

const promptArea =
  document.getElementById(
    'equipment-ai-prompt'
  );

const jsonArea =
  document.getElementById(
    'equipment-ai-json'
  );

const validateButton =
  document.getElementById(
    'equipment-ai-validate'
  );

const exampleButton =
  document.getElementById(
    'equipment-ai-example'
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

const emptyState =
  document.getElementById(
    'equipment-ai-empty'
  );

const review =
  document.getElementById(
    'equipment-ai-review'
  );

const reviewBadge =
  document.getElementById(
    'equipment-ai-review-badge'
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

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9%+\-.,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function isPresent(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== ''
  );
}

function getPrompt() {
  return `Analise os prints enviados de um equipamento do jogo Bullet Echo.

Extraia somente os dados claramente visíveis. Não invente valores. Quando um campo não estiver visível, use null. Preserve os sinais positivos e negativos.

Responda SOMENTE com JSON válido, sem explicações antes ou depois, seguindo exatamente esta estrutura:

{
  "schemaVersion": 1,
  "equipment": {
    "name": null,
    "slot": null,
    "setName": null,
    "description": null,
    "recommendation": null,
    "displayOrder": null,
    "enabled": true
  },
  "variants": {
    "comum": [],
    "raro": [],
    "epico": [],
    "lendario": [],
    "mitico": [],
    "supremo": [],
    "grandioso": [],
    "celestial": [],
    "estelar": [],
    "imortal": [],
    "divino": []
  },
  "bonuses": []
}

Cada atributo dentro de "variants" deve usar:
{
  "label": "Texto exato do atributo",
  "value": -5,
  "percent": true,
  "raw": "-5% ao barulho da corrida do herói"
}

Cada bônus deve usar:
{
  "required_pieces": 2,
  "title": "Bônus de 2 peças",
  "description": "Descrição visível do bônus"
}

Regras:
- Use os slugs das raridades exatamente como no modelo.
- Não crie raridades que não aparecem.
- Não transforme porcentagem em decimal.
- Preserve valores negativos.
- Quando o atributo não mostrar número, não invente.
- Em "slot", use um nome simples como "Cabeça", "Mão", "Corpo", "Perna" ou o texto visível.
- Nunca coloque texto fora do JSON.`;
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
      'Não foi encontrado um objeto JSON válido.'
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

  const value =
    nullableNumber(
      attribute.value
    );

  const raw =
    String(
      attribute.raw ??
      ''
    ).trim();

  if (
    !label &&
    !raw
  ) {
    return null;
  }

  return {
    label:
      label || raw,

    value:
      value ?? '',

    percent:
      Boolean(
        attribute.percent ??
        raw.includes('%') ??
        label.includes('%')
      ),

    raw:
      raw || label
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
    );

  const title =
    String(
      bonus.title ??
      ''
    ).trim();

  const description =
    String(
      bonus.description ??
      ''
    ).trim();

  if (
    !requiredPieces &&
    !title &&
    !description
  ) {
    return null;
  }

  return {
    required_pieces:
      requiredPieces || 2,

    title:
      title ||
      `Bônus de ${requiredPieces || 2} peças`,

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

  for (const rarity of RARITIES) {
    const list =
      Array.isArray(
        sourceVariants[
          rarity.slug
        ]
      )
        ? sourceVariants[
            rarity.slug
          ]
        : [];

    variants[
      rarity.slug
    ] =
      list
        .map(
          normalizeAttribute
        )
        .filter(Boolean);
  }

  const bonuses =
    Array.isArray(
      source.bonuses
    )
      ? source.bonuses
          .map(
            normalizeBonus
          )
          .filter(Boolean)
      : [];

  return {
    schemaVersion:
      Number(
        source.schemaVersion
      ) || 1,

    name:
      String(
        equipment.name ??
        source.name ??
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
    bonuses
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

function clearReview() {
  validatedDraft =
    null;

  sendButton.disabled =
    true;

  emptyState.style.display =
    '';

  review.classList.remove(
    'is-visible'
  );

  reviewBadge.textContent =
    'Aguardando';

  reviewBadge.style.borderColor =
    '';

  reviewBadge.style.color =
    '';

  statusBox.className =
    'equipment-ai-status';

  statusBox.textContent =
    '';
}

function renderGeneral(draft) {
  const fields = [
    [
      'Nome',
      draft.name
    ],
    [
      'Slot',
      draft.slot
    ],
    [
      'Conjunto',
      draft.setName
    ],
    [
      'Descrição',
      draft.description
    ],
    [
      'Recomendação',
      draft.recommendation
    ],
    [
      'Ordem',
      draft.displayOrder
    ],
    [
      'Publicação',
      draft.enabled
        ? 'Ativo'
        : 'Inativo'
    ]
  ];

  const present =
    fields.filter(
      ([, value]) =>
        isPresent(value)
    ).length;

  document
    .getElementById(
      'equipment-ai-general-count'
    )
    .textContent =
      `${present} de ${fields.length}`;

  document
    .getElementById(
      'equipment-ai-general'
    )
    .innerHTML =
      fields.map(
        ([label, value]) => `
          <div class="equipment-ai-field ${isPresent(value) ? '' : 'is-missing'}">
            <small>
              ${escapeHtml(label)}
            </small>

            <strong>
              ${escapeHtml(
                isPresent(value)
                  ? String(value)
                  : 'Não informado'
              )}
            </strong>
          </div>
        `
      ).join('');

  return {
    present,
    total:
      fields.length
  };
}

function renderRarities(draft) {
  const host =
    document.getElementById(
      'equipment-ai-rarities'
    );

  let rarityCount = 0;
  let attributeCount = 0;

  const blocks = [];

  for (const rarity of RARITIES) {
    const attributes =
      draft.variants[
        rarity.slug
      ] || [];

    if (!attributes.length) {
      continue;
    }

    rarityCount += 1;
    attributeCount +=
      attributes.length;

    blocks.push(`
      <article class="equipment-ai-rarity">
        <div class="equipment-ai-rarity-head">
          <strong>
            ${escapeHtml(
              rarity.label
            )}
          </strong>

          <span>
            ${attributes.length} atributo(s)
          </span>
        </div>

        <div class="equipment-ai-attrs">
          ${attributes.map(attribute => `
            <div class="equipment-ai-attr">
              <span>
                ${escapeHtml(
                  attribute.label ||
                  attribute.raw
                )}
              </span>

              <strong>
                ${escapeHtml(
                  attribute.value === ''
                    ? 'Sem valor'
                    : `${attribute.value}${attribute.percent ? '%' : ''}`
                )}
              </strong>
            </div>
          `).join('')}
        </div>
      </article>
    `);
  }

  document
    .getElementById(
      'equipment-ai-rarity-count'
    )
    .textContent =
      `${rarityCount} raridade(s) · ${attributeCount} atributo(s)`;

  host.innerHTML =
    blocks.length
      ? blocks.join('')
      : `
        <div class="equipment-ai-warning">
          Nenhuma raridade com atributos foi encontrada.
        </div>
      `;

  return {
    rarityCount,
    attributeCount
  };
}

function renderBonuses(draft) {
  const host =
    document.getElementById(
      'equipment-ai-bonuses'
    );

  document
    .getElementById(
      'equipment-ai-bonus-count'
    )
    .textContent =
      `${draft.bonuses.length} bônus`;

  host.innerHTML =
    draft.bonuses.length
      ? draft.bonuses.map(
          bonus => `
            <div class="equipment-ai-field">
              <small>
                ${escapeHtml(
                  `${bonus.required_pieces} peça(s)`
                )}
              </small>

              <strong>
                ${escapeHtml(
                  bonus.title
                )}
              </strong>

              <div style="margin-top:5px;color:#8f9aae;font-size:10px;line-height:1.45">
                ${escapeHtml(
                  bonus.description ||
                  'Sem descrição'
                )}
              </div>
            </div>
          `
        ).join('')
      : `
        <div class="equipment-ai-field is-missing">
          <small>Bônus</small>
          <strong>Nenhum bônus informado</strong>
        </div>
      `;

  return {
    present:
      draft.bonuses.length,

    total:
      Math.max(
        1,
        draft.bonuses.length
      )
  };
}

function validateAndRender() {
  try {
    const parsed =
      JSON.parse(
        extractJson(
          jsonArea.value
        )
      );

    const draft =
      normalizeData(parsed);

    const warnings = [];

    if (!draft.name) {
      warnings.push(
        'O nome do equipamento não foi informado.'
      );
    }

    const rarityData =
      renderRarities(draft);

    if (!rarityData.attributeCount) {
      warnings.push(
        'Nenhum atributo de raridade foi encontrado.'
      );
    }

    const generalData =
      renderGeneral(draft);

    const bonusData =
      renderBonuses(draft);

    const totalFields =
      generalData.total +
      RARITIES.length +
      bonusData.total;

    const presentFields =
      generalData.present +
      rarityData.rarityCount +
      bonusData.present;

    const completion =
      totalFields
        ? Math.round(
            (
              presentFields /
              totalFields
            ) * 100
          )
        : 0;

    document
      .getElementById(
        'equipment-ai-name'
      )
      .textContent =
        draft.name ||
        'Equipamento sem nome';

    const meta = [
      draft.slot,
      draft.setName
    ]
      .filter(Boolean)
      .join(' · ');

    document
      .getElementById(
        'equipment-ai-meta'
      )
      .textContent =
        meta ||
        'Slot e conjunto não informados.';

    document
      .getElementById(
        'equipment-ai-completion'
      )
      .textContent =
        `${completion}%`;

    document
      .getElementById(
        'equipment-ai-completion-bar'
      )
      .style.width =
        `${completion}%`;

    const warningSection =
      document.getElementById(
        'equipment-ai-warning-section'
      );

    const warningHost =
      document.getElementById(
        'equipment-ai-warnings'
      );

    document
      .getElementById(
        'equipment-ai-warning-count'
      )
      .textContent =
        String(
          warnings.length
        );

    if (warnings.length) {
      warningSection.style.display =
        '';

      warningHost.innerHTML =
        warnings.map(
          warning => `
            <div class="equipment-ai-warning">
              ${escapeHtml(
                warning
              )}
            </div>
          `
        ).join('');
    } else {
      warningSection.style.display =
        'none';

      warningHost.innerHTML =
        '';
    }

    emptyState.style.display =
      'none';

    review.classList.add(
      'is-visible'
    );

    validatedDraft =
      draft;

    sendButton.disabled =
      !draft.name;

    reviewBadge.textContent =
      warnings.length
        ? 'Com avisos'
        : 'Válido';

    reviewBadge.style.borderColor =
      warnings.length
        ? '#6f5618'
        : '#28583a';

    reviewBadge.style.color =
      warnings.length
        ? '#ffd76d'
        : '#8fd3a6';

    showStatus(
      warnings.length
        ? (
            `JSON válido com ${warnings.length} aviso(s).`
          )
        : (
            'JSON válido e pronto para enviar ao editor.'
          ),
      warnings.length
        ? 'warn'
        : 'ok'
    );
  } catch (error) {
    clearReview();

    reviewBadge.textContent =
      'Inválido';

    reviewBadge.style.borderColor =
      '#75353d';

    reviewBadge.style.color =
      '#ff9da5';

    showStatus(
      error.message ||
      'Não foi possível validar o JSON.',
      'error'
    );
  }
}

function buildEditorDraft(draft) {
  return {
    name:
      draft.name,

    setName:
      draft.setName,

    description:
      draft.description,

    recommendation:
      draft.recommendation,

    variants:
      draft.variants,

    bonuses:
      draft.bonuses
  };
}

const example = {
  schemaVersion: 1,

  equipment: {
    name:
      'Boina do Comandante',

    slot:
      'Cabeça',

    setName:
      'Conjunto do Comandante',

    description:
      '',

    recommendation:
      '',

    displayOrder:
      null,

    enabled:
      true
  },

  variants: {
    comum: [
      {
        label:
          'Barulho da corrida do herói',

        value:
          -5,

        percent:
          true,

        raw:
          '-5% ao barulho da corrida do herói'
      }
    ],

    raro: [],
    epico: [],
    lendario: [],
    mitico: [],
    supremo: [],
    grandioso: [],
    celestial: [],
    estelar: [],
    imortal: [],
    divino: []
  },

  bonuses: []
};

promptArea.value =
  getPrompt();

document
  .getElementById(
    'equipment-ai-copy-prompt'
  )
  .addEventListener(
    'click',
    async () => {
      try {
        await navigator.clipboard.writeText(
          getPrompt()
        );
      } catch {
        promptArea.select();
        document.execCommand(
          'copy'
        );
      }

      showStatus(
        'Prompt copiado.',
        'ok'
      );
    }
  );

validateButton.addEventListener(
  'click',
  validateAndRender
);

exampleButton.addEventListener(
  'click',
  () => {
    jsonArea.value =
      JSON.stringify(
        example,
        null,
        2
      );

    validateAndRender();
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
      'equipment-import-draft',
      JSON.stringify(
        buildEditorDraft(
          validatedDraft
        )
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
    clearReview();
    jsonArea.focus();
  }
);

jsonArea.addEventListener(
  'input',
  () => {
    if (
      validatedDraft
    ) {
      validatedDraft =
        null;

      sendButton.disabled =
        true;
    }
  }
);
