import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import Input from './ui/Input.jsx'

// Drop-in replacement for <input type="password">: accepts the same
// controlled-input props (value, onChange, placeholder, required, etc.)
// via spread, so callers don't need to change anything except the tag
// name. Styling matches Login.jsx/ResetPassword.jsx's existing plain
// inputs exactly (same border/focus-ring/dark-mode tokens) — only the
// eye icon is new, positioned inside the field, right-aligned.
export default function PasswordInput({ className = '', ...props }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`w-full px-3 py-2.5 pr-10 rounded-lg bg-paper dark:bg-charcoal text-sm focus:ring-2 focus:ring-gold/40 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        // Keeps tab order moving straight from the field to whatever's
        // next in the form, rather than stopping on the icon first.
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite transition-colors"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}
