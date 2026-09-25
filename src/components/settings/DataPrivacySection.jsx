import DataExportSection from './DataExportSection.jsx'
import AccountDeletionSection from './AccountDeletionSection.jsx'

// Phase 21 note: the frozen spec calls this "Data & Privacy" and expects
// Account Deletion to land in the *same* section as Phase 19's CSV
// export, not a new one — but the live Settings.jsx tab is actually named
// "Data Export" (id: 'export'), not "Data & Privacy". Rather than editing
// DataExportSection.jsx (explicitly do-not-touch beyond "add to it /
// alongside it") or guessing at a merge, this wrapper renders the
// existing, untouched DataExportSection followed by the new
// AccountDeletionSection under one tab. Settings.jsx now points its
// 'export' entry at this file instead of DataExportSection directly, and
// its label was updated to "Data & Privacy" to match the spec's actual
// intent. Flagged in the Phase 21 handoff for the spine to reconcile.
export default function DataPrivacySection() {
  return (
    <div className="space-y-10">
      <DataExportSection />

      <div className="pt-8 border-t border-line dark:border-lineDark">
        <h2 className="text-xs font-medium text-muted dark:text-mutedDark uppercase tracking-wide mb-4">Account</h2>
        <AccountDeletionSection />
      </div>
    </div>
  )
}
