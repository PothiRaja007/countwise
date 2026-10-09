import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Footer from '../components/Footer.jsx'
import { useInstallState } from '../lib/installPrompt.js'
import '../styles/welcome.css'

// Phase 41 - the CountWise Home page shown right after sign-in.
//   mode 'new'       first time on this account: a short tour, then Install / Use in browser
//   mode 'returning' existing account: same page, with "Go to app"
//
// LOOK: the same world as the public CountWise landing page - paper background, a huge
// light Fraunces headline, mono eyebrows, plain underlined links with a gold hairline,
// generous space. Each chapter is a short text beside an illustration, alternating sides.
// The pictures are drawn in code from CountWise's own look (they are NOT screenshots),
// so each one is labelled "Illustration". To use a real screenshot later, replace the
// <Visual> of that chapter with an <img>.
// CONTENT RULE: every line describes something the app really does today.

const GUTTER = 'px-[clamp(1.25rem,4vw,3.5rem)]'
const MONO = 'font-mono'
const EYEBROW = `${MONO} text-xs tracking-[0.2em] uppercase text-brown dark:text-mutedDark`
const TITLE =
  'font-display font-normal text-[clamp(1.75rem,4vw,3rem)] leading-[1.1] tracking-[-0.015em] text-charcoal dark:text-offwhite'
const TEXT = 'max-w-[40ch] text-lg leading-relaxed text-brown dark:text-mutedDark'
const LINK =
  'inline-block border-b border-gold pb-0.5 text-[1.05rem] text-charcoal dark:text-offwhite transition-colors hover:text-goldText bg-transparent cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-4 focus-visible:ring-offset-paper dark:focus-visible:ring-offset-charcoal'

// Fades a block in once, the first time it scrolls into view.
// `from` makes it slide in from a side instead of rising.
function Reveal({ children, className = '', from }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in')
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-in')
          io.disconnect()
        }
      },
      { threshold: 0.2 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const side = from ? `wh-reveal--from-${from}` : ''
  return (
    <div ref={ref} className={`wh-reveal ${side} ${className}`}>
      {children}
    </div>
  )
}

/* ------------------------------ illustrations ------------------------------ */

function Frame({ label, children }) {
  return (
    <figure className="m-0">
      <div
        aria-hidden="true"
        className="rounded-2xl border border-[#d9d4c8] dark:border-lineDark bg-[#fbfaf6] dark:bg-charcoalSurface p-6 sm:p-8"
      >
        {children}
      </div>
      <figcaption className={`${MONO} mt-3 text-[11px] tracking-[0.14em] uppercase text-brown/70 dark:text-mutedDark`}>
        Illustration · {label}
      </figcaption>
    </figure>
  )
}

const panelLabel = `${MONO} text-[11px] tracking-[0.18em] uppercase text-brown dark:text-mutedDark`

function MoneyInboxIllustration() {
  const row = (name, where, amount) => (
    <div className="flex items-center justify-between gap-4 py-3 border-t border-[#ece8dd] dark:border-lineDark text-sm">
      <div>
        <p className="text-charcoal dark:text-offwhite">{name}</p>
        <p className="text-xs text-brown/80 dark:text-mutedDark">{where}</p>
      </div>
      <span className={`${MONO} text-charcoal dark:text-offwhite`}>{amount}</span>
    </div>
  )
  return (
    <Frame label="Money Inbox">
      <p className={panelLabel}>Money Inbox</p>
      <div className={`${MONO} mt-3 rounded-lg border border-[#d9d4c8] dark:border-lineDark bg-paper dark:bg-charcoal px-4 py-3 text-sm text-charcoal dark:text-offwhite`}>
        dinner with friends 500 bank, bus 40 wallet
      </div>
      <div className="mt-4">
        {row('Dinner with friends', 'Expense · Bank', '−₹500')}
        {row('Bus', 'Expense · Wallet', '−₹40')}
      </div>
      <div className="mt-4 inline-block rounded-full bg-gold px-5 py-2 text-sm font-medium text-ink">Confirm</div>
    </Frame>
  )
}

