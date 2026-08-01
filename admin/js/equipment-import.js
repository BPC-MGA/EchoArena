
import { requireAdmin, logoutAdmin } from './admin-auth.js';
import { parseEquipmentText } from './equipment-ocr-parser.js';

await requireAdmin();
document.getElementById('logout').onclick = logoutAdmin;

const fileInput = document.getElementById('screenshot');
const zone = document.getElementById('dropzone');
const raw = document.getElementById('raw-text');
const status = document.getElementById('ocr-status');
const reviewArea = document.getElementById('review-area');
const send = document.getElementById('send-editor');
let parsed = null;

fileInput.onchange = () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  zone.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="">`;
};

document.getElementById('extract').onclick = async () => {
  const file = fileInput.files?.[0];
  if (!file) return alert('Selecione um print.');

  status.textContent = 'Iniciando OCR...';
  try {
    const result = await Tesseract.recognize(file, 'por', {
      logger: m => {
        if (m.status === 'recognizing text') {
          status.textContent = `Lendo texto: ${Math.round((m.progress || 0)*100)}%`;
        } else {
          status.textContent = m.status;
        }
      }
    });
    raw.value = result.data.text || '';
    status.textContent = 'Texto extraído. Agora monte a revisão.';
  } catch (error) {
    status.textContent = `Falha no OCR: ${error.message}`;
  }
};

function renderReview(data) {
  reviewArea.innerHTML = `
    <div class="review-card">
      <h3>Identificação</h3>
      <label>Nome<input id="r-name" value="${data.name || ''}"></label>
      <label>Conjunto<input id="r-set" value="${data.setName || ''}"></label>
      <label>Descrição<textarea id="r-desc" rows="3">${data.description || ''}</textarea></label>
      <label>Recomendação<textarea id="r-rec" rows="3">${data.recommendation || ''}</textarea></label>
    </div>
    <div class="review-card">
      <h3>Raridades reconhecidas</h3>
      <div id="r-variants"></div>
    </div>
    <div class="review-card">
      <h3>Bônus reconhecidos</h3>
      <div id="r-bonuses"></div>
    </div>`;

  const variants = document.getElementById('r-variants');
  for (const [rarity, attrs] of Object.entries(data.variants || {})) {
    const card = document.createElement('div');
    card.className='rarity-card';
    card.dataset.rarity=rarity;
    card.innerHTML=`<strong>${rarity}</strong><textarea rows="4">${attrs.map(a=>a.raw || a.label).join('\n')}</textarea>`;
    variants.appendChild(card);
  }

  const bonuses = document.getElementById('r-bonuses');
  (data.bonuses || []).forEach(b => {
    const row=document.createElement('div');
    row.className='set-bonus-row';
    row.innerHTML=`<input type="number" value="${b.required_pieces}"><input value="${b.title}"><input value="${b.description}"><span></span>`;
    bonuses.appendChild(row);
  });

  send.disabled=false;
}

document.getElementById('review').onclick = () => {
  parsed = parseEquipmentText(raw.value);
  renderReview(parsed);
};

send.onclick = () => {
  if (!parsed) return;

  const variants = {};
  reviewArea.querySelectorAll('#r-variants .rarity-card').forEach(card => {
    variants[card.dataset.rarity] = card.querySelector('textarea').value
      .split('\n').map(x=>x.trim()).filter(Boolean)
      .map((line,index)=>({ label:line, value:'', raw:line }));
  });

  const bonuses = [...reviewArea.querySelectorAll('#r-bonuses .set-bonus-row')].map(row => {
    const inputs=row.querySelectorAll('input');
    return { required_pieces:Number(inputs[0].value), title:inputs[1].value, description:inputs[2].value };
  });

  const draft = {
    name:document.getElementById('r-name').value.trim(),
    setName:document.getElementById('r-set').value.trim(),
    description:document.getElementById('r-desc').value.trim(),
    recommendation:document.getElementById('r-rec').value.trim(),
    variants, bonuses
  };

  sessionStorage.setItem('equipment-import-draft', JSON.stringify(draft));
  location.href='./equipment-editor.html?import=1';
};
