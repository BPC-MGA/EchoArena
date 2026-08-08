/**
 * Echo Arena — regras numéricas do Bullet Echo.
 *
 * Este módulo não cria "scores". Ele preserva os valores coletados do jogo,
 * aplica apenas os modificadores cadastrados no equipamento/raridade e mantém
 * os cálculos derivados separados dos atributos oficiais.
 */

const ALIASES = {
  damage_per_shot: ['damage_per_shot', 'weapon_damage', 'dano_por_tiro', 'dano_da_arma_por_tiro'],
  health: ['health', 'life', 'hp', 'vida'],
  armor: ['armor', 'armour', 'armor_value', 'armadura', 'valor_de_armadura'],
  max_movement_speed: ['max_movement_speed', 'movement_speed', 'velocidade_maxima'],
  aimed_movement_speed: ['aimed_movement_speed', 'movement_speed_aiming', 'velocidade_ao_mirar'],
  vision_range: ['vision_range', 'visionrange', 'alcance_de_visao'],
  armor_resistance: ['armor_resistance', 'resistencia_de_armadura'],
  penetration_resistance: ['penetration_resistance', 'resistencia_a_perfuracao'],
  armor_penetration: ['armor_penetration', 'weapon_armor_penetration', 'perfuracao_de_armadura'],
  penetration_power: ['penetration_power', 'armor_penetration_power', 'poder_de_perfuracao'],
  health_damage_multiplier: ['health_damage_multiplier', 'modificador_contra_vida'],
  armor_drone_multiplier: ['armor_drone_multiplier', 'modificador_contra_armadura_e_drones'],
  fire_interval: ['fire_interval', 'shots_per_second', 'intervalo_entre_tiros'],
  firepower_summary: ['firepower', 'weapon_firepower', 'poder_de_fogo'],
  armor_break_summary: ['armor_break', 'quebra_de_armadura'],
  fire_rate_summary: ['fire_rate', 'cadencia_de_tiro'],
  ammo_capacity_summary: ['magazine_capacity', 'ammo_capacity', 'capacidade_de_municao_resumo'],
  effective_range_summary: ['effective_range', 'alcance_efetivo'],
  aiming_stability_summary: ['aiming_stability', 'estabilidade_de_mira'],
  reload_time: ['reload_time', 'tempo_de_recarga'],
  magazine_size: ['magazine_size', 'tamanho_do_pente', 'capacidade_de_municao'],
  hip_fire_range: ['hip_fire_range', 'alcance_sem_mira'],
  aimed_range: ['aimed_range', 'weapon_range', 'alcance_com_mira'],
  aim_time: ['aim_time', 'tempo_de_mira'],
  dispersion: ['dispersion', 'weapon_spread', 'dispersao'],
  moving_dispersion: ['moving_dispersion', 'moving_spread_modifier', 'dispersao_em_movimento'],
  aimed_dispersion: ['aimed_dispersion', 'dispersao_com_mira']
};

const aliasToCanonical = new Map();

