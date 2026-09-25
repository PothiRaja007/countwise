import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import MoneyInboxInput from './MoneyInboxInput.jsx'

export default function MoneyInboxTrigger() {
  const location = useLocation()
  const [open, setOpen] = useState(false)

  if (location.pathname === '/settings') return null

  function handleOpen() {
    setOpen(true)
  }

  function handleClose() {
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Open Money Inbox"
        className="fixed z-40 bottom-3 right-1/2 translate-x-1/2 w-12 h-12 md:bottom-6 md:right-6 md:translate-x-0 md:w-14 md:h-14 rounded-full bg-gold text-white flex items-center justify-center shadow-lg hover:bg-gold/90 transition-colors"
      >
        <Plus size={24} />
      </button>

      {open && <MoneyInboxInput onClose={handleClose} />}
    </>
  )
}
