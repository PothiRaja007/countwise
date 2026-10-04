// Phase 41 - catches the browser's "install this app" event.
//
// Imported once from main.jsx so it is listening from the first moment: the
// browser can fire beforeinstallprompt BEFORE the Install page is on screen.
// The app is already an installable PWA (vite-plugin-pwa); this file only
// lets our own page offer the install, honestly:
//   - canPrompt() is true ONLY if the browser really handed us an install prompt
//   - "installed" is true ONLY after the browser's own appinstalled event
import { useSyncExternalStore } from 'react'

let deferredPrompt = null
let installedEvent = false
let version = 0
const listeners = new Set()

function emit() {
  version += 1
  listeners.forEach((l) => l())
}

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true // iOS Safari home-screen apps
  )
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault() // hold it so OUR button can trigger it later
    deferredPrompt = event
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installedEvent = true
    deferredPrompt = null
    emit()
  })
}

export const canPrompt = () => deferredPrompt !== null
export const hasInstalledEvent = () => installedEvent

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Result: 'accepted' | 'dismissed' | 'unavailable'
export async function promptInstall() {
  if (!deferredPrompt) return { outcome: 'unavailable' }
  const event = deferredPrompt
  deferredPrompt = null // an install event can be used only once
  emit()
  try {
    await event.prompt()
    const choice = await event.userChoice
    return { outcome: choice.outcome === 'accepted' ? 'accepted' : 'dismissed' }
  } catch {
    return { outcome: 'unavailable' }
  }
}

export function useInstallState() {
  useSyncExternalStore(subscribe, () => version, () => 0)
  return {
    canPrompt: canPrompt(),
    installed: hasInstalledEvent(),
    standalone: isStandalone(),
  }
}
