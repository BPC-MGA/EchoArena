import { requireAdmin, logoutAdmin } from './admin-auth.js';
import { listHeroClasses, getHero, createHero, updateHero } from './api.js';
import { uploadGameMedia, getPublicMediaUrl } from './admin-media.js';

await requireAdmin();
document.getElementById('logout').onclick = logoutAdmin;

const params = new URLSearchParams(location.search);
const heroId = params.get('id');
const form = document.getElementById('hero-form');
const message = document.getElementById('message');

let currentHero = null;

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function previewFile(input, target) {
  const file = input.files?.[0];
  if (!file) return;
  target.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="">`;
}

async function loadClasses() {
  const classes = await listHeroClasses();
  const select = document.getElementById('class-id');
  select.innerHTML = '<option value="">Sem classe</option>' +
    classes.map(item => `<option value="${item.id}">${item.name}</option>`).join('');
}

function fill(hero) {
  document.getElementById('name').value = hero.name ?? '';
  document.getElementById('slug').value = hero.slug ?? '';
  document.getElementById('class-id').value = hero.class_id ?? '';
  document.getElementById('display-order').value = hero.display_order ?? 0;
  document.getElementById('description').value = hero.description ?? '';
  document.getElementById('image-fit').value = hero.image_fit ?? 'contain';
  document.getElementById('image-position').value = hero.image_position ?? '50% 50%';
  document.getElementById('image-scale').value = hero.image_scale ?? 1;
  document.getElementById('image-offset-x').value = hero.image_offset_x ?? 0;
  document.getElementById('image-offset-y').value = hero.image_offset_y ?? 0;
  document.getElementById('enabled').checked = hero.enabled !== false;

  const previews = [
    ['preview-image', hero.image_path],
    ['preview-card', hero.card_image_path],
    ['preview-gif', hero.gif_path]
  ];

  for (const [id, path] of previews) {
    if (path) document.getElementById(id).innerHTML = `<img src="${getPublicMediaUrl(path)}" alt="">`;
  }
}

document.getElementById('name').addEventListener('input', event => {
  if (!heroId) document.getElementById('slug').value = slugify(event.target.value);
});

document.getElementById('image-file').onchange = event =>
  previewFile(event.target, document.getElementById('preview-image'));

document.getElementById('card-file').onchange = event =>
  previewFile(event.target, document.getElementById('preview-card'));

document.getElementById('gif-file').onchange = event =>
  previewFile(event.target, document.getElementById('preview-gif'));

form.addEventListener('submit', async event => {
  event.preventDefault();
  message.textContent = 'Salvando...';
  message.className = 'message';

  try {
    const imageFile = document.getElementById('image-file').files?.[0];
    const cardFile = document.getElementById('card-file').files?.[0];
    const gifFile = document.getElementById('gif-file').files?.[0];

    const [imagePath, cardPath, gifPath] = await Promise.all([
      imageFile ? uploadGameMedia(imageFile, 'Heros/Images') : currentHero?.image_path ?? null,
      cardFile ? uploadGameMedia(cardFile, 'Heros/Cards') : currentHero?.card_image_path ?? null,
      gifFile ? uploadGameMedia(gifFile, 'Heros/GIF') : currentHero?.gif_path ?? null
    ]);

    const values = {
      name: document.getElementById('name').value.trim(),
      slug: document.getElementById('slug').value.trim(),
      class_id: document.getElementById('class-id').value || null,
      display_order: Number(document.getElementById('display-order').value || 0),
      description: document.getElementById('description').value.trim(),
      image_path: imagePath,
      card_image_path: cardPath,
      gif_path: gifPath,
      image_fit: document.getElementById('image-fit').value,
      image_position: document.getElementById('image-position').value.trim() || '50% 50%',
      image_scale: Number(document.getElementById('image-scale').value || 1),
      image_offset_x: Number(document.getElementById('image-offset-x').value || 0),
      image_offset_y: Number(document.getElementById('image-offset-y').value || 0),
      enabled: document.getElementById('enabled').checked
    };

    if (!values.name || !values.slug) throw new Error('Nome e slug são obrigatórios.');

    currentHero = heroId
      ? await updateHero(heroId, values)
      : await createHero(values);

    message.textContent = 'Herói salvo com sucesso.';
    message.className = 'message ok';

    setTimeout(() => location.href = './heroes.html', 700);
  } catch (error) {
    message.textContent = error.message;
    message.className = 'message error';
  }
});

await loadClasses();

if (heroId) {
  document.getElementById('page-title').textContent = 'Editar herói';
  currentHero = await getHero(heroId);
  fill(currentHero);
}
