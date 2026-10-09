// P12 test stand-in for lib/AuthContext.jsx: a fixed signed-in test user. No password, no network.
// The theme comes from window.__E2E.theme, set by the test before the page loads.
const user = { id: 'u1', email: 'test.user@example.invalid' }
const session = { user }
const profile = () => ({
  id: 'u1', username: 'Tester', onboarding_complete: true, income_type: 'salaried', employee_subtype: null,
  dark_mode: globalThis.__E2E?.theme === 'dark',
})
let cached = null
export function AuthProvider({ children }) { return children }
export function useAuth() {
  cached = cached || { session, user, profile: profile(), loading: false, refreshProfile: async () => {}, signOut: async () => {}, passwordRecovery: false, clearPasswordRecovery: () => {} }
  return cached
}
