import { useEffect, useRef } from 'react'

// Accessible behavior wrapper around every modal/drawer/sheet in the app —
// each caller keeps its own visual markup (header, body, footer, sizing,
// bottom-sheet-vs-centered positioning, background tint) exactly as it was;
// this component only supplies what a native <dialog> gets right for free:
// focus moves into the dialog on open, Tab is trapped inside it, Escape
// closes it, the rest of the page is inert to assistive tech while it's
// open, and focus returns to whatever was focused before it opened.
//
// `className` is the full class string the old outer overlay div used to
// carry (fixed inset-0, background dim, flex alignment) — passed straight
// through so every modal's existing look is unchanged; BASE_RESET only
// clears the UA <dialog> defaults (margin/padding/border/max-size) that
// would otherwise fight that positioning. Backdrop-click-to-close is
// handled by comparing the click's target to the dialog element itself —
// the same test the old stopPropagation-on-the-inner-card pattern achieved
// manually, so callers keep that stopPropagation unchanged too.
const BASE_RESET = 'm-0 p-0 border-0 max-w-none max-h-none w-full h-full'

// A <dialog> defaults to an opaque browser-supplied background. Callers that
// set their own (bg-black/40 etc.) must keep it, so the transparent reset is
// only added when the caller's className has no bg-* class — adding it
// unconditionally would override theirs (utility order in the generated CSS,
// not class order, decides which bg-* wins).
const hasOwnBackground = (className) => /(^|[\s:])bg-/.test(className)

export default function Modal({ onClose, className = '', titleId, label, children }) {
  const dialogRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    previouslyFocused.current = document.activeElement
    if (!dialog.open) dialog.showModal()

    return () => {
      // Do NOT call dialog.close() here. React 18 Strict Mode runs this
      // cleanup once, synchronously, as part of its dev-only double-invoke
      // check on initial mount — closing the native <dialog> at that point
      // races with the 'close' event listener in the other effect below
      // and can leave the whole component permanently unmounted before the
      // user ever sees it. It's unnecessary anyway: when `open` becomes
      // false in the parent, React stops rendering <Modal> and removes the
      // <dialog> element from the DOM — there's nothing left to explicitly
      // close.
      const toRestore = previouslyFocused.current
      if (toRestore && typeof toRestore.focus === 'function' && document.contains(toRestore)) {
        toRestore.focus()
      }
    }
  }, [])

  // Escape (or any other native dismissal) fires 'close' on the dialog
  // itself before React knows about it — relay that to the caller's
  // onClose so the state driving `{condition && <Modal>}` clears and this
  // component unmounts to match, instead of the dialog silently closing
  // while React still thinks it's open.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleNativeClose = () => onClose()
    dialog.addEventListener('close', handleNativeClose)
    return () => dialog.removeEventListener('close', handleNativeClose)
  }, [onClose])

  const handleClick = (e) => {
    if (e.target === dialogRef.current) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-label={titleId ? undefined : label}
      onClick={handleClick}
      className={`${BASE_RESET} ${hasOwnBackground(className) ? '' : 'bg-transparent'} ${className}`.replace(/\s+/g, ' ').trim()}
    >
      {children}
    </dialog>
  )
}
