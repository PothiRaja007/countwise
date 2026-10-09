import { useState } from 'react'
import Button from './ui/Button.jsx'
import { getNativeDownload, detectOS } from '../lib/platforms.js'
import { promptInstall, useInstallState } from '../lib/installPrompt.js'

// Phase 41 - the two honest building blocks shared by the Install page
// (InstallAccess, cards) and the in-app page (InstallInApp, one selected panel).
//
// HONESTY RULES (do not weaken):
//  - What can really be installed today is the CountWise WEB APP (PWA), on the device
//    you are using. Nothing here says "download for Windows".
//  - A native app is plain text "Not yet available" - never a button or link - unless
//    lib/platforms.js has a real https URL and version for it.
//  - An install button appears only if the browser has really offered an install.

const IOS_STEPS = [
  'Open this page in Safari.',
  'Tap the Share button.',
  'Choose Add to Home Screen, then tap Add.',
]

// Which device is the visitor on right now?
export function currentOS() {
  if (typeof navigator === 'undefined') return 'other'
  return detectOS({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints || 0 })
}

// The "web app" half of one platform. `onInstalled('pwa' | 'ios')` is called only when
// the browser really accepted the install, or the visitor says they finished the iPhone steps.
export function WebInstall({ platform, deviceOs, onInstalled }) {
  const { canPrompt, installed, standalone } = useInstallState()
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)

  const handleInstall = async () => {
    setNote(null)
    setBusy(true)
    const { outcome } = await promptInstall()
    setBusy(false)
    if (outcome === 'accepted') {
      onInstalled('pwa')
    } else if (outcome === 'dismissed') {
      setNote('No problem. You can install later from Install CountWise in the app menu.')
    } else {
      setNote('Your browser is not offering the install right now. Try the browser menu, or keep using CountWise in your browser.')
    }
  }

  let body
  if (platform.id !== deviceOs) {
    body = <p>To install the web app, open this page on your {platform.device}.</p>
  } else if (standalone || installed) {
    body = <p className="text-goodText">CountWise is already installed on this device.</p>
  } else if (platform.id === 'ios') {
    body = (
      <div className="space-y-2">
        <ol className="list-decimal pl-5 space-y-1">
          {IOS_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <Button onClick={() => onInstalled('ios')} className="mt-2 px-4 py-2 rounded-lg">
          I have done these steps
        </Button>
      </div>
    )
  } else if (canPrompt) {
    body = (
      <div className="space-y-2">
        <p>Install the CountWise web app on this {platform.device}.</p>
        <Button onClick={handleInstall} disabled={busy} className="px-4 py-2 rounded-lg">
          {busy ? 'Waiting for your browser...' : 'Install CountWise web app'}
        </Button>
      </div>
    )
  } else {
    body = (
      <p>
        Your browser has not offered an install option. In Chrome or Edge, open the browser menu and choose “Install
        CountWise” if it appears.
        {platform.id === 'macos' ? ' In Safari 17 or newer, choose File, then Add to Dock.' : ''}
      </p>
    )
  }

  return (
    <div>
      {body}
      {note && (
        <p role="status" className="mt-3 text-sm text-muted dark:text-mutedDark">
          {note}
        </p>
      )}
    </div>
  )
}

// The "native app" half: a real link ONLY when platforms.js has a real build.
export function NativeStatus({ platform }) {
  const download = getNativeDownload(platform)
  return download ? (
    <a href={download.url} className="text-goldText hover:underline">
      Download version {download.version}
    </a>
  ) : (
    <p>Not yet available.</p>
  )
}