function slug(value = '') {
  return String(value).replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

for (const [canonical, aliases] of Object.entries(ALIASES)) {
  for (const alias of aliases) aliasToCanonical.set(slug(alias), canonical);
}

export const STAT_DEFINITIONS = {
  damage_per_shot: { nome: 'Dano por tiro', icone: '🚀', cor: '#ff5470' },
  health: { nome: 'Vida', icone: '♥', cor: '#4ade80' },
  armor: { nome: 'Armadura', icone: '🛡', cor: '#5b8def' },
  max_movement_speed: { nome: 'Velocidade máxima', icone: '⚡', cor: '#fbbf24' },
  aimed_movement_speed: { nome: 'Velocidade ao mirar', icone: '♞', cor: '#fbbf24' },
  vision_range: { nome: 'Alcance de visão', icone: '◎', cor: '#a855f7' },
  armor_penetration: { nome: 'Penetração de armadura', icone: '⌖', cor: '#65e8ff', unit: '%' },
  penetration_power: { nome: 'Poder de perfuração', icone: '✦', cor: '#65e8ff' },
  armor_resistance: { nome: 'Resistência à armadura', icone: '♢', cor: '#4ade80', unit: '%' },
  health_damage_multiplier: { nome: 'Multiplicador contra vida', icone: '♥', cor: '#ff5470', prefix: '×', decimals: 2 },
  armor_drone_multiplier: { nome: 'Multiplicador contra armadura', icone: '🛡', cor: '#65e8ff', prefix: '×', decimals: 2 },
  aimed_range: { nome: 'Alcance com mira', icone: '◎', cor: '#a855f7' },
  hip_fire_range: { nome: 'Alcance sem mira', icone: '◎', cor: '#a855f7' },
  reload_time: { nome: 'Tempo de recarga', icone: '↻', cor: '#fbbf24', unit: 's', lowerBetter: true },
  magazine_size: { nome: 'Capacidade de munição', icone: '▣', cor: '#65e8ff' },
  firepower_summary: { nome: 'Poder de fogo (resumo do jogo)', icone: '🚀', cor: '#ff5470' },
  armor_break_summary: { nome: 'Quebra de armadura (resumo)', icone: '✦', cor: '#65e8ff' },
  fire_rate_summary: { nome: 'Cadência (resumo do jogo)', icone: '↯', cor: '#fbbf24' },
  ammo_capacity_summary: { nome: 'Munição (resumo do jogo)', icone: '▣', cor: '#65e8ff' },
  effective_range_summary: { nome: 'Alcance efetivo (resumo)', icone: '◎', cor: '#a855f7' },
  aiming_stability_summary: { nome: 'Estabilidade de mira (resumo)', icone: '⌖', cor: '#5b8def' }
};

export function canonicalKey(key) {
  const normalized = slug(key);
  return aliasToCanonical.get(normalized) || normalized;
}

export function normalizeGameStats(stats = {}) {
  const result = {};
  const priorities = {};
  for (const [key, raw] of Object.entries(stats || {})) {
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const normalizedKey = slug(key);
    const canonical = canonicalKey(key);
    /* Quando o banco contém uma chave canônica e um apelido legado,
       a canônica sempre vence. Isso impede movement_speed=51 de
       sobrescrever max_movement_speed=171 e armor legado de substituir
       armor_value=797. */
    let priority = normalizedKey === canonical ? 100 : 20;
    if (canonical === 'armor' && normalizedKey === 'armor_value') priority = 110;
    if (canonical === 'max_movement_speed' && normalizedKey === 'max_movement_speed') priority = 110;
    if (canonical === 'damage_per_shot' && normalizedKey === 'damage_per_shot') priority = 110;
    if ((priorities[canonical] ?? -1) > priority) continue;
    result[canonical] = value;
    priorities[canonical] = priority;
  }
  return result;
}

const PERCENT_TARGETS = {
  weapon_damage_to_armor_pct: 'armor_drone_multiplier',
  weapon_damage_to_health_pct: 'health_damage_multiplier',
  armor_max_pct: 'armor',
  armor_maximum_pct: 'armor',
  health_max_pct: 'health',
  max_health_pct: 'health',
  movement_speed_pct: 'max_movement_speed',
  aimed_movement_speed_pct: 'aimed_movement_speed',
  reload_time_pct: 'reload_time'
};

const FLAT_TARGETS = {
  weapon_range_franco: 'aimed_range',
  alcance_de_tiro_com_mira_do_heroi: 'aimed_range'
};

/** Aplica os stats exatamente na ordem em que os itens foram equipados. */
export function applyEquipmentStats(baseInput = {}, equipmentStats = []) {
  const base = normalizeGameStats(baseInput);
  const final = { ...base };
  const applied = [];
  const unknown = [];

  for (const source of equipmentStats) {
    for (const [rawKey, rawValue] of Object.entries(source || {})) {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) continue;
      const key = canonicalKey(rawKey);
      const percentTarget = PERCENT_TARGETS[key];
      const flatTarget = FLAT_TARGETS[key];

      if (percentTarget) {
        if (!(percentTarget in final)) {
          unknown.push(`${rawKey} (base ${percentTarget} ausente)`);
          continue;
        }
        const before = Number(final[percentTarget] ?? base[percentTarget] ?? 0);
        // Multiplicadores x1,00 recebem +6% como x1,06. Demais stats
        // recebem a mesma variação percentual sobre o valor já acumulado.
        const after = before * (1 + value / 100);
        final[percentTarget] = after;
        applied.push({ sourceKey: rawKey, target: percentTarget, value, operation: 'percent', before, after });
      } else {
        const target = flatTarget || key;
        if (!(target in final)) {
          unknown.push(`${rawKey} (base ${target} ausente)`);
          continue;
        }
        const before = Number(final[target] ?? 0);
        const after = before + value;
        final[target] = after;
        applied.push({ sourceKey: rawKey, target, value, operation: 'add', before, after });
      }
    }
  }

  return { base, final, applied, unknown: [...new Set(unknown)] };
}

