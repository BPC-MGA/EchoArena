import { supabase } from '../../js/supabase.js';

/* =========================================================
   ELEMENTOS
========================================================= */

const body = document.getElementById('settings-body');
const message = document.getElementById('message');
const saveButton = document.getElementById('save');
const reloadButton = document.getElementById('reload');

/* =========================================================
   ESTADO
========================================================= */

let settings = null;
let isSaving = false;

/* Campos de texto: chave no banco → rótulo e ajuda. */
const TEXT_FIELDS = [
  {
    key: 'site_name',
    label: 'Nome do site',
    help: 'Aparece no título da aba e nos metadados.',
    max: 60
  },
  {
    key: 'site_description',
    label: 'Descrição',
    help: 'Usada por buscadores e ao compartilhar links.',
    max: 200,
    textarea: true
  },
  {
    key: 'site_keywords',
    label: 'Palavras-chave',
    help: 'Separadas por vírgula.',
    max: 200
  },
  {
    key: 'contact_email',
    label: 'E-mail de contato',
    help: 'Exibido para quem quiser falar com a administração.',
    max: 120,
    type: 'email'
  }
];

const SOCIAL_FIELDS = [
  { key: 'discord_url',   label: 'Discord' },
  { key: 'youtube_url',   label: 'YouTube' },
  { key: 'twitch_url',    label: 'Twitch' },
  { key: 'instagram_url', label: 'Instagram' },
  { key: 'twitter_url',   label: 'Twitter / X' },
  { key: 'github_url',    label: 'GitHub' }
];

/* Interruptores agrupados por assunto. */
const TOGGLE_GROUPS = [
  {
    title: 'Acesso ao site',
    description: 'Controla quem consegue entrar e o que vê sem login.',
    items: [
      {
        key: 'maintenance_mode',
        label: 'Modo manutenção',
        help: 'Site sai do ar para visitantes. Use com cuidado.',
        critical: true
      },
      {
        key: 'registration_enabled',
        label: 'Cadastro aberto',
        help: 'Permite que novos usuários criem conta.'
      },
      {
        key: 'allow_guest_view',
        label: 'Visitante pode navegar',
        help: 'Sem login, o visitante consegue ver o conteúdo público.'
      }
    ]
  },
  {
    title: 'Exige login para',
    description: 'Marque o que só deve funcionar para quem tem conta.',
    items: [
      { key: 'login_required_for_builds',       label: 'Criar builds' },
      { key: 'login_required_for_compare',      label: 'Comparar' },
      { key: 'login_required_for_comments',     label: 'Comentar' },
      { key: 'login_required_for_favorites',    label: 'Favoritar' },
      { key: 'login_required_for_team_builder', label: 'Montar composições' },
      { key: 'login_required_for_tierlists',    label: 'Ver tier lists' }
    ]
  },
  {
    title: 'Recursos do sistema',
    description: 'Funções internas da plataforma.',
    items: [
      {
        key: 'analytics_enabled',
        label: 'Registrar métricas',
        help: 'Guarda eventos de navegação para os relatórios.'
      },
      {
        key: 'realtime_enabled',
        label: 'Atualização em tempo real',
        help: 'Reflete mudanças sem recarregar a página.'
      }
    ]
  }
];

/* =========================================================
   UTILITÁRIOS
========================================================= */

