
import { requireAdmin, logoutAdmin } from './admin-auth.js';
import { listEquipments, deleteEquipment } from './equipment-api.js';
import { publicMediaUrl } from './equipment-media.js';

await requireAdmin();
document.getElementById('logout').onclick = logoutAdmin;

const list = document.getElementById('equipment-list');
const search = document.getElementById('search');
const message = document.getElementById('message');
let equipments = [];

function render() {
  const q = search.value.trim().toLowerCase();
  const rows = equipments.filter(item => !q || item.name.toLowerCase().includes(q));
  list.innerHTML = rows.map(item => `
    <article class="eq-card">
      <div class="pic">${item.image_path ? `<img src="${publicMediaUrl(item.image_path)}" alt="">` : 'Sem imagem'}</div>
      <div class="body">
        <h3>${item.name}</h3>
        <div class="eq-muted">${item.equipment_sets?.name || 'Sem conjunto'} · ${item.equipment_slots?.name || 'Sem slot'}</div>
        <div class="eq-actions" style="margin-top:12px">
          <a class="eq-btn" href="./equipment-editor.html?id=${item.id}">Editar</a>
          <button class="eq-btn danger" data-delete="${item.id}">Excluir</button>
        </div>
      </div>
    </article>`).join('') || '<div class="eq-message">Nenhum equipamento encontrado.</div>';

  list.querySelectorAll('[data-delete]').forEach(button => {
    button.onclick = async () => {
      const item = equipments.find(x => x.id === button.dataset.delete);
      if (!item || !confirm(`Excluir ${item.name}?`)) return;
      try { await deleteEquipment(item.id); await load(); }
      catch (error) { message.textContent = error.message; message.className='eq-message error'; }
    };
  });
}

async function load() {
  try { equipments = await listEquipments(); render(); }
  catch (error) { message.textContent = error.message; message.className='eq-message error'; }
}
search.oninput = render;
await load();