/**
 * Fórmula oficial de distribuição do disparo após o rework de AP.
 * Fonte: https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1543-armor-penetration-rework-how-damage-now-bypasses-armor/
 */
export function calculateShotDistribution(statsInput = {}, targetArmorResistance = 0) {
  const stats = normalizeGameStats(statsInput);
  const damage = Math.max(0, Number(stats.damage_per_shot || 0));
  const ap = Math.max(0, Math.min(100, Number(stats.armor_penetration || 0)));
  const resistance = Math.max(0, Math.min(100, Number(targetArmorResistance || 0)));
  const effectivePenetration = ap * (100 - resistance) / 100;
  const healthShare = effectivePenetration / 100;
  const armorShare = 1 - healthShare;
  const healthMultiplier = Number(stats.health_damage_multiplier);
  const armorMultiplier = Number(stats.armor_drone_multiplier);
  const hasHealthMultiplier = Number.isFinite(healthMultiplier);
  const hasArmorMultiplier = Number.isFinite(armorMultiplier);

  return {
    targetArmorResistance: resistance,
    effectivePenetration,
    healthShare,
    armorShare,
    healthDamage: hasHealthMultiplier ? damage * healthShare * healthMultiplier : null,
    armorDamage: hasArmorMultiplier ? damage * armorShare * armorMultiplier : null,
    complete: Boolean(damage && hasHealthMultiplier && hasArmorMultiplier)
  };
}

export function buildRealStatLines(calculation, limit = 5) {
  const priority = ['damage_per_shot', 'health', 'armor', 'max_movement_speed',
    'armor_penetration', 'vision_range', 'aimed_range', 'penetration_power',
    'health_damage_multiplier', 'armor_drone_multiplier'];
  const changed = Object.keys(calculation.final).filter(key =>
    key in calculation.base && STAT_DEFINITIONS[key] &&
    Math.abs(Number(calculation.final[key]) - Number(calculation.base[key])) > 1e-9
  );
  const available = [...new Set([...changed, ...priority, ...Object.keys(calculation.final)])]
    .filter(key => key in calculation.base && STAT_DEFINITIONS[key]);

  return available.slice(0, limit).map(key => {
    const definition = STAT_DEFINITIONS[key];
    const base = Number(calculation.base[key] || 0);
    const value = Number(calculation.final[key] || 0);
    const difference = value - base;
    const rawDelta = base ? difference / Math.abs(base) * 100 : (value ? 100 : 0);
    const beneficialDelta = definition.lowerBetter ? -rawDelta : rawDelta;
    const scale = Math.max(Math.abs(base), Math.abs(value), 1) * 1.15;
    return {
      key, nome: definition.nome, curto: definition.nome.toUpperCase(),
      icone: definition.icone, cor: definition.cor, unit: definition.unit || '',
      prefix: definition.prefix || '', decimals: definition.decimals ?? 0,
      base, valor: value, difference, delta: rawDelta,
      beneficialDelta, pctBase: Math.abs(base) / scale * 100,
      pct: Math.abs(value) / scale * 100
    };
  });
}
