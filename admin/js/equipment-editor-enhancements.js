import {
  getEquipmentBundle,
  loadEquipmentMeta
} from './equipment-api.js';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeKey(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') {
    return 'Não informado';
  }

  if (typeof value === 'boolean') {
    return value ? 'Ativo' : 'Inativo';
  }

  return String(value);
}

function comparable(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function numericValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function toAttributes(value) {
  if (Array.isArray(value)) {
    return value.map(item => ({
      label: String(item?.label ?? item?.name ?? item?.raw ?? '').trim(),
      value: item?.value ?? ''
    })).filter(item => item.label);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).map(([label, attributeValue]) => ({
      label,
      value: attributeValue
    }));
  }

  return [];
}

function makeDiff(group, label, before, after) {
  const beforeText = comparable(before);
  const afterText = comparable(after);
  const changed = beforeText !== afterText;
  let kind = 'equal';

  if (changed) {
    const beforeNumber = numericValue(before);
    const afterNumber = numericValue(after);

    if (beforeNumber !== null && afterNumber !== null) {
      kind = afterNumber > beforeNumber ? 'increase' : 'decrease';
    } else {
      kind = 'text';
    }
  }

  return {group, label, before, after, changed, kind};
}

function buildComparison(bundle, draft, meta) {
  const equipment = bundle.equipment;
  const selectedSet = meta.sets.find(item =>
    normalizeKey(item.name) === normalizeKey(draft.setName) ||
    normalizeKey(item.slug) === normalizeKey(draft.setName)
  );
  const oldSet = meta.sets.find(item => item.id === equipment.set_id);
  const oldSlot = meta.slots.find(item => item.id === equipment.slot_id);
  const newSlot = meta.slots.find(item =>
    item.id === (draft.slotId || draft.slot_id) ||
    normalizeKey(item.slug) === normalizeKey(draft.slotSlug) ||
    normalizeKey(item.name) === normalizeKey(draft.slotName)
  );
  const preserve = (incoming, current) =>
    incoming === null || incoming === undefined || incoming === ''
      ? current
      : incoming;

  const diffs = [
    makeDiff('Geral', 'Nome', equipment.name, preserve(draft.name, equipment.name)),
    makeDiff('Geral', 'Slug', equipment.slug, preserve(draft.slug, equipment.slug)),
    makeDiff('Geral', 'Slot', oldSlot?.name || equipment.slot_id, newSlot?.name || oldSlot?.name || equipment.slot_id),
    makeDiff('Geral', 'Conjunto', oldSet?.name || 'Sem conjunto', draft.setName ? (selectedSet?.name || draft.setName) : (oldSet?.name || 'Sem conjunto')),
    makeDiff('Geral', 'Descrição', equipment.description, preserve(draft.description, equipment.description)),
    makeDiff('Geral', 'Recomendação', equipment.recommendation, preserve(draft.recommendation, equipment.recommendation)),
    makeDiff('Geral', 'Ordem', equipment.display_order ?? 0, draft.displayOrder ?? equipment.display_order ?? 0),
    makeDiff('Geral', 'Publicação', equipment.enabled !== false, draft.enabled ?? (equipment.enabled !== false))
  ];

  const oldVariants = new Map(
    bundle.variants.map(row => [row.equipment_rarities?.slug, toAttributes(row.attributes)])
  );

  for (const rarity of meta.rarities) {
    if (!Object.prototype.hasOwnProperty.call(draft.variants || {}, rarity.slug)) continue;
    const oldAttributes = oldVariants.get(rarity.slug) || [];
    const newAttributes = toAttributes(draft.variants[rarity.slug]);
    const oldMap = new Map(oldAttributes.map(item => [normalizeKey(item.label), item]));
    const newMap = new Map(newAttributes.map(item => [normalizeKey(item.label), item]));
    const keys = new Set([...oldMap.keys(), ...newMap.keys()]);

    for (const key of keys) {
      const oldAttribute = oldMap.get(key);
      const newAttribute = newMap.get(key);
      diffs.push(makeDiff(
        `Raridade · ${rarity.name || rarity.slug}`,
        newAttribute?.label || oldAttribute?.label || key,
        oldAttribute?.value,
        newAttribute?.value
      ));
    }
  }

  const oldBonuses = new Map(bundle.bonuses.map(item => [Number(item.required_pieces), item]));
  const newBonuses = new Map((draft.bonuses || []).map(item => [Number(item.required_pieces), item]));
  const bonusKeys = new Set([...oldBonuses.keys(), ...newBonuses.keys()]);

  for (const pieces of bonusKeys) {
    const oldBonus = oldBonuses.get(pieces);
    const newBonus = newBonuses.get(pieces);
    diffs.push(makeDiff(
      'Bônus do conjunto',
      `${pieces} equipamentos`,
      oldBonus?.description,
      newBonus?.description
    ));
  }

  return diffs;
}

