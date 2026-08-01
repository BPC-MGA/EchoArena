import { supabase } from '../../js/supabase.js';

const list = document.getElementById('users-list');
const search = document.getElementById('search');
const roleFilter = document.getElementById('role-filter');
const statusFilter = document.getElementById('status-filter');
const message = document.getElementById('message');

let users = [];
let roles = [];
let currentUserId = null;
let activeActionId = null;
let isLoading = false;

/* =========================================================
   UTILITÁRIOS
========================================================= */

function setMessage(text = '', type = '') {
  if (!message) return;

  message.textContent = text;
  message.className = `users-message${type ? ` ${type}` : ''}`;
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
    .trim();
}

function formatDate(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function displayNameOf(user) {
  return (
    user.display_name ||
    user.username ||
    'Usuário sem nome'
  );
}

function initialOf(user) {
  return String(displayNameOf(user)).trim().charAt(0).toUpperCase() || '?';
}

/* =========================================================
   FILTROS
========================================================= */

function getFilteredUsers() {
  const query = normalizeText(search?.value);
  const selectedRole = roleFilter?.value || 'all';
  const selectedStatus = statusFilter?.value || 'all';

  return users
    .filter(user => {
      const matchesQuery =
        !query ||
        normalizeText(user.username).includes(query) ||
        normalizeText(user.display_name).includes(query);

      const matchesRole =
        selectedRole === 'all' ||
        user.role === selectedRole;

      const matchesStatus =
        selectedStatus === 'all' ||
        (selectedStatus === 'blocked' && user.is_blocked === true) ||
        (selectedStatus === 'active' && user.is_blocked !== true);

      return matchesQuery && matchesRole && matchesStatus;
    })
    .sort((first, second) => {
      /* Bloqueados primeiro, depois admins, depois alfabético. */
      const blockedDiff =
        (second.is_blocked === true ? 1 : 0) -
        (first.is_blocked === true ? 1 : 0);

      if (blockedDiff !== 0) return blockedDiff;

      const adminDiff =
        (second.role === 'admin' ? 1 : 0) -
        (first.role === 'admin' ? 1 : 0);

      if (adminDiff !== 0) return adminDiff;

      return displayNameOf(first).localeCompare(displayNameOf(second), 'pt-BR');
    });
}

/* =========================================================
   RESUMO
========================================================= */

function renderSummary() {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const totals = {
    'summary-total': users.length,
    'summary-admins': users.filter(u => u.role === 'admin').length,
    'summary-blocked': users.filter(u => u.is_blocked === true).length,
    'summary-recent': users.filter(u => {
      const created = new Date(u.created_at).getTime();
      return Number.isFinite(created) && created >= thirtyDaysAgo;
    }).length
  };

  for (const [id, value] of Object.entries(totals)) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  }
}

/* =========================================================
   RENDERIZAÇÃO
========================================================= */

function renderRoleSelect(user) {
  const isSelf = user.id === currentUserId;
  const isBusy = activeActionId === user.id;

  const options = roles
    .map(role => `
      <option
        value="${escapeHtml(role.name)}"
        ${user.role === role.name ? 'selected' : ''}
      >
        ${escapeHtml(role.name)}
      </option>
    `)
    .join('');

  return `
    <select
      class="admin-select"
      data-role-for="${escapeHtml(user.id)}"
      ${isSelf || isBusy ? 'disabled' : ''}
      title="${isSelf ? 'Você não pode alterar o próprio papel' : 'Alterar papel'}"
    >
      ${options}
    </select>
  `;
}

function renderUserRow(user) {
  const blocked = user.is_blocked === true;
  const isSelf = user.id === currentUserId;
  const isBusy = activeActionId === user.id;

  const avatarInner = user.avatar_url
    ? `<img src="${escapeHtml(user.avatar_url)}" alt="" loading="lazy">`
    : escapeHtml(initialOf(user));

  const statusBadge = blocked
    ? '<span class="user-badge blocked">Bloqueado</span>'
    : '<span class="user-badge ok">Ativo</span>';

  const roleBadge = user.role === 'admin'
    ? '<span class="user-badge admin">Admin</span>'
    : '';

  const blockedInfo = blocked
    ? `<small>${escapeHtml(user.blocked_reason || 'Sem motivo registrado')}${
        user.blocked_at ? ` · ${formatDate(user.blocked_at)}` : ''
      }</small>`
    : '';

  return `
    <article
      class="user-row ${blocked ? 'is-blocked' : ''}"
      data-user-id="${escapeHtml(user.id)}"
    >
      <div class="user-identity">
        <div class="user-avatar">${avatarInner}</div>

        <div class="user-identity-copy">
          <strong>
            ${escapeHtml(displayNameOf(user))}
            ${roleBadge}
          </strong>

          <span>
            ${escapeHtml(user.username ? `@${user.username}` : 'sem username')}
            ${user.created_at ? ` · desde ${formatDate(user.created_at)}` : ''}
          </span>
        </div>
      </div>

      <div class="user-role-cell">
        ${renderRoleSelect(user)}
      </div>

      <div class="user-status-copy">
        ${statusBadge}
        ${blockedInfo}
      </div>

      <div class="user-actions">
        ${
          isSelf
            ? '<span class="user-badge">Você</span>'
            : `
              <button
                class="admin-button ${blocked ? '' : 'danger'}"
                type="button"
                data-block="${escapeHtml(user.id)}"
                data-blocked="${blocked}"
                ${isBusy ? 'disabled' : ''}
              >
                ${isBusy ? 'Aguarde...' : blocked ? 'Desbloquear' : 'Bloquear'}
              </button>
            `
        }
      </div>
    </article>
  `;
}

