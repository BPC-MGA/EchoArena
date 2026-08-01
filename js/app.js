import { supabase } from './supabase.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  session: null,
  heroes: [],
  builds: [],
  authMode: 'login'
};

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[char]));

const isVideo = (source = '', mime = '') =>
  mime.startsWith('video/') || /\.(mp4|webm)$/i.test(source);

function mediaStyle(media = {}) {
  const fit = media.fit || 'cover';
  const scale = Number(media.scale ?? 1);
  const x = Number(media.offset_x ?? 0);
  const y = Number(media.offset_y ?? 0);
  const pos = `${media.anchor_x || '50%'} ${media.anchor_y || '50%'}`;
  return `--fit:${fit};--pos:${pos};--scale:${scale};--x:${x}px;--y:${y}px`;
}

function mediaInner(media = {}, alt = '') {
  const source = media.media_source || media.source || '';
  if (!source) return '';
  return isVideo(source, media.mime_type || '')
    ? `<video src="${escapeHtml(source)}" autoplay muted loop playsinline></video>`
    : `<img src="${escapeHtml(source)}" alt="${escapeHtml(alt)}" loading="lazy">`;
}

function showMessage(message, type = '') {
  const el = $('#auth-message');
  el.textContent = message;
  el.className = `auth-message ${type}`.trim();
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
  setTimeout(() => $('#auth-email').focus(), 0);
}

function closeAuth() {
  $('#auth-modal').classList.remove('open');
  $('#auth-modal').setAttribute('aria-hidden', 'true');
  $('#auth-form').reset();
  showMessage('');
}

async function loadHeroes(classSlug = '') {
  const container = $('#heroes');
  container.innerHTML = '<div class="loading-card">Carregando heróis...</div>';

  let query = supabase
    .from('v_heroes_complete')
    .select('*')
    .eq('enabled', true)
    .order('name')
    .limit(60);

  if (classSlug) query = query.eq('class_slug', classSlug);

  const { data, error } = await query;

  if (error) {
    console.error(error);
    container.innerHTML = `<div class="loading-card">Não foi possível carregar os heróis.</div>`;
    return;
  }

  state.heroes = data || [];
  container.innerHTML = state.heroes.slice(0, 12).map((hero) => `
    <article class="hc" data-hero="${escapeHtml(hero.slug)}">
      <div class="thumb">
        <div class="media ${hero.media_source ? '' : 'empty'}"
             style="${mediaStyle(hero)}">
          ${mediaInner(hero, hero.name)}
        </div>
        <div class="fade"></div>
        <span class="div">${escapeHtml(hero.class_name || 'Herói')}</span>
        <div class="cap">
          <div class="n">${escapeHtml(hero.name)}</div>
          <div class="r">${escapeHtml(hero.class_name || '')}</div>
        </div>
      </div>
    </article>
  `).join('');

  renderSpotlight(state.heroes[0]);
}

function renderSpotlight(hero) {
  if (!hero) return;

  $('#sp-name').textContent = hero.name || '';
  $('#sp-sub').textContent = hero.subtitle || hero.class_name || '';
  $('.spot .desc').textContent = hero.description || 'Informações em atualização.';

  const media = $('#spot-media');
  media.setAttribute('style', mediaStyle(hero));
  media.innerHTML = mediaInner(hero, hero.name);
  media.classList.toggle('empty', !hero.media_source);
}

async function loadBuilds() {
  const container = $('#builds');
  container.innerHTML = '<div class="loading-card">Carregando builds...</div>';

  const { data, error } = await supabase
    .from('v_popular_builds')
    .select('*')
    .limit(10);

  if (error) {
    console.error(error);
    container.innerHTML = '<div class="loading-card">Ainda não há builds públicas.</div>';
    return;
  }

  state.builds = data || [];
  container.innerHTML = state.builds.length
    ? state.builds.map((build) => `
      <div class="brow">
        <div class="who">
          <div class="av media empty"></div>
          <div>
            <div class="nm">${escapeHtml(build.title)}</div>
            <div class="by">Por <b>${escapeHtml(build.display_name || build.username || 'Jogador')}</b></div>
          </div>
        </div>
        <div></div>
        <div class="m">
          <div class="v g">${Number(build.likes || 0).toLocaleString('pt-BR')}</div>
          <div class="l">Favoritos</div>
        </div>
        <div class="items">${'<i></i>'.repeat(6)}</div>
        <button class="go" data-build="${build.id}">Ver build</button>
      </div>
    `).join('')
    : '<div class="loading-card">Nenhuma build publicada ainda.</div>';
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
    .order('updated_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error(error);
    container.innerHTML = '<div class="loading-card">Não foi possível carregar suas builds.</div>';
    return;
  }

  container.innerHTML = data?.length
    ? data.map((build) => `
      <div class="r">
        <div class="av media empty"></div>
        <div class="tx">
          <div class="n">${escapeHtml(build.title)}</div>
          <div class="d">Atualizada em ${new Date(build.updated_at).toLocaleDateString('pt-BR')}</div>
        </div>
        <div class="ii">${'<i></i>'.repeat(5)}</div>
        <span class="hz">♥</span>
      </div>
    `).join('')
    : '<div class="loading-card">Você ainda não salvou builds.</div>';
}

function updateAuthUI() {
  const loginButton = $('#login-btn');
  const registerButton = $('#register-btn');

  if (state.session?.user) {
    loginButton.textContent = 'Sair';
    loginButton.onclick = async () => {
      await supabase.auth.signOut();
    };
    registerButton.textContent = state.session.user.email || 'Minha conta';
    registerButton.disabled = true;
  } else {
    loginButton.textContent = 'Entrar';
    loginButton.onclick = () => openAuth('login');
    registerButton.textContent = 'Registrar';
    registerButton.disabled = false;
    registerButton.onclick = () => openAuth('register');
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

    showMessage(
      'Sua conta foi criada com sucesso. Enviamos um e-mail de confirmação. Após validar seu endereço de e-mail, você poderá acessar todos os recursos da plataforma.',
      'success'
    );
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

function bindEvents() {
  $('#auth-close').onclick = closeAuth;
  $('#auth-modal').onclick = (event) => {
    if (event.target.id === 'auth-modal') closeAuth();
  };
  $('#auth-form').addEventListener('submit', handleAuthSubmit);
  $('#auth-switch-btn').onclick = () =>
    setAuthMode(state.authMode === 'login' ? 'register' : 'login');
  $('#forgot-password-btn').onclick = resetPassword;

  $('#promo-login-btn').onclick = () => openAuth('login');
  $('#promo-register-btn').onclick = () => openAuth('register');

  $('#create-build-btn').onclick = () => {
  if (!state.session?.user) return openAuth('login');

  window.location.href = "./criar-build.html";
};

  $('#bg').onclick = () => $('#side').classList.toggle('open');

  $$('.filters b').forEach((button) => {
    button.onclick = () => {
      $$('.filters b').forEach((item) => item.classList.remove('on'));
      button.classList.add('on');
      loadHeroes(button.dataset.class || '');
    };
  });
}

async function bootstrap() {
  bindEvents();

  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  updateAuthUI();

  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    updateAuthUI();
  });

  await Promise.all([loadHeroes(), loadBuilds()]);
}

bootstrap().catch((error) => {
  console.error('[Echo Arena]', error);
});
