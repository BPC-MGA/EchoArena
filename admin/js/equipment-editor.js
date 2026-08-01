
import { requireAdmin, logoutAdmin } from './admin-auth.js';
import { loadEquipmentMeta, getEquipmentBundle, saveEquipmentBundle, upsertSet } from './equipment-api.js';
import { uploadEquipmentImage, publicMediaUrl } from './equipment-media.js';

await requireAdmin();
document.getElementById('logout').onclick = logoutAdmin;

const params = new URLSearchParams(location.search);
const equipmentId = params.get('id');
const imported = sessionStorage.getItem('equipment-import-draft');
const draft = imported ? JSON.parse(imported) : null;
if (imported) sessionStorage.removeItem('equipment-import-draft');

const form = document.getElementById('form');
const message = document.getElementById('message');
const rarityHost = document.getElementById('rarities');
const bonusHost = document.getElementById('bonuses');
let meta;
let currentBundle = null;

const slugify = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

function addAttrRow(host, value={label:'',value:'',unit:''}) {
  const row = document.createElement('div');
  row.className = 'attr-row';
  row.innerHTML = `<input placeholder="Atributo" value="${value.label || value.raw || ''}"><input placeholder="Valor" value="${value.value ?? ''}"><button type="button" class="eq-btn danger">×</button>`;
  row.querySelector('button').onclick = () => row.remove();
  host.appendChild(row);
}

function renderRarities(values={}) {
  rarityHost.innerHTML = '';
  for (const rarity of meta.rarities) {
    const card = document.createElement('article');
    card.className = 'rarity-card';
    card.dataset.rarityId = rarity.id;
    card.innerHTML = `<div class="rarity-head"><span class="rarity-title" style="color:${rarity.color}">${rarity.name}</span><button type="button" class="eq-btn">Adicionar atributo</button></div><div class="attrs"></div>`;
    const attrs = card.querySelector('.attrs');
    const current = values[rarity.slug] || [];
    if (!current.length) addAttrRow(attrs);
    current.forEach(item => addAttrRow(attrs, item));
    card.querySelector('button').onclick = () => addAttrRow(attrs);
    rarityHost.appendChild(card);
  }
}

function addBonusRow(value={required_pieces:2,title:'',description:''}) {
  const row = document.createElement('div');
  row.className = 'set-bonus-row';
  row.innerHTML = `<input type="number" min="1" value="${value.required_pieces || 2}"><input placeholder="Título" value="${value.title || ''}"><input placeholder="Descrição" value="${value.description || ''}"><button type="button" class="eq-btn danger">×</button>`;
  row.querySelector('button').onclick = () => row.remove();
  bonusHost.appendChild(row);
}

function fillFromDraft(d) {
  if (!d) return;
  document.getElementById('name').value = d.name || '';
  document.getElementById('slug').value = slugify(d.name || '');
  document.getElementById('description').value = d.description || '';
  document.getElementById('recommendation').value = d.recommendation || '';
  document.getElementById('new-set-name').value = d.setName || '';
  renderRarities(d.variants || {});
  bonusHost.innerHTML = '';
  (d.bonuses || []).forEach(addBonusRow);
}

function fillExisting(bundle) {
  const e = bundle.equipment;
  document.getElementById('page-title').textContent = 'Editar equipamento';
  document.getElementById('name').value = e.name || '';
  document.getElementById('slug').value = e.slug || '';
  document.getElementById('slot-id').value = e.slot_id || '';
  document.getElementById('set-id').value = e.set_id || '';
  document.getElementById('display-order').value = e.display_order || 0;
  document.getElementById('description').value = e.description || '';
  document.getElementById('recommendation').value = e.recommendation || '';
  document.getElementById('enabled').checked = e.enabled !== false;
  if (e.image_path) document.getElementById('preview-image').innerHTML = `<img src="${publicMediaUrl(e.image_path)}" alt="">`;

  const variantMap = {};
  for (const v of bundle.variants) variantMap[v.equipment_rarities.slug] = v.attributes || [];
  renderRarities(variantMap);
  bonusHost.innerHTML = '';
  bundle.bonuses.forEach(addBonusRow);
}

document.getElementById('name').oninput = e => {
  if (!equipmentId) document.getElementById('slug').value = slugify(e.target.value);
};
document.getElementById('image-file').onchange = e => {
  const file = e.target.files?.[0];
  if (file) document.getElementById('preview-image').innerHTML = `<img src="${URL.createObjectURL(file)}" alt="">`;
};
document.getElementById('add-bonus').onclick = () => addBonusRow();

form.onsubmit = async event => {
  event.preventDefault();
  message.textContent = 'Salvando...';

  try {
    let setId = document.getElementById('set-id').value || null;
    const newSetName = document.getElementById('new-set-name').value.trim();
    if (newSetName) {
      const set = await upsertSet({ name:newSetName, slug:slugify(newSetName), description:'' });
      setId = set.id;
    }

    const imageFile = document.getElementById('image-file').files?.[0];
    const imagePath = imageFile
      ? await uploadEquipmentImage(imageFile)
      : currentBundle?.equipment.image_path || null;

    const variants = [...rarityHost.querySelectorAll('.rarity-card')].map(card => ({
      rarity_id: card.dataset.rarityId,
      attributes: [...card.querySelectorAll('.attr-row')].map(row => {
        const inputs = row.querySelectorAll('input');
        return { label: inputs[0].value.trim(), value: inputs[1].value.trim() };
      }).filter(x => x.label)
    }));

    const bonuses = [...bonusHost.querySelectorAll('.set-bonus-row')].map((row,index) => {
      const inputs = row.querySelectorAll('input');
      return {
        required_pieces:Number(inputs[0].value),
        title:inputs[1].value.trim(),
        description:inputs[2].value.trim(),
        attributes:[],
        display_order:index+1
      };
    }).filter(x => x.title && x.description);

    await saveEquipmentBundle({
      equipmentId,
      equipment:{
        name:document.getElementById('name').value.trim(),
        slug:document.getElementById('slug').value.trim(),
        slot_id:document.getElementById('slot-id').value || null,
        set_id:setId,
        description:document.getElementById('description').value.trim(),
        recommendation:document.getElementById('recommendation').value.trim(),
        image_path:imagePath,
        enabled:document.getElementById('enabled').checked,
        display_order:Number(document.getElementById('display-order').value || 0)
      },
      variants, bonuses
    });

    message.textContent = 'Equipamento salvo.';
    message.className = 'eq-message ok';
    setTimeout(() => location.href='./equipments.html',700);
  } catch (error) {
    message.textContent = error.message;
    message.className = 'eq-message error';
  }
};

meta = await loadEquipmentMeta();
document.getElementById('slot-id').innerHTML += meta.slots.map(x => `<option value="${x.id}">${x.name}</option>`).join('');
document.getElementById('set-id').innerHTML += meta.sets.map(x => `<option value="${x.id}">${x.name}</option>`).join('');
renderRarities();
addBonusRow();

if (equipmentId) {
  currentBundle = await getEquipmentBundle(equipmentId);
  fillExisting(currentBundle);
} else if (draft) {
  fillFromDraft(draft);
}