function setMessage(text = '', type = '') {
  if (!message) return;
  message.textContent = text;
  message.className = `settings-message${type ? ` ${type}` : ''}`;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function valueOf(key) {
  return settings?.[key] ?? '';
}

/* =========================================================
   RENDERIZAÇÃO
========================================================= */

function renderTextField(field) {
  const value = escapeHtml(valueOf(field.key));

  const control = field.textarea
    ? `<textarea
         class="admin-textarea"
         id="f-${field.key}"
         data-field="${field.key}"
         rows="3"
         maxlength="${field.max}"
       >${value}</textarea>`
    : `<input
         class="admin-input"
         id="f-${field.key}"
         data-field="${field.key}"
         type="${field.type || 'text'}"
         maxlength="${field.max}"
         value="${value}"
       >`;

  return `
    <div class="settings-field ${field.textarea ? 'full' : ''}">
      <label for="f-${field.key}">${escapeHtml(field.label)}</label>
      ${control}
      <div class="help">${escapeHtml(field.help || '')}</div>
    </div>
  `;
}

function renderSocialField(field) {
  return `
    <div class="settings-field">
      <label for="f-${field.key}">${escapeHtml(field.label)}</label>
      <input
        class="admin-input"
        id="f-${field.key}"
        data-field="${field.key}"
        type="url"
        placeholder="https://..."
        value="${escapeHtml(valueOf(field.key))}"
      >
    </div>
  `;
}

function renderToggle(item) {
  const checked = settings?.[item.key] === true ? 'checked' : '';

  return `
    <label class="settings-toggle ${item.critical ? 'is-critical' : ''}">
      <input type="checkbox" data-field="${item.key}" ${checked}>

      <span class="settings-toggle-copy">
        <strong>${escapeHtml(item.label)}</strong>
        ${item.help ? `<span>${escapeHtml(item.help)}</span>` : ''}
      </span>
    </label>
  `;
}

function render() {
  body.innerHTML = `
    <article class="settings-card">
      <div class="settings-card-head">
        <h2>Identidade</h2>
        <p>Como o site se apresenta em buscadores e ao ser compartilhado.</p>
      </div>

      <div class="settings-grid">
        ${TEXT_FIELDS.map(renderTextField).join('')}
      </div>
    </article>

    <article class="settings-card" style="margin-top:16px">
      <div class="settings-card-head">
        <h2>Redes sociais</h2>
        <p>Deixe em branco o que não usar — links vazios não aparecem no site.</p>
      </div>

      <div class="settings-grid">
        ${SOCIAL_FIELDS.map(renderSocialField).join('')}
      </div>
    </article>

    ${TOGGLE_GROUPS.map(group => `
      <article class="settings-card" style="margin-top:16px">
        <div class="settings-card-head">
          <h2>${escapeHtml(group.title)}</h2>
          <p>${escapeHtml(group.description)}</p>
        </div>

        <div class="settings-toggles">
          ${group.items.map(renderToggle).join('')}
        </div>
      </article>
    `).join('')}

    <article class="settings-card" style="margin-top:16px">
      <div class="settings-card-head">
        <h2>Envio de arquivos</h2>
        <p>Limite aplicado aos uploads feitos pelo painel.</p>
      </div>

      <div class="settings-grid">
        <div class="settings-field">
          <label for="f-max_upload_size_mb">Tamanho máximo (MB)</label>
          <input
            class="admin-input"
            id="f-max_upload_size_mb"
            data-field="max_upload_size_mb"
            type="number"
            min="1"
            max="200"
            value="${escapeHtml(valueOf('max_upload_size_mb') || 25)}"
          >
          <div class="help">Recomendado entre 10 e 50 MB.</div>
        </div>
      </div>
    </article>
  `;
}

/* =========================================================
   COLETA E SALVAMENTO
========================================================= */

function collect() {
  const payload = {};

  body.querySelectorAll('[data-field]').forEach(element => {
    const key = element.dataset.field;

    if (element.type === 'checkbox') {
      payload[key] = element.checked;
      return;
    }

    if (element.type === 'number') {
      const number = Number(element.value);
      payload[key] = Number.isFinite(number) ? number : null;
      return;
    }

    payload[key] = element.value.trim() || null;
  });

  return payload;
}

function validate(payload) {
  const email = payload.contact_email;

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('E-mail de contato inválido.');
  }

  for (const field of SOCIAL_FIELDS) {
    const url = payload[field.key];

    if (url && !/^https?:\/\/.+/i.test(url)) {
      throw new Error(`O link de ${field.label} precisa começar com http:// ou https://`);
    }
  }

  const size = payload.max_upload_size_mb;

  if (size !== null && (size < 1 || size > 200)) {
    throw new Error('O tamanho máximo deve ficar entre 1 e 200 MB.');
  }
}

async function save() {
  if (isSaving || !settings) return;

  isSaving = true;
  saveButton.disabled = true;
  saveButton.textContent = 'Salvando...';

  try {
    const payload = collect();

    validate(payload);

    payload.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('system_settings')
      .update(payload)
      .eq('id', settings.id);

    if (error) throw error;

    settings = { ...settings, ...payload };

    if (payload.maintenance_mode === true) {
      setMessage('Salvo. Atenção: o modo manutenção está ATIVO.', 'error');
    } else {
      setMessage('Configurações salvas.', 'ok');
    }
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    setMessage(error.message || 'Não foi possível salvar.', 'error');
  } finally {
    isSaving = false;
    saveButton.disabled = false;
    saveButton.textContent = 'Salvar alterações';
  }
}

/* =========================================================
   CARREGAMENTO
========================================================= */

async function load() {
  body.innerHTML = '<div class="settings-loading">Carregando configurações...</div>';
  setMessage('Carregando...');

  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      body.innerHTML = `
        <div class="settings-loading">
          Nenhuma configuração encontrada.<br>
          Crie a linha inicial em system_settings antes de usar esta tela.
        </div>
      `;
      setMessage('Tabela de configurações vazia.', 'error');
      return;
    }

    settings = data;
    setMessage('');
    render();
  } catch (error) {
    console.error('Erro ao carregar configurações:', error);
    body.innerHTML = '<div class="settings-loading">Não foi possível carregar as configurações.</div>';
    setMessage(error.message || 'Não foi possível carregar.', 'error');
  }
}

/* =========================================================
   EVENTOS
========================================================= */

saveButton?.addEventListener('click', save);
reloadButton?.addEventListener('click', () => load());

/* Aviso imediato ao ligar o modo manutenção. */
body?.addEventListener('change', (event) => {
  const toggle = event.target.closest('[data-field="maintenance_mode"]');

  if (toggle && toggle.checked) {
    setMessage(
      'Modo manutenção marcado. O site sai do ar para visitantes quando você salvar.',
      'error'
    );
  }
});

await load();
