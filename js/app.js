import { supabase } from './supabase.js';
import { loadSiteStats, loadHeroHighlights } from './stats.js';

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

/* =========================================================
   MÍDIA
   Cada destino tem sua própria imagem e seu próprio
   enquadramento. "slot" define qual usar:
     main → spotlight
     card → cards de herói
     gif  → animação
========================================================= */

function mediaOf(hero = {}, slot = 'main') {
  const chain = slot === 'card'
    ? ['card', 'main', 'gif']
    : slot === 'gif'
      ? ['gif', 'main', 'card']
      : ['main', 'card', 'gif'];

  for (const key of chain) {
    const source = hero[`${key}_source`];

    if (source) {
      return {
        source,
        mime_type: hero[`${key}_mime_type`] || '',
        scale:     hero[`${key}_scale`] ?? 1,
        offset_x:  hero[`${key}_offset_x`] ?? 0,
        offset_y:  hero[`${key}_offset_y`] ?? 0,
        fit:       hero.fit || 'cover',
        anchor_x:  hero.anchor_x || '50%',
        anchor_y:  hero.anchor_y || '50%'
      };
    }
  }

  return null;
}

function mediaStyle(media, fit) {
  if (!media) return '';

  const pos = `${media.anchor_x || '50%'} ${media.anchor_y || '50%'}`;

  return [
    `--fit:${fit || media.fit || 'cover'}`,
    `--pos:${pos}`,
    `--scale:${Number(media.scale ?? 1)}`,
    `--x:${Number(media.offset_x ?? 0)}%`,
    `--y:${Number(media.offset_y ?? 0)}%`
  ].join(';');
}

function mediaInner(media, alt = '') {
  if (!media?.source) return '';

  return isVideo(media.source, media.mime_type || '')
    ? `<video src="${escapeHtml(media.source)}" autoplay muted loop playsinline></video>`
    : `<img src="${escapeHtml(media.source)}" alt="${escapeHtml(alt)}" loading="lazy">`;
}

/* =========================================================
   COR DA CLASSE
   Vem de hero_classes.color, editável no painel.
   Sem cor definida, usa uma paleta estável derivada do slug —
   o mesmo slug sempre recebe a mesma cor.
========================================================= */

const CLASS_PALETTE = [
  '#F4D77A', '#8FE9FF', '#B794FF', '#4ADE80',
  '#F87171', '#FBBF24', '#67E8F9', '#F0A6D0'
];

function classColor(hero = {}) {
  const stored = String(hero.class_color || '').trim();

  if (/^#[0-9a-f]{3,8}$/i.test(stored)) return stored;

  const key = String(hero.class_slug || hero.class_name || hero.slug || '');
  let sum = 0;

  for (let i = 0; i < key.length; i += 1) {
    sum = (sum + key.charCodeAt(i)) % 997;
  }

  return CLASS_PALETTE[sum % CLASS_PALETTE.length];
}

/* =========================================================
   AUTENTICAÇÃO
========================================================= */

function showMessage(message, type = '') {
  const el = $('#auth-message');
  if (!el) return;
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

/* =========================================================
   HERÓIS
========================================================= */

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
    container.innerHTML = '<div class="loading-card">Não foi possível carregar os heróis.</div>';
    return;
  }

  state.heroes = data || [];

  container.innerHTML = state.heroes.slice(0, 12).map((hero) => {
    const media = mediaOf(hero, 'card');
    const color = classColor(hero);

    return `
      <article class="hc" data-hero="${escapeHtml(hero.slug)}"
               style="--class-color:${escapeHtml(color)}">
        <div class="thumb">
          <div class="media ${media ? '' : 'empty'}"
               style="${mediaStyle(media, 'cover')}">
            ${mediaInner(media, hero.name)}
          </div>
          <div class="fade"></div>
          <div class="cap">
            <div class="n" style="color:${escapeHtml(color)}">
              ${escapeHtml(hero.name)}
            </div>
            <div class="r">${escapeHtml(hero.class_name || '')}</div>
          </div>
        </div>
      </article>
    `;
  }).join('');

  renderSpotlight(state.heroes[0]);
}

function renderSpotlight(hero) {
  if (!hero) return;

  loadHeroHighlights(hero);

  $('#sp-name').textContent = hero.name || '';
  $('#sp-sub').textContent = hero.subtitle || hero.class_name || '';
  $('.spot .desc').textContent = hero.description || 'Informações em atualização.';

  /* O spotlight muda muito de proporção entre desktop e celular.
     "contain" garante o herói inteiro visível em qualquer largura. */
  const media = mediaOf(hero, 'main');
  const element = $('#spot-media');

  element.setAttribute('style', mediaStyle(media, 'contain'));
  element.innerHTML = mediaInner(media, hero.name);
  element.classList.toggle('empty', !media);
}

/* =========================================================
   BUILDS
========================================================= */

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
    .is('deleted_at', null)
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

/* =========================================================
   SESSÃO
========================================================= */

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
      'Sua conta foi criada com sucesso. Enviamos um e-mail de confirmação. ' +
      'Após validar seu endereço de e-mail, você poderá acessar todos os recursos da plataforma.',
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