function GoalsIllustration() {
  const goal = (name, pct) => (
    <div className="py-3 border-t border-[#ece8dd] dark:border-lineDark first:border-t-0">
      <p className="text-sm text-charcoal dark:text-offwhite">{name}</p>
      <div className="mt-2 h-1.5 w-full rounded-full bg-[#ece8dd] dark:bg-lineDark overflow-hidden">
        <div className="wh-bar h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
  return (
    <Frame label="Goals">
      <p className={panelLabel}>Goals</p>
      <div className="mt-3">
        {goal('Laptop', 72)}
        {goal('Emergency fund', 45)}
        {goal('Weekend trip', 18)}
      </div>
      <p className={`${MONO} mt-4 text-[11px] tracking-[0.14em] uppercase text-brown/70 dark:text-mutedDark`}>
        Set aside, not spent
      </p>
    </Frame>
  )
}

const CURVE = 'M0 168 C30 160 50 176 90 150 S150 142 190 122 S250 112 290 84 S350 54 396 26'

function GrowthIllustration() {
  return (
    <Frame label="Charts">
      <p className={panelLabel}>Net balance · this month</p>
      <svg viewBox="0 0 400 200" className="mt-3 w-full h-auto" role="presentation">
        {[50, 100, 150].map((y) => (
          <line key={y} x1="0" x2="400" y1={y} y2={y} stroke="currentColor" className="text-[#e3ded2] dark:text-lineDark" strokeWidth="1" />
        ))}
        <line x1="0" x2="400" y1="168" y2="168" stroke="currentColor" className="text-brown/50 dark:text-mutedDark" strokeWidth="1" strokeDasharray="4 5" />
        <path d={`${CURVE} L396 200 L0 200 Z`} fill="#C89D4B" fillOpacity="0.14" className="wh-fade" />
        <path d={CURVE} fill="none" stroke="currentColor" className="text-[#d9d4c8] dark:text-lineDark" strokeWidth="2" />
        <path d={CURVE} pathLength="1" className="wh-draw" fill="none" stroke="#C89D4B" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="396" cy="26" r="6" fill="#C89D4B" className="wh-fade" />
      </svg>
    </Frame>
  )
}

function SalaryIllustration() {
  const bar = (name, pct, muted = false) => (
    <div className="py-2.5">
      <div className="flex justify-between text-sm text-charcoal dark:text-offwhite">
        <span>{name}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#ece8dd] dark:bg-lineDark overflow-hidden">
        <div className={`wh-bar h-full rounded-full ${muted ? 'bg-brown/50' : 'bg-gold'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
  return (
    <Frame label="Work tools">
      <p className={panelLabel}>Salary structure</p>
      <div className="mt-3">
        {bar('Basic', 62)}
        {bar('Allowances', 28)}
        {bar('Other components', 10)}
      </div>
      <div className="mt-3 rounded-lg border border-dashed border-[#d9d4c8] dark:border-lineDark px-4 py-3 text-xs text-brown dark:text-mutedDark">
        PF is shown separately, never added to your balance
      </div>
    </Frame>
  )
}

function AiIllustration() {
  const line = (w) => <div className="h-2 rounded-full bg-[#e8e3d7] dark:bg-lineDark" style={{ width: `${w}%` }} />
  return (
    <Frame label="Optional AI">
      <div className="inline-block rounded-full border border-[#d9d4c8] dark:border-lineDark px-4 py-1.5 text-sm text-charcoal dark:text-offwhite">
        Explain this
      </div>
      <div className="mt-5 grid gap-3">
        {line(92)}
        {line(78)}
        {line(86)}
        {line(54)}
      </div>
      <p className={`${MONO} mt-5 text-[11px] tracking-[0.14em] uppercase text-brown/70 dark:text-mutedDark`}>
        You click · you review · then it is saved
      </p>
    </Frame>
  )
}

/* -------------------------------- layout -------------------------------- */

// One chapter: short text beside a picture; `flip` swaps the sides on wide screens.
// On phones the text always comes first, then the picture.
function Showcase({ id, n, label, title, text, visual, flip = false, extra }) {
  return (
    <section aria-labelledby={id} className="border-t border-[#d9d4c8] dark:border-lineDark">
      <div className={`mx-auto max-w-[1200px] ${GUTTER} py-[clamp(4rem,9vw,7.5rem)] grid items-center gap-10 lg:grid-cols-2 lg:gap-24`}>
        <Reveal className={flip ? 'lg:order-2' : ''} from={flip ? 'right' : 'left'}>
          <p className={EYEBROW}>
            {n} — {label}
          </p>
          <h2 id={id} className={`mt-3 mb-4 ${TITLE}`}>
            {title}
          </h2>
          <p className={TEXT}>{text}</p>
          {extra}
        </Reveal>
        <Reveal className={flip ? 'lg:order-1' : ''} from={flip ? 'left' : 'right'}>
          {visual}
        </Reveal>
      </div>
    </section>
  )
}

export default function WelcomeHome({ mode, onInstall, onUseBrowser, onGoToApp }) {
  const { standalone } = useInstallState()
  const isNew = mode === 'new'

  const actions = isNew ? (
    standalone ? (
      <button type="button" onClick={onUseBrowser} className={LINK}>
        Start using CountWise →
      </button>
    ) : (
      <>
        <button type="button" onClick={onInstall} className={LINK}>
          Install CountWise →
        </button>
        <button type="button" onClick={onUseBrowser} className={LINK}>
          Use CountWise in browser
        </button>
      </>
    )
  ) : (
    <>
      <button type="button" onClick={onGoToApp} className={LINK}>
        Go to app →
      </button>
      <Link to="/install" className={LINK}>
        Install CountWise
      </Link>
    </>
  )

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip bg-paper dark:bg-charcoal text-charcoal dark:text-offwhite font-body">
      {/* ---------------- Hero: same as the public landing ---------------- */}
      <header className={`min-h-screen flex flex-col justify-center ${GUTTER} py-16`}>
        <p className={`${EYEBROW} wh-rise`}>COUNTWISE</p>
        <h1
          className="mt-5 max-w-[14ch] font-display font-normal text-[clamp(2.5rem,7vw,6rem)] leading-[1.02] tracking-[-0.02em] text-charcoal dark:text-offwhite wh-rise"
          style={{ animationDelay: '0.12s' }}
        >
          {isNew ? 'Every expense counts.' : 'Welcome back.'}
        </h1>
        <p className="mt-6 max-w-[34ch] text-lg text-brown dark:text-mutedDark wh-rise" style={{ animationDelay: '0.32s' }}>
          {isNew ? 'Personal finance, built around clarity.' : 'Your CountWise is ready.'}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-10 gap-y-4 wh-rise" style={{ animationDelay: '0.5s' }}>
          {actions}
        </div>
      </header>

      <main>
        <Showcase
          id="sc-track"
          n="01"
          label="TRACK"
          title="Type it the way you'd say it."
          text="Write entries like a message. You review every line before anything is saved."
          visual={<MoneyInboxIllustration />}
        />
        <Showcase
          id="sc-plan"
          n="02"
          label="PLAN"
          title="Set money aside on purpose."
          text="Goals and monthly budgets, kept apart from your everyday spending."
          visual={<GoalsIllustration />}
          flip
        />
        <Showcase
          id="sc-understand"
          n="03"
          label="UNDERSTAND"
          title="See where it goes."
          text="Charts, period reports, and a Behavior Score that describes and never judges."
          visual={<GrowthIllustration />}
        />
        <Showcase
          id="sc-work"
          n="04"
          label="WORK"
          title="Made for salaried life too."
          text="Salary, CTC and PF tools if you are employed."
          visual={<SalaryIllustration />}
          flip
        />
        <Showcase
          id="sc-ai"
          n="05"
          label="AI, ONLY IF YOU ASK"
          title="Optional, never automatic."
          text="A few buttons use Google’s Gemini. Nothing is sent until you click."
          visual={<AiIllustration />}
          extra={
            <Link to="/ai-data-notice" className={`${LINK} mt-6 text-base`}>
              Read the AI and data notice
            </Link>
          }
        />

        {/* ---------------- Closing ---------------- */}
        <section aria-labelledby="sc-way" className="border-t border-[#d9d4c8] dark:border-lineDark">
          <div className={`mx-auto max-w-[1200px] ${GUTTER} py-[clamp(4rem,10vw,8rem)]`}>
            <Reveal>
              <p className={EYEBROW}>06 — YOUR WAY</p>
              <h2 id="sc-way" className={`mt-3 mb-4 ${TITLE}`}>
                Use it your way.
              </h2>
              <p className={TEXT}>
                In your browser, or installed as an app from your browser. Native apps are not available yet.
              </p>
              <p className={`${MONO} mt-6 max-w-[60ch] text-[11px] leading-relaxed tracking-[0.14em] uppercase text-brown/80 dark:text-mutedDark`}>
                Also inside: Calendar · Bank statement import · Learning ROI · Money Options · Advanced Insights
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-x-10 gap-y-4">{actions}</div>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
