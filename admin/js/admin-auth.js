import { supabase } from '../../js/supabase.js';

async function getAdminProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,role_id,roles(name)')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

export async function loginAdmin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const profile = await getAdminProfile(data.user.id);
  if (profile?.roles?.name !== 'admin') {
    await supabase.auth.signOut();
    throw new Error('Esta conta não possui acesso administrativo.');
  }

  return data;
}

export async function requireAdmin() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    location.href = './login.html';
    throw new Error('Sem sessão.');
  }

  try {
    const profile = await getAdminProfile(session.user.id);
    if (profile?.roles?.name !== 'admin') throw new Error('Acesso negado.');
    return { session, profile };
  } catch (error) {
    await supabase.auth.signOut();
    location.href = './login.html';
    throw error;
  }
}

export async function redirectIfAdmin(destination) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  try {
    const profile = await getAdminProfile(session.user.id);
    if (profile?.roles?.name === 'admin') location.href = destination;
  } catch (_) {}
}

export async function logoutAdmin() {
  await supabase.auth.signOut();
  location.href = './login.html';
}
