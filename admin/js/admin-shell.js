
import { supabase } from '../../js/supabase.js';

const DEFAULT_MENU = [
  { id: 'dashboard', label: 'Dashboard', href: './index.html' },
  {
    id: 'heroes',
    label: 'Heróis',
    children: [
      { id: 'heroes-list', label: 'Lista', href: './heroes.html' },
      { id: 'hero-new', label: 'Novo herói', href: './hero-editor.html' },
      { id: 'hero-stats', label: 'Status', href: './hero-stats.html' }
    ]
  },
  {
    id: 'equipments',
    label: 'Equipamentos',
    children: [
      { id: 'equipments-list', label: 'Lista', href: './equipments.html' },
      { id: 'equipment-new', label: 'Novo equipamento', href: './equipment-editor.html' },
      { id: 'equipment-import', label: 'Importar por print', href: './equipment-import.html' }
    ]
  },
  { id: 'builds', label: 'Builds', href: './builds.html' },
  { id: 'comments', label: 'Comentários', href: './comments.html' },
  { id: 'users', label: 'Usuários', href: './users.html' },
  { id: 'site-texts', label: 'Textos do site', href: './site-texts.html' }
];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizePath(pathname) {
  return pathname
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .toLowerCase();
}

function currentFile() {
  const path = normalizePath(location.pathname);
  return path.split('/').pop() || 'index.html';
}

function isActiveItem(item, activeId) {
  if (activeId && item.id === activeId) return true;

  if (item.href) {
    const target = item.href.split('/').pop()?.toLowerCase();
    return target === currentFile();
  }

  return item.children?.some(child => isActiveItem(child, activeId)) ?? false;
}

function renderMenu(items, activeId) {
  return items.map(item => {
    const active = isActiveItem(item, activeId);

    if (item.children?.length) {
      const children = item.children.map(child => {
        const childActive = isActiveItem(child, activeId);

        return `
          <a
            class="admin-shell-subitem ${childActive ? 'is-active' : ''}"
            href="${child.href}"
            data-menu-id="${child.id}"
          >
            ${escapeHtml(child.label)}
          </a>
        `;
      }).join('');

      return `
        <div class="admin-shell-group ${active ? 'is-open' : ''}">
          <button
            type="button"
            class="admin-shell-group-trigger ${active ? 'is-active' : ''}"
            aria-expanded="${active ? 'true' : 'false'}"
          >
            <span>${escapeHtml(item.label)}</span>
            <span class="admin-shell-chevron">⌄</span>
          </button>

          <div class="admin-shell-submenu">
            ${children}
          </div>
        </div>
      `;
    }

    return `
      <a
        class="admin-shell-item ${active ? 'is-active' : ''}"
        href="${item.href}"
        data-menu-id="${item.id}"
      >
        ${escapeHtml(item.label)}
      </a>
    `;
  }).join('');
}

async function getCurrentAdmin() {
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,username,display_name,role_id,roles(name)')
    .eq('id', session.user.id)
    .single();

  if (profileError) throw profileError;

  const roleName = profile?.roles?.name ?? profile?.roles?.[0]?.name;

  if (roleName !== 'admin') return null;

  return {
    session,
    profile,
    email: session.user.email ?? '',
    displayName:
      profile?.display_name ||
      profile?.username ||
      session.user.email ||
      'Administrador'
  };
}

function setPageTitle(title, subtitle) {
  const titleElement = document.querySelector('[data-admin-page-title]');
  const subtitleElement = document.querySelector('[data-admin-page-subtitle]');

  if (titleElement && title) titleElement.textContent = title;
  if (subtitleElement) subtitleElement.textContent = subtitle ?? '';
}

function bindNavigation() {
  document.querySelectorAll('.admin-shell-group-trigger').forEach(button => {
    button.addEventListener('click', () => {
      const group = button.closest('.admin-shell-group');
      const opened = group.classList.toggle('is-open');
      button.setAttribute('aria-expanded', String(opened));
    });
  });

  const mobileButton = document.getElementById('admin-shell-mobile-toggle');
  const sidebar = document.getElementById('admin-shell-sidebar');
  const backdrop = document.getElementById('admin-shell-backdrop');

  const closeMobile = () => {
    sidebar?.classList.remove('is-mobile-open');
    backdrop?.classList.remove('is-visible');
    document.body.classList.remove('admin-shell-lock');
  };

  mobileButton?.addEventListener('click', () => {
    sidebar?.classList.toggle('is-mobile-open');
    backdrop?.classList.toggle('is-visible');
    document.body.classList.toggle('admin-shell-lock');
  });

  backdrop?.addEventListener('click', closeMobile);

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeMobile();
  });
}

function renderShell({
  admin,
  activeId,
  menuItems,
  pageTitle,
  pageSubtitle
}) {
  document.body.classList.add('admin-shell-body');

  const existingContent = document.querySelector('[data-admin-content]');
  const pageContent = existingContent
    ? existingContent.innerHTML
    : document.body.innerHTML;

  document.body.innerHTML = `
    <div class="admin-shell-app">
      <div id="admin-shell-backdrop" class="admin-shell-backdrop"></div>

      <aside id="admin-shell-sidebar" class="admin-shell-sidebar">
        <a class="admin-shell-brand" href="./index.html">
          <span>ECHO</span>
          <strong>ADMIN</strong>
        </a>

        <nav class="admin-shell-nav">
          ${renderMenu(menuItems, activeId)}
        </nav>

        <div class="admin-shell-sidebar-footer">
          <a class="admin-shell-site-link" href="../index.html">Ver site</a>
        </div>
      </aside>

      <section class="admin-shell-workspace">
        <header class="admin-shell-topbar">
          <button
            id="admin-shell-mobile-toggle"
            class="admin-shell-mobile-toggle"
            type="button"
            aria-label="Abrir menu"
          >
            ☰
          </button>

          <div class="admin-shell-heading">
            <span data-admin-page-subtitle>${escapeHtml(pageSubtitle ?? '')}</span>
            <h1 data-admin-page-title>${escapeHtml(pageTitle ?? 'Painel administrativo')}</h1>
          </div>

          <div class="admin-shell-user">
            <div class="admin-shell-user-copy">
              <strong>${escapeHtml(admin.displayName)}</strong>
              <span>${escapeHtml(admin.email)}</span>
            </div>

            <button id="admin-shell-logout" class="admin-shell-logout" type="button">
              Sair
            </button>
          </div>
        </header>

        <main class="admin-shell-main">
          <div data-admin-content class="admin-shell-content">
            ${pageContent}
          </div>
        </main>
      </section>
    </div>
  `;

  bindNavigation();

  document.getElementById('admin-shell-logout')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.href = './login.html';
  });
}

export async function initAdminShell({
  activeId = '',
  pageTitle = 'Painel administrativo',
  pageSubtitle = '',
  menuItems = DEFAULT_MENU,
  redirectTo = './login.html'
} = {}) {
  try {
    const admin = await getCurrentAdmin();

    if (!admin) {
      location.href = redirectTo;
      return null;
    }

    renderShell({
      admin,
      activeId,
      menuItems,
      pageTitle,
      pageSubtitle
    });

    return {
      admin,
      setPageTitle,
      supabase
    };
  } catch (error) {
    console.error('Falha ao iniciar o painel:', error);
    location.href = redirectTo;
    return null;
  }
}

export { setPageTitle, DEFAULT_MENU };
