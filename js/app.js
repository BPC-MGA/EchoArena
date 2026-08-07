import { supabase } from './supabase.js';
import { loadSiteStats, loadHeroHighlights } from './stats.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  session: null,
  role: null,
  maintenance: false,
  heroes: [],
  screenVideos: new Map(),
  builds: [],
  activeHero: null,
  carouselIndex: 0,
  authMode: 'login',
  buildFilter: ''
};

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[char]));

const isVideo = (source = '', mime = '') =>
  mime.startsWith('video/') || /\.(mp4|webm)$/i.test(source);

function mediaOf(hero = {}, slot = 'main') {
  const chain = slot === 'card'
    ? ['card', 'main', 'gif']
    : slot === 'gif'
      ? ['gif', 'main', 'card']
      : ['main', 'card', 'gif'];

  for (const key of chain) {
    const source = hero[`${key}_source`];
    if (!source) continue;

    return {
      source,
      mime_type: hero[`${key}_mime_type`] || '',
      scale: hero[`${key}_scale`] ?? 1,
      offset_x: hero[`${key}_offset_x`] ?? 0,
      offset_y: hero[`${key}_offset_y`] ?? 0,
      fit: hero.fit || 'cover',
      anchor_x: hero.anchor_x || '50%',
      anchor_y: hero.anchor_y || '50%'
    };
  }

  return null;
}

function mediaStyle(media, fit) {
  if (!media) return '';
  return [
    `--fit:${fit || media.fit || 'cover'}`,
    `--pos:${media.anchor_x || '50%'} ${media.anchor_y || '50%'}`,
    `--scale:${Number(media.scale ?? 1)}`,
    `--x:${Number(media.offset_x ?? 0)}%`,
    `--y:${Number(media.offset_y ?? 0)}%`
  ].join(';');
}