/* =========================================================
   EVENTOS
========================================================= */

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
    window.location.href = './criar-build.html';
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

/* =========================================================
   MODO MANUTENÇÃO
   Consultado antes de qualquer renderização. Admin passa
   direto e vê apenas uma faixa de aviso no topo.
========================================================= */

function renderMaintenanceScreen(siteName = 'Echo Arena') {
  document.body.innerHTML = `
    <div class="mnt-wrap">
      <div class="mnt-glow"></div>

      <main class="mnt-card">
        <div class="mnt-mark"></div>

        <h1>${escapeHtml(siteName)}</h1>
        <p class="mnt-tag">Manutenção em andamento</p>

        <p class="mnt-copy">
          Estamos ajustando os bastidores da arena.
          O site volta ao ar em instantes.
        </p>

        <div class="mnt-bar"><i></i></div>

        <button class="mnt-retry" type="button" onclick="location.reload()">
          Tentar novamente
        </button>
      </main>
    </div>
  `;

  const style = document.createElement('style');

  style.textContent = `
    .mnt-wrap{position:fixed;inset:0;display:grid;place-items:center;padding:24px;
      background:radial-gradient(circle at 50% 0%,#1b1240 0%,#0A0714 55%);overflow:hidden}
    .mnt-glow{position:absolute;width:min(560px,90vw);aspect-ratio:1;border-radius:50%;
      background:radial-gradient(circle,#8B5CF633,transparent 62%);filter:blur(10px)}
    .mnt-card{position:relative;width:min(460px,100%);padding:38px 30px;text-align:center;
      border:1px solid #251B45;border-radius:20px;background:rgba(19,14,36,.86);
      backdrop-filter:blur(8px);box-shadow:0 30px 90px rgba(0,0,0,.55)}
    .mnt-mark{width:54px;height:54px;margin:0 auto 20px;border-radius:14px;position:relative;
      background:linear-gradient(140deg,#A78BFA,#6D28D9);box-shadow:0 0 26px #8b5cf655;
      animation:mntPulse 2.4s ease-in-out infinite}
    .mnt-mark::after{content:"";position:absolute;inset:14px;background:#fff;opacity:.92;
      clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)}
    @keyframes mntPulse{0%,100%{transform:scale(1);box-shadow:0 0 26px #8b5cf655}
      50%{transform:scale(1.06);box-shadow:0 0 40px #8b5cf699}}
    .mnt-card h1{margin:0;font-size:26px;font-weight:700;letter-spacing:.02em;
      text-transform:uppercase;color:#EDE9F7}
    .mnt-tag{margin:8px 0 0;font-size:11px;font-weight:700;letter-spacing:.16em;
      text-transform:uppercase;color:#B794FF}
    .mnt-copy{margin:20px 0 0;color:#A79CC8;font-size:13px;line-height:1.7}
    .mnt-bar{height:4px;margin:26px 0 22px;border-radius:4px;background:#251B45;overflow:hidden}
    .mnt-bar i{display:block;width:38%;height:100%;border-radius:4px;
      background:linear-gradient(90deg,#8B5CF6,#C4B5FD);animation:mntSlide 1.9s ease-in-out infinite}
    @keyframes mntSlide{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}
    .mnt-retry{padding:11px 22px;border:1px solid #31245C;border-radius:10px;background:#181130;
      color:#A79CC8;font:inherit;font-size:12px;font-weight:600;letter-spacing:.05em;
      text-transform:uppercase;cursor:pointer}
    .mnt-retry:hover{background:#1C1436;color:#EDE9F7}
    @media(max-width:420px){.mnt-card{padding:30px 22px}.mnt-card h1{font-size:22px}}
  `;

  document.head.appendChild(style);
}

function renderAdminMaintenanceBanner() {
  const bar = document.createElement('div');

  bar.textContent =
    'Modo manutenção ATIVO — visitantes não conseguem acessar o site.';

  bar.setAttribute(
    'style',
    'position:sticky;top:0;z-index:999;padding:9px 16px;text-align:center;' +
    'background:#2a1016;border-bottom:1px solid #71303b;color:#ff9aaa;' +
    'font-size:12px;font-weight:700;letter-spacing:.04em'
  );

  document.body.prepend(bar);
}

async function checkMaintenance() {
  try {
    const { data, error } = await supabase.rpc('site_status');

    if (error) throw error;

    const status = Array.isArray(data) ? data[0] : data;

    if (!status?.maintenance_mode) return false;

    /* Admin continua navegando, com aviso visível. */
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (profile?.role === 'admin') {
        renderAdminMaintenanceBanner();
        return false;
      }
    }

    renderMaintenanceScreen(status.site_name || 'Echo Arena');
    return true;
  } catch (error) {
    /* Falha na checagem não pode derrubar o site. */
    console.warn('[manutenção] verificação indisponível:', error.message);
    return false;
  }
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

async function bootstrap() {
  if (await checkMaintenance()) return;

  bindEvents();

  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  updateAuthUI();

  supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    updateAuthUI();
  });

  await Promise.all([loadHeroes(), loadBuilds(), loadSiteStats()]);
}

bootstrap().catch((error) => {
  console.error('[Echo Arena]', error);
});