function renderComparison(host, diffs) {
  const changed = diffs.filter(item => item.changed);
  const counts = {
    increase: diffs.filter(item => item.kind === 'increase').length,
    decrease: diffs.filter(item => item.kind === 'decrease').length,
    text: diffs.filter(item => item.kind === 'text').length,
    equal: diffs.filter(item => item.kind === 'equal').length
  };
  const groups = [...new Set(changed.map(item => item.group))];
  const rows = groups.map(group => `
    <section class="equipment-change-group">
      <h4>${escapeHtml(group)}</h4>
      ${changed.filter(item => item.group === group).map(item => {
        const beforeNumber = numericValue(item.before);
        const afterNumber = numericValue(item.after);
        const largeChange = beforeNumber !== null && afterNumber !== null && beforeNumber !== 0 && Math.abs((afterNumber - beforeNumber) / beforeNumber) >= .8;
        return `<div class="equipment-change-row">
          <strong>${escapeHtml(item.label)}${largeChange ? ' · ⚠ alteração superior a 80%' : ''}</strong>
          <div class="equipment-change-values">
            <span class="equipment-change-before"><small>ANTES</small><br>${escapeHtml(displayValue(item.before))}</span>
            <span class="equipment-change-arrow">→</span>
            <span class="equipment-change-after"><small>AGORA</small><br>${escapeHtml(displayValue(item.after))}</span>
          </div>
        </div>`;
      }).join('')}
    </section>
  `).join('');

  host.innerHTML = `
    <div class="equipment-change-head">
      <div><h3>Comparação com o equipamento cadastrado</h3><p>Somente os campos diferentes são exibidos abaixo.</p></div>
    </div>
    <div class="equipment-change-summary">
      <div class="equipment-change-stat"><strong>${changed.length}</strong><small>alterações</small></div>
      <div class="equipment-change-stat"><strong>${counts.increase}</strong><small>aumentos</small></div>
      <div class="equipment-change-stat"><strong>${counts.decrease}</strong><small>reduções</small></div>
      <div class="equipment-change-stat"><strong>${counts.text}</strong><small>textos modificados</small></div>
      <div class="equipment-change-stat"><strong>${counts.equal}</strong><small>campos iguais</small></div>
    </div>
    ${changed.length ? rows : '<div class="equipment-change-empty"><strong>Nenhuma alteração encontrada</strong><br>Os dados importados são idênticos aos já cadastrados.</div>'}
  `;
  host.classList.add('is-visible');
}

async function initComparison(params, importedDraft) {
  const host = document.getElementById('equipment-change-review');
  const equipmentId = params.get('id');
  if (!host || !equipmentId || !importedDraft) return;

  try {
    const [bundle, meta] = await Promise.all([
      getEquipmentBundle(equipmentId),
      loadEquipmentMeta()
    ]);
    renderComparison(host, buildComparison(bundle, importedDraft, meta));
  } catch (error) {
    console.error('Erro ao comparar equipamento:', error);
    host.innerHTML = '<div class="equipment-change-empty">Não foi possível carregar a comparação. Os dados do formulário continuam disponíveis para revisão.</div>';
    host.classList.add('is-visible');
  }
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível preparar o recorte da imagem.'));
    };
    image.src = url;
  });
}

function canvasBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem enquadrada.')), type, .92);
  });
}

