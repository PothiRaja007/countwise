// P15b: the database refuses a second ACTIVE goal, or a second open learning item, with the same name
// (unique indexes goals_active_name_per_user / learning_open_name_per_user; see supabase/p15_proposed_integrity.sql).
// This turns that refusal into a plain sentence. Any other error returns null, so the caller keeps its own message.
const INDEX_BY_KIND = { goal: 'goals_active_name_per_user', learning: 'learning_open_name_per_user' }
const TEXT_BY_KIND = {
  goal: 'You already have an active goal with this name. Choose a different name, or archive the old one first.',
  learning: 'You already have an open learning item with this name. Choose a different name, or mark the old one completed first.',
}

export function duplicateNameMessage(error, kind) {
  if (!error || !INDEX_BY_KIND[kind]) return null
  const text = `${error.message || ''} ${error.details || ''}`
  if (error.code === '23505' && text.includes(INDEX_BY_KIND[kind])) return TEXT_BY_KIND[kind]
  return null
}
