import { supabase } from '../../js/supabase.js';

function getRoleName(profile) {
  const roles = profile?.roles;

  if (Array.isArray(roles)) {
    return roles[0]?.name ?? null;
  }

  return roles?.name ?? null;
}

async function getAdminProfile(userId) {
  if (!userId) {
    throw new Error('Usuário não identificado.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      username,
      display_name,
      role_id,
      roles (
        name
      )
    `)
    .eq('id', userId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function loginAdmin(email, password) {
  const normalizedEmail = String(email ?? '').trim();
  const normalizedPassword = String(password ?? '');

  if (!normalizedEmail || !normalizedPassword) {
    throw new Error('Informe o e-mail e a senha.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: normalizedPassword
  });

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error('Não foi possível identificar o usuário.');
  }

  try {
    const profile = await getAdminProfile(data.user.id);
    const roleName = getRoleName(profile);

    if (roleName !== 'admin') {
      await supabase.auth.signOut();
      throw new Error('Esta conta não possui acesso administrativo.');
    }

    return {
      ...data,
      profile
    };
  } catch (error) {
    await supabase.auth.signOut();
    throw error;
  }
}

export async function requireAdmin() {
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!session?.user) {
    location.replace('./login.html');
    throw new Error('Sem sessão administrativa.');
  }

  try {
    const profile = await getAdminProfile(session.user.id);
    const roleName = getRoleName(profile);

    if (roleName !== 'admin') {
      throw new Error('Esta conta não possui acesso administrativo.');
    }

    return {
      session,
      profile,
      roleName
    };
  } catch (error) {
    console.error('Falha na validação administrativa:', error);

    await supabase.auth.signOut();
    location.replace('./login.html');

    throw error;
  }
}

export async function redirectIfAdmin(destination = './index.html') {
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user) {
    return false;
  }

  try {
    const profile = await getAdminProfile(session.user.id);
    const roleName = getRoleName(profile);

    if (roleName === 'admin') {
      location.replace(destination);
      return true;
    }
  } catch (error) {
    console.error('Não foi possível verificar o administrador:', error);
  }

  return false;
}

export async function logoutAdmin() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Erro ao encerrar sessão:', error);
  }

  location.replace('./login.html');
}

export {
  getAdminProfile,
  getRoleName
};