function mediaInner(media, alt = '', eager = false) {
  if (!media?.source) return '';
  if (isVideo(media.source, media.mime_type || '')) {
    return `<video src="${escapeHtml(media.source)}" autoplay muted loop playsinline></video>`;
  }
  return `<img src="${escapeHtml(media.source)}" alt="${escapeHtml(alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;
}

function storagePublicUrl(path) {
  if (!path) return '';
  return supabase.storage.from('game-media').getPublicUrl(path).data.publicUrl || '';
}

async function loadScreenVideos() {
  const { data, error } = await supabase
    .from('heroes')
    .select(`
      id, screen_video_path, screen_video_intensity,
      screen_video_brightness, screen_video_contrast,
      screen_video_saturation, screen_video_hue,
      screen_video_tint, screen_video_vignette,
      screen_video_scale, screen_video_offset_x,
      screen_video_offset_y, screen_video_rotation
    `);

  if (error) {
    console.warn('[vídeos do telão]', error.message);
    state.screenVideos = new Map();
    return;
  }

  state.screenVideos = new Map((data || []).map((item) => [String(item.id), item]));
}

function renderScreenVideo(hero) {
  const frame = $('#arena-video-frame');
  const video = $('#arena-video');
  if (!frame || !video) return;

  const config = state.screenVideos.get(String(hero?.id || ''));
  const source = storagePublicUrl(config?.screen_video_path);

  if (!source) {
    video.pause();
    video.removeAttribute('src');
    video.load();
    frame.hidden = true;
    return;
  }

  const setting = (value, fallback, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, Number(value ?? fallback)));

  frame.style.setProperty('--screen-intensity', setting(config?.screen_video_intensity, .42, .18, .9));
  frame.style.setProperty('--screen-brightness', setting(config?.screen_video_brightness, .5, .25, 1.25));
  frame.style.setProperty('--screen-contrast', setting(config?.screen_video_contrast, 1.2, .7, 1.7));
  frame.style.setProperty('--screen-saturation', setting(config?.screen_video_saturation, .64, 0, 1.8));
  frame.style.setProperty('--screen-hue', `${setting(config?.screen_video_hue, 8, -180, 180)}deg`);
  frame.style.setProperty('--screen-tint', setting(config?.screen_video_tint, .36, 0, .85));
  frame.style.setProperty('--screen-vignette', setting(config?.screen_video_vignette, .42, 0, .9));
  frame.style.setProperty('--screen-scale', setting(config?.screen_video_scale, 1.08, 1, 1.8));
  frame.style.setProperty('--screen-x', `${setting(config?.screen_video_offset_x, 0, -35, 35)}%`);
  frame.style.setProperty('--screen-y', `${setting(config?.screen_video_offset_y, 0, -35, 35)}%`);
  frame.style.setProperty('--screen-rotate', `${setting(config?.screen_video_rotation, 0, -10, 10)}deg`);
  frame.hidden = false;

  if (video.src !== source) {
    video.src = source;
    video.load();
  }

  video.play().catch(() => {});
}

const CLASS_PALETTE = [
  '#F4D77A', '#8FE9FF', '#B794FF', '#4ADE80',
  '#F87171', '#FBBF24', '#67E8F9', '#F0A6D0'
];

function classColor(hero = {}) {
  const stored = String(hero.class_color || '').trim();
  if (/^#[0-9a-f]{3,8}$/i.test(stored)) return stored;

  const key = String(hero.class_slug || hero.class_name || hero.slug || 'echo');
  let sum = 0;
  for (let index = 0; index < key.length; index += 1) {
    sum = (sum + key.charCodeAt(index)) % 997;
  }
  return CLASS_PALETTE[sum % CLASS_PALETTE.length];
}

function showMessage(message, type = '') {
  const element = $('#auth-message');
  if (!element) return;
  element.textContent = message;
  element.className = `auth-message ${type}`.trim();
}

function setAuthMode(mode) {
  state.authMode = mode;
  const register = mode === 'register';
  $('#auth-title').textContent = register ? 'Criar conta' : 'Entrar';
  $('#auth-submit').textContent = register ? 'Registrar' : 'Entrar';
  $('#auth-switch-text').textContent = register ? 'Já tem uma conta?' : 'Ainda não tem conta?';
  $('#auth-switch-btn').textContent = register ? 'Entrar' : 'Registrar';
  $('#name-field').hidden = !register;
  $('#auth-password').autocomplete = register ? 'new-password' : 'current-password';
  showMessage('');
}

function openAuth(mode = 'login') {
  setAuthMode(mode);
  $('#auth-modal').classList.add('open');
  $('#auth-modal').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#auth-email')?.focus(), 0);
}

function closeAuth() {
  $('#auth-modal').classList.remove('open');
  $('#auth-modal').setAttribute('aria-hidden', 'true');
  $('#auth-form').reset();
  showMessage('');
}

function heroRole(hero = {}) {
  return hero.subtitle || hero.class_name || 'Herói';
}

function renderHeroCards(heroes = state.heroes) {
  const container = $('#heroes');
  if (!heroes.length) {
    container.innerHTML = '<div class="loading-card">Nenhum herói encontrado.</div>';
    return;
  }

  container.innerHTML = heroes.map((hero) => {
    const media = mediaOf(hero, 'card');
    const color = classColor(hero);
    const active = state.activeHero?.id === hero.id ? ' active' : '';
    const backdrop = media && !isVideo(media.source, media.mime_type || '')
      ? `<div class="media card-backdrop" aria-hidden="true" style="${mediaStyle(media, 'cover')}">${mediaInner(media, '')}</div>`
      : '';

    return `
      <article class="hero-card${active}" data-hero="${escapeHtml(hero.slug || hero.id)}" style="--class-color:${escapeHtml(color)}" tabindex="0" role="button" aria-label="Destacar ${escapeHtml(hero.name)}">
        ${backdrop}
        <div class="media ${media ? '' : 'empty'} card-media" style="${mediaStyle(media, 'contain')}">${mediaInner(media, hero.name)}</div>
        <div class="card-fade"></div><div class="role-mark">◇</div>
        <div class="card-copy"><div class="card-name">${escapeHtml(hero.name)}</div><div class="card-role">${escapeHtml(heroRole(hero))}</div></div>
      </article>`;
  }).join('');

  container.querySelectorAll('.hero-card').forEach((card) => {
    const select = () => {
      const hero = state.heroes.find((item) => String(item.slug || item.id) === card.dataset.hero);
      if (hero) renderSpotlight(hero, true);
    };
    card.addEventListener('click', select);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select();
      }
    });
  });
}

async function loadHeroes() {
  $('#heroes').innerHTML = '<div class="loading-card">Carregando heróis...</div>';

  const { data, error } = await supabase
    .from('v_heroes_complete')
    .select('*')
    .eq('enabled', true)
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('name')
    .limit(60);

  if (error) {
    console.error('[heróis]', error);
    $('#heroes').innerHTML = '<div class="loading-card">Não foi possível carregar os heróis.</div>';
    return;
  }

  state.heroes = data || [];
  const first = state.heroes[0] || null;
  if (first) renderSpotlight(first, false);
  renderHeroCards();
}

function renderSpotlight(hero, animate = true) {
  if (!hero) return;
  state.activeHero = hero;

  const stage = $('#hero-stage');
  const color = classColor(hero);
  stage.style.setProperty('--hero-accent', color);

  if (animate) {
    stage.classList.remove('is-changing');
    void stage.offsetWidth;
    stage.classList.add('is-changing');
  }

  $('#sp-name').textContent = hero.name || '';
  $('#sp-sub').textContent = heroRole(hero);
  $('.hero-description').textContent = hero.description || 'Informações em atualização.';
  $('#sp-tag-role').textContent = hero.class_name || 'Herói';
  $('#hero-code').textContent = String(hero.slug || hero.id || '—').toUpperCase();
  $('#hero-watermark').textContent = hero.name || '';
  renderScreenVideo(hero);

  const media = mediaOf(hero, 'main');
  const element = $('#spot-media');
  element.setAttribute('style', mediaStyle(media, 'contain'));
  element.innerHTML = mediaInner(media, hero.name, true);
  element.classList.toggle('empty', !media);

  $('#hero-details-btn').dataset.slug = hero.slug || '';
  $('#create-build-btn').dataset.hero = hero.id || '';
  loadHeroHighlights(hero);
  renderHeroCards();

  const build = state.builds.find((item) =>
    String(item.hero_id || '') === String(hero.id || '') ||
    String(item.hero_slug || '') === String(hero.slug || '')
  ) || state.builds[0];
  renderFeaturedBuild(build);
}

function buildTitle(build) {
  return build?.title || build?.name || 'Build da comunidade';
}

function renderFeaturedBuild(build) {
  if (!build) {
    $('#featured-build-title').textContent = 'Nenhuma build publicada';
    $('#featured-build-author').textContent = 'Aguardando dados da comunidade';
    $('#featured-build-likes').textContent = '—';
    $('#featured-build-popularity').textContent = '—';
    $('#featured-build-favorites').textContent = '—';
    $('#featured-build-btn').disabled = true;
    delete $('#featured-build-btn').dataset.build;
    return;
  }

  const likes = Number(build.likes || build.favorites || 0);
  $('#featured-build-title').textContent = buildTitle(build);
  $('#featured-build-author').textContent = `Por ${build.display_name || build.username || 'Jogador'}`;
  $('#featured-build-likes').textContent = likes ? `♥ ${likes.toLocaleString('pt-BR')}` : '♡';
  $('#featured-build-popularity').textContent = build.usage_percent != null ? `${Number(build.usage_percent).toFixed(1)}%` : '—';
  $('#featured-build-favorites').textContent = likes.toLocaleString('pt-BR');
  $('#featured-build-btn').disabled = false;
  $('#featured-build-btn').dataset.build = build.id;
}

function filteredBuilds() {
  if (!state.buildFilter) return state.builds;
  return state.builds.filter((build) => {
    const value = String(build.class_slug || build.hero_class_slug || '').toLowerCase();
    return value === state.buildFilter;
  });
}

function renderBuildList() {
  const builds = filteredBuilds();
  const container = $('#builds');

  if (!builds.length) {
    container.innerHTML = '<div class="loading-card">Nenhuma build publicada nesta categoria.</div>';
    return;
  }

  container.innerHTML = builds.slice(0, 6).map((build) => `
    <div class="build-row">
      <div><div class="name">${escapeHtml(buildTitle(build))}</div><div class="by">Por ${escapeHtml(build.display_name || build.username || 'Jogador')}</div></div>
      <div class="likes">${Number(build.likes || build.favorites || 0).toLocaleString('pt-BR')} ♡</div>
      <button class="open-build" data-build="${escapeHtml(build.id)}">Ver build</button>
    </div>`).join('');

  container.querySelectorAll('[data-build]').forEach((button) => {
    button.addEventListener('click', () => {
      window.location.href = `./criar-build.html?build=${encodeURIComponent(button.dataset.build)}`;
    });
  });
}

async function loadBuilds() {
  const { data, error } = await supabase
    .from('v_popular_builds')
    .select('*')
    .limit(20);

  if (error) {
    console.error('[builds]', error);
    $('#builds').innerHTML = '<div class="loading-card">Ainda não há builds públicas.</div>';
    renderFeaturedBuild(null);
    return;
  }

  state.builds = data || [];
  renderBuildList();
  renderFeaturedBuild(
    state.builds.find((build) => String(build.hero_id || '') === String(state.activeHero?.id || '')) || state.builds[0]
  );
}

async function loadSavedBuilds() {
  const container = $('#saved');
  if (!state.session?.user) {
    container.innerHTML = '<div class="loading-card">Entre para ver suas builds.</div>';
    return;
  }

  const { data, error } = await supabase
    .from('builds')
    .select('id,title,updated_at')
    .eq('user_id', state.session.user.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('[builds salvas]', error);
    container.innerHTML = '<div class="loading-card">Não foi possível carregar suas builds.</div>';
    return;
  }

  container.innerHTML = data?.length
    ? data.map((build) => `<div class="saved-row"><div><strong>${escapeHtml(build.title)}</strong><div class="date">Atualizada em ${new Date(build.updated_at).toLocaleDateString('pt-BR')}</div></div><span class="heart">♥</span></div>`).join('')
    : '<div class="loading-card">Você ainda não salvou builds.</div>';
}

async function loadAccountContext() {
  state.role = null;
  state.maintenance = false;
  const userId = state.session?.user?.id;
  if (!userId) return;

  try {
    const [profileResult, statusResult] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
      supabase.rpc('site_status')
    ]);
    state.role = profileResult.data?.role ?? null;
    const status = Array.isArray(statusResult.data) ? statusResult.data[0] : statusResult.data;
    state.maintenance = status?.maintenance_mode === true;
  } catch (error) {
    console.warn('[conta] contexto indisponível:', error.message);
  }
}

function confirmLogout() {
  if (state.role !== 'admin') return Promise.resolve(true);
  const warning = state.maintenance
    ? '\n\nO site está em manutenção e ficará bloqueado nesta aba.'
    : '';
  return Promise.resolve(window.confirm(`Sair da conta de administrador?${warning}`));
}

function updateAuthUI() {
  const loginButton = $('#login-btn');
  const accountButton = $('#register-btn');

  if (state.session?.user) {
    loginButton.textContent = 'Sair';
    loginButton.onclick = async () => {
      if (await confirmLogout()) await supabase.auth.signOut();
    };
    accountButton.textContent = state.session.user.email || 'Minha conta';
    accountButton.disabled = true;
  } else {
    loginButton.textContent = 'Entrar';
    loginButton.onclick = () => openAuth('login');
    accountButton.textContent = 'Registrar';
    accountButton.disabled = false;
    accountButton.onclick = () => openAuth('register');
  }

  loadSavedBuilds();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  showMessage('Processando...');

  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const displayName = $('#auth-name').value.trim();

  if (state.authMode === 'register') {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: window.location.origin + window.location.pathname
      }
    });
    if (error) return showMessage(error.message, 'error');
    showMessage('Conta criada. Confirme seu endereço pelo e-mail enviado.', 'success');
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return showMessage(error.message, 'error');
  closeAuth();
}

async function resetPassword() {
  const email = $('#auth-email').value.trim();
  if (!email) return showMessage('Digite seu e-mail primeiro.', 'error');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
  if (error) return showMessage(error.message, 'error');
  showMessage('Enviamos o link de recuperação para seu e-mail.', 'success');
}

function shiftCarousel(direction) {
  const container = $('#heroes');
  const cards = $$('.hero-card');
  if (!cards.length) return;
  const cardWidth = cards[0].getBoundingClientRect().width;
  const gap = Number.parseFloat(getComputedStyle(container).columnGap) || 16;
  const step = cardWidth + gap;
  const visible = Math.max(1, Math.floor($('.heroes-viewport').clientWidth / step));
  const maxIndex = Math.max(0, cards.length - visible);
  state.carouselIndex = Math.min(maxIndex, Math.max(0, state.carouselIndex + direction));
  container.style.transform = `translateX(${-state.carouselIndex * step}px)`;
}

let navigationToastTimer = 0;

function setSidebarOpen(open) {
  const sidebar = $('#site-sidebar');
  const trigger = $('#sidebar-open');
  if (!sidebar || !trigger) return;

  document.body.classList.toggle('sidebar-open', open);
  sidebar.setAttribute('aria-hidden', String(!open));
  trigger.setAttribute('aria-expanded', String(open));
  $('#sidebar-backdrop')?.setAttribute('aria-hidden', String(!open));

  if (open) $('#sidebar-close')?.focus();
  else trigger.focus({ preventScroll: true });
}

function showNavigationToast(message) {
  const toast = $('#nav-toast');
  if (!toast) return;
  window.clearTimeout(navigationToastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  navigationToastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function bindSidebarNavigation() {
  $('#sidebar-open')?.addEventListener('click', () => setSidebarOpen(true));
  $('#sidebar-close')?.addEventListener('click', () => setSidebarOpen(false));
  $('#sidebar-backdrop')?.addEventListener('click', () => setSidebarOpen(false));

  $$('#site-sidebar a').forEach((link) => {
    link.addEventListener('click', (event) => {
      const upcoming = link.dataset.comingSoon;
      if (upcoming) {
        event.preventDefault();
        showNavigationToast(`${upcoming}: esta área será disponibilizada em breve.`);
        return;
      }
      setSidebarOpen(false);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('sidebar-open')) {
      setSidebarOpen(false);
    }
  });
}

function bindEvents() {
  bindSidebarNavigation();
  $('#auth-close').addEventListener('click', closeAuth);
  $('#auth-modal').addEventListener('click', (event) => {
    if (event.target.id === 'auth-modal') closeAuth();
  });
  $('#auth-form').addEventListener('submit', handleAuthSubmit);
  $('#auth-switch-btn').addEventListener('click', () => setAuthMode(state.authMode === 'login' ? 'register' : 'login'));
  $('#forgot-password-btn').addEventListener('click', resetPassword);

  $('#hero-details-btn').addEventListener('click', (event) => {
    const slug = event.currentTarget.dataset.slug;
    window.location.href = slug ? `./herois.html?hero=${encodeURIComponent(slug)}` : './herois.html';
  });

  $('#create-build-btn').addEventListener('click', (event) => {
    if (!state.session?.user) return openAuth('login');
    const heroId = event.currentTarget.dataset.hero;
    window.location.href = heroId ? `./criar-build.html?hero=${encodeURIComponent(heroId)}` : './criar-build.html';
  });

  $('#featured-build-btn').addEventListener('click', (event) => {
    const buildId = event.currentTarget.dataset.build;
    if (buildId) window.location.href = `./criar-build.html?build=${encodeURIComponent(buildId)}`;
  });

  $('#heroes-prev').addEventListener('click', () => shiftCarousel(-1));
  $('#heroes-next').addEventListener('click', () => shiftCarousel(1));

  $('#hero-search').addEventListener('input', (event) => {
    const value = event.target.value.trim().toLocaleLowerCase('pt-BR');
    const results = !value ? state.heroes : state.heroes.filter((hero) =>
      [hero.name, hero.subtitle, hero.class_name, hero.description]
        .filter(Boolean)
        .some((field) => String(field).toLocaleLowerCase('pt-BR').includes(value))
    );
    state.carouselIndex = 0;
    $('#heroes').style.transform = '';
    renderHeroCards(results);
  });

  $$('.filters b').forEach((button) => {
    button.addEventListener('click', () => {
      $$('.filters b').forEach((item) => item.classList.remove('on'));
      button.classList.add('on');
      state.buildFilter = button.dataset.class || '';
      renderBuildList();
    });
  });

  window.addEventListener('resize', () => shiftCarousel(0));
}

async function bootstrap() {
  if (window.__ECHO_BLOCKED) return;
  bindEvents();

  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  await loadAccountContext();
  updateAuthUI();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    await loadAccountContext();
    updateAuthUI();
  });

  await loadScreenVideos();
  await Promise.all([loadHeroes(), loadBuilds(), loadSiteStats()]);
}

bootstrap().catch((error) => console.error('[Echo Arena]', error));