function render() {
  const rows = getFilteredUsers();

  renderSummary();

  if (!rows.length) {
    list.innerHTML = `
      <div class="users-empty">
        Nenhum usuário encontrado.
      </div>
    `;
    return;
  }

  list.innerHTML = rows.map(renderUserRow).join('');

  bindRowActions();
}

function renderRoleOptions() {
  if (!roleFilter) return;

  const extra = roles
    .map(role => `<option value="${escapeHtml(role.name)}">${escapeHtml(role.name)}</option>`)
    .join('');

  roleFilter.innerHTML = `<option value="all">Todos</option>${extra}`;
}

/* =========================================================
   AÇÕES
========================================================= */

async function changeRole(userId, newRole) {
  const user = users.find(item => item.id === userId);
  if (!user || user.role === newRole) return;

  activeActionId = userId;
  render();
  setMessage(`Alterando papel de ${displayNameOf(user)}...`);

  try {
    const { error } = await supabase.rpc('admin_set_user_role', {
      target_id: userId,
      new_role: newRole
    });

    if (error) throw error;

    user.role = newRole;
    user.is_admin = newRole === 'admin';

    setMessage(`${displayNameOf(user)} agora é "${newRole}".`, 'ok');
  } catch (error) {
    console.error('Erro ao alterar papel:', error);
    setMessage(error.message || 'Não foi possível alterar o papel.', 'error');
  } finally {
    activeActionId = null;
    render();
  }
}

async function toggleBlock(userId) {
  const user = users.find(item => item.id === userId);
  if (!user) return;

  const blocking = user.is_blocked !== true;
  let reason = null;

  if (blocking) {
    reason = window.prompt(
      `Bloquear "${displayNameOf(user)}".\n\nMotivo (opcional):`,
      ''
    );

    /* Cancelar no prompt aborta a ação. */
    if (reason === null) return;
  } else {
    const confirmed = window.confirm(
      `Desbloquear "${displayNameOf(user)}"?`
    );

    if (!confirmed) return;
  }

  activeActionId = userId;
  render();
  setMessage(blocking ? 'Bloqueando...' : 'Desbloqueando...');

  try {
    const { error } = await supabase.rpc('admin_set_user_blocked', {
      target_id: userId,
      blocked: blocking,
      reason: reason?.trim() || null
    });

    if (error) throw error;

    user.is_blocked = blocking;
    user.blocked_reason = blocking ? (reason?.trim() || null) : null;
    user.blocked_at = blocking ? new Date().toISOString() : null;

    setMessage(
      blocking
        ? `${displayNameOf(user)} foi bloqueado.`
        : `${displayNameOf(user)} foi desbloqueado.`,
      'ok'
    );
  } catch (error) {
    console.error('Erro ao alterar bloqueio:', error);
    setMessage(error.message || 'Não foi possível alterar o bloqueio.', 'error');
  } finally {
    activeActionId = null;
    render();
  }
}

function bindRowActions() {
  list.querySelectorAll('[data-block]').forEach(button => {
    button.addEventListener('click', () => {
      toggleBlock(button.dataset.block);
    });
  });

  list.querySelectorAll('[data-role-for]').forEach(select => {
    select.addEventListener('change', () => {
      changeRole(select.dataset.roleFor, select.value);
    });
  });
}

/* =========================================================
   CARREGAMENTO
========================================================= */

async function load() {
  if (isLoading) return;
  isLoading = true;

  list.innerHTML = '<div class="users-empty">Carregando usuários...</div>';
  setMessage('Carregando...');

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    currentUserId = sessionData?.session?.user?.id ?? null;

    const [rolesResult, usersResult] = await Promise.all([
      supabase.from('roles').select('id, name').order('id'),
      supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, role, is_blocked, blocked_reason, blocked_at, created_at')
        .order('created_at', { ascending: false })
    ]);

    if (rolesResult.error) throw rolesResult.error;
    if (usersResult.error) throw usersResult.error;

    roles = rolesResult.data ?? [];
    users = usersResult.data ?? [];

    renderRoleOptions();
    setMessage('');
    render();
  } catch (error) {
    console.error('Erro ao carregar usuários:', error);

    list.innerHTML = `
      <div class="users-empty">
        Não foi possível carregar os usuários.
      </div>
    `;

    setMessage(error.message || 'Não foi possível carregar os usuários.', 'error');
  } finally {
    isLoading = false;
  }
}

/* =========================================================
   EVENTOS
========================================================= */

search?.addEventListener('input', render);
roleFilter?.addEventListener('change', render);
statusFilter?.addEventListener('change', render);

await load();