function initImageCrop() {
  const form = document.getElementById('form');
  const fileInput = document.getElementById('image-file');
  const cardPreview = document.getElementById('preview-image');
  const fullPreview = document.getElementById('preview-full-image');
  const zoom = document.getElementById('equipment-crop-zoom');
  const positionX = document.getElementById('equipment-crop-x');
  const positionY = document.getElementById('equipment-crop-y');
  const zoomValue = document.getElementById('equipment-crop-zoom-value');
  const xValue = document.getElementById('equipment-crop-x-value');
  const yValue = document.getElementById('equipment-crop-y-value');
  const reset = document.getElementById('equipment-crop-reset');
  const status = document.getElementById('equipment-crop-status');
  if (!form || !fileInput || !cardPreview || !fullPreview) return;

  let submittingCroppedFile = false;

  const syncFullPreview = () => {
    const sourceImage = cardPreview.querySelector('img');
    if (!sourceImage?.src) return;
    const current = fullPreview.querySelector('img');
    if (current?.src === sourceImage.src) return;
    const image = document.createElement('img');
    image.src = sourceImage.src;
    image.alt = 'Imagem completa do equipamento';
    fullPreview.replaceChildren(image);
  };

  const applyPreviewTransform = () => {
    const image = cardPreview.querySelector('img');
    const zoomNumber = Number(zoom?.value || 100);
    const xNumber = Number(positionX?.value || 0);
    const yNumber = Number(positionY?.value || 0);
    if (image) image.style.transform = `translate(${xNumber}%, ${yNumber}%) scale(${zoomNumber / 100})`;
    if (zoomValue) zoomValue.value = `${zoomNumber}%`;
    if (xValue) xValue.value = String(xNumber);
    if (yValue) yValue.value = String(yNumber);
    if (status) status.textContent = fileInput.files?.[0]
      ? 'Este enquadramento será aplicado ao arquivo salvo.'
      : 'Selecione uma nova imagem para aplicar o enquadramento.';
  };

  new MutationObserver(() => {
    syncFullPreview();
    applyPreviewTransform();
  }).observe(cardPreview, {childList: true, subtree: true, attributes: true, attributeFilter: ['src']});

  [zoom, positionX, positionY].forEach(control => control?.addEventListener('input', applyPreviewTransform));
  fileInput.addEventListener('change', () => {
    if (zoom) zoom.value = '100';
    if (positionX) positionX.value = '0';
    if (positionY) positionY.value = '0';
    window.setTimeout(applyPreviewTransform, 0);
  });
  reset?.addEventListener('click', () => {
    if (zoom) zoom.value = '100';
    if (positionX) positionX.value = '0';
    if (positionY) positionY.value = '0';
    applyPreviewTransform();
  });

  form.addEventListener('submit', async event => {
    const file = fileInput.files?.[0];
    if (submittingCroppedFile || !file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const submitter = event.submitter;
    if (status) status.textContent = 'Aplicando enquadramento...';

    try {
      const image = await loadImageFile(file);
      const size = 1000;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      const zoomScale = Number(zoom?.value || 100) / 100;
      const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoomScale;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const x = (size - width) / 2 + (Number(positionX?.value || 0) / 100) * width;
      const y = (size - height) / 2 + (Number(positionY?.value || 0) / 100) * height;
      context.drawImage(image, x, y, width, height);
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/webp';
      const blob = await canvasBlob(canvas, outputType);
      const extension = outputType === 'image/png' ? 'png' : 'webp';
      const croppedFile = new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-enquadrada.${extension}`, {type: outputType});
      const transfer = new DataTransfer();
      transfer.items.add(croppedFile);
      fileInput.files = transfer.files;
      submittingCroppedFile = true;
      if (status) status.textContent = 'Enquadramento aplicado.';
      form.requestSubmit(submitter || undefined);
    } catch (error) {
      console.error('Erro ao enquadrar imagem:', error);
      if (status) status.textContent = error.message || 'Não foi possível aplicar o enquadramento.';
      window.alert(error.message || 'Não foi possível aplicar o enquadramento da imagem.');
    }
  }, true);

  syncFullPreview();
  applyPreviewTransform();
}

export async function initEquipmentEditorEnhancements({params, importedDraft}) {
  await initComparison(params, importedDraft);
  initImageCrop();
}
