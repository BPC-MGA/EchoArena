import { supabase } from '../../js/supabase.js';

/* =========================================================
   METADADOS DOS EQUIPAMENTOS
========================================================= */

export async function loadEquipmentMeta() {
  const [
    rarities,
    slots,
    sets
  ] = await Promise.all([
    supabase
      .from('equipment_rarities')
      .select('*')
      .order('rank'),

    supabase
      .from('equipment_slots')
      .select('*')
      .order('display_order'),

    supabase
      .from('equipment_sets')
      .select('*')
      .order('name')
  ]);

  if (rarities.error) {
    throw rarities.error;
  }

  if (slots.error) {
    throw slots.error;
  }

  if (sets.error) {
    throw sets.error;
  }

  return {
    rarities: rarities.data || [],
    slots: slots.data || [],
    sets: sets.data || []
  };
}

/* =========================================================
   LISTAGEM
========================================================= */

export async function listEquipments() {
  const {
    data,
    error
  } = await supabase
    .from('equipments')
    .select(`
      *,
      equipment_sets(
        name,
        slug
      ),
      equipment_slots(
        name,
        slug
      )
    `)
    .order('display_order')
    .order('name');

  if (error) {
    throw error;
  }

  return data || [];
}

/* =========================================================
   EQUIPAMENTO COMPLETO
========================================================= */

export async function getEquipmentBundle(id) {
  const [
    equipment,
    variants
  ] = await Promise.all([
    supabase
      .from('equipments')
      .select('*')
      .eq('id', id)
      .single(),

    supabase
      .from('equipment_variants')
      .select(`
        *,
        equipment_rarities(*)
      `)
      .eq('equipment_id', id)
  ]);

  if (equipment.error) {
    throw equipment.error;
  }

  if (variants.error) {
    throw variants.error;
  }

  let bonuses = {
    data: []
  };

  if (equipment.data.set_id) {
    bonuses = await supabase
      .from('equipment_set_bonuses')
      .select('*')
      .eq(
        'set_id',
        equipment.data.set_id
      )
      .order('display_order');

    if (bonuses.error) {
      throw bonuses.error;
    }
  }

  return {
    equipment: equipment.data,
    variants: variants.data || [],
    bonuses: bonuses.data || []
  };
}

/* =========================================================
   CONJUNTOS
========================================================= */

export async function upsertSet({
  id,
  name,
  slug,
  description
}) {
  const payload = {
    name,
    slug,
    description
  };

  if (id) {
    payload.id = id;
  }

  const {
    data,
    error
  } = await supabase
    .from('equipment_sets')
    .upsert(
      payload,
      {
        onConflict: 'slug'
      }
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/* =========================================================
   SALVAMENTO COMPLETO
========================================================= */

export async function saveEquipmentBundle({
  equipmentId,
  equipment,
  variants,
  bonuses
}) {
  const equipmentQuery =
    equipmentId
      ? supabase
          .from('equipments')
          .update(equipment)
          .eq('id', equipmentId)
      : supabase
          .from('equipments')
          .insert(equipment);

  const {
    data: saved,
    error
  } = await equipmentQuery
    .select()
    .single();

  if (error) {
    throw error;
  }

  const equipmentIdSaved =
    saved.id;

  /* =======================================================
     SALVAR RARIDADES E ATRIBUTOS
  ======================================================= */

  for (const variant of variants) {
    const {
      error: variantError
    } = await supabase
      .from('equipment_variants')
      .upsert(
        {
          equipment_id:
            equipmentIdSaved,

          rarity_id:
            variant.rarity_id,

          attributes:
            variant.attributes
        },
        {
          onConflict:
            'equipment_id,rarity_id'
        }
      );

    if (variantError) {
      throw variantError;
    }
  }

  /* =======================================================
     SALVAR BÔNUS DO CONJUNTO

     A tabela equipment_set_bonuses não possui a coluna
     "attributes". Por isso, salvamos apenas os campos que
     realmente existem no banco.
  ======================================================= */

  if (saved.set_id) {
    for (const bonus of bonuses) {
      const {
        error: bonusError
      } = await supabase
        .from('equipment_set_bonuses')
        .upsert(
          {
            set_id:
              saved.set_id,

            required_pieces:
              Number(
                bonus.required_pieces
              ),

            title:
              bonus.title,

            description:
              bonus.description,

            display_order:
              bonus.display_order || 0
          },
          {
            onConflict:
              'set_id,required_pieces,title'
          }
        );

      if (bonusError) {
        throw bonusError;
      }
    }
  }

  return saved;
}

/* =========================================================
   EXCLUSÃO
========================================================= */

export async function deleteEquipment(id) {
  const {
    error
  } = await supabase
    .from('equipments')
    .delete()
    .eq('id', id);

  if (error) {
    throw error;
  }
}
