import { supabase } from './supabaseClient';

// Minimal default accounts so a brand-new user has something real for
// Money Inbox to match against and attach transactions to. No custom
// account-naming UI in this pass — that's reasonable to defer to a later
// settings phase. This only seeds two accounts once, at onboarding.
//
// Returns the created accounts (in insertion order: Wallet, then Bank) so
// the caller can read the Wallet account's id to set as the profile's
// default_account_id.
export async function seedDefaultAccounts(userId) {
  const { data, error } = await supabase
    .from('accounts')
    .insert([
      { user_id: userId, name: 'Wallet', type: 'wallet', is_default: true },
      { user_id: userId, name: 'Bank', type: 'bank', is_default: false },
    ])
    .select();

  if (error) throw error;
  return data;
}
