import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import { categoryPillClasses } from '../../lib/categoryColors.js'
import Button from '../ui/Button.jsx'
import Input from '../ui/Input.jsx'
import Select from '../ui/Select.jsx'
import EmptyState from '../ui/EmptyState.jsx'

const DEFAULT_LOCKED_MESSAGE = "This is a default category and can't be edited."

export default function CategoriesSection() {
  const { user } = useAuth()
  const [categories, setCategories] = useState([])
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState('expense')
  const [adding, setAdding] = useState(false)
  const [filterKind, setFilterKind] = useState('all') // separate from newKind — this filters the list, doesn't set a new category's kind

  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [rowError, setRowError] = useState({}) // { [categoryId]: message }
  const [keywordDraft, setKeywordDraft] = useState({}) // { [categoryId]: text }
  const [addingKeywordFor, setAddingKeywordFor] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)

    const [categoriesRes, rulesRes] = await Promise.all([
      supabase.from('categories').select('*').or(`user_id.eq.${user.id},user_id.is.null`).order('name'),
      supabase.from('category_rules').select('*').or(`user_id.eq.${user.id},user_id.is.null`),
    ])

    setLoading(false)

    if (categoriesRes.error || rulesRes.error) {
      // eslint-disable-next-line no-console
      console.error(categoriesRes.error || rulesRes.error)
      setError('Something went wrong loading your categories. Please try again.')
      return
    }

    setCategories(categoriesRes.data || [])
    setRules(rulesRes.data || [])
  }

  useEffect(() => {
    if (user) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const keywordsFor = (categoryId) => rules.filter((r) => r.category_id === categoryId)

  const setRowErr = (id, msg) => setRowError((prev) => ({ ...prev, [id]: msg }))
  const clearRowErr = (id) =>
    setRowError((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })

  const handleAddCategory = async () => {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    setError(null)

    const { error: insertErr } = await supabase.from('categories').insert({
      user_id: user.id,
      name,
      kind: newKind,
      is_default: false,
    })

    setAdding(false)

    if (insertErr) {
      // eslint-disable-next-line no-console
      console.error(insertErr)
      setError("Couldn't add that category. Please try again.")
      return
    }

    setNewName('')
    await load()
  }

  const startEdit = (category) => {
    setEditingId(category.id)
    setEditingName(category.name)
    clearRowErr(category.id)
  }

  // Attempting to edit/delete a default category still calls this — the
  // click isn't blocked client-side, because §11 of the frozen spec
  // requires the actual RLS-blocked path to be exercised, not just a
  // client-side guess papered over the real permission check. RLS's
  // "own categories" policies use `using (auth.uid() = user_id)`, which
  // silently matches zero rows for a default row (user_id is null) rather
  // than throwing — Supabase returns { error: null, data: [] }, not an
  // error object. So a default-category attempt is detected by checking
  // for an empty returned array, not by catching an error.
  const handleRenameSave = async (category) => {
    const name = editingName.trim()
    if (!name) return
    clearRowErr(category.id)

    const { data, error: updateErr } = await supabase
      .from('categories')
      .update({ name })
      .eq('id', category.id)
      .select()

    if (updateErr) {
      // eslint-disable-next-line no-console
      console.error(updateErr)
      setRowErr(category.id, "Couldn't rename this category. Please try again.")
      return
    }

    if (!data || data.length === 0) {
      setRowErr(category.id, DEFAULT_LOCKED_MESSAGE)
      return
    }

    setEditingId(null)
    await load()
  }

  const handleDelete = async (category) => {
    clearRowErr(category.id)

    const { data, error: deleteErr } = await supabase.from('categories').delete().eq('id', category.id).select()

    if (deleteErr) {
      // eslint-disable-next-line no-console
      console.error(deleteErr)
      setRowErr(category.id, "Couldn't delete this category. Please try again.")
      return
    }

    if (!data || data.length === 0) {
      setRowErr(category.id, DEFAULT_LOCKED_MESSAGE)
      return
    }

    await load()
  }

  const handleAddKeyword = async (category) => {
    const keyword = (keywordDraft[category.id] || '').trim().toLowerCase()
    if (!keyword) return
    clearRowErr(category.id)

    const { data, error: insertErr } = await supabase
      .from('category_rules')
      .insert({ user_id: user.id, category_id: category.id, keyword, priority: 0 })
      .select()

    if (insertErr) {
      // eslint-disable-next-line no-console
      console.error(insertErr)
      if (insertErr.code === '23505') {
        // Unique violation on (user_id, category_id, keyword) — the
        // constraint added alongside this fix. Distinguish this from a
        // generic failure since it's a specific, expected, correctable case.
        setRowErr(category.id, 'This keyword is already added to this category.')
      } else {
        setRowErr(category.id, "Couldn't add that keyword. Please try again.")
      }
      return
    }

    if (!data || data.length === 0) {
      setRowErr(category.id, DEFAULT_LOCKED_MESSAGE)
      return
    }

    setKeywordDraft((prev) => ({ ...prev, [category.id]: '' }))
    setAddingKeywordFor(null)
    await load()
  }

  if (loading) {
    return <p className="text-sm text-muted dark:text-mutedDark">Loading...</p>
  }

  if (error) {
    return (
      <div>
        <p className="text-sm text-bad">{error}</p>
        <Button variant="text" onClick={load} className="mt-1.5 text-sm">
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[160px]">
          <label htmlFor="new-category-name" className="block text-xs font-medium text-muted dark:text-mutedDark mb-1">
            New category
          </label>
          <Input
            id="new-category-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Pet care"
            maxLength={40}
            className="w-full text-sm py-2 px-3 rounded-md bg-surface dark:bg-charcoalSurface"
          />
        </div>
        <Select
          value={newKind}
          onChange={(e) => setNewKind(e.target.value)}
          className="text-sm py-2 px-3 rounded-md bg-surface dark:bg-charcoalSurface"
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </Select>
        <Button
          onClick={handleAddCategory}
          disabled={!newName.trim() || adding}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md"
        >
          <Plus size={15} />
          {adding ? 'Adding...' : 'Add'}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted dark:text-mutedDark">Show</span>
        <div className="flex gap-1 border border-line dark:border-lineDark rounded-md p-0.5">
          {[
            { value: 'all', label: 'All' },
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterKind(opt.value)}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                filterKind === opt.value
                  ? 'bg-gold text-white font-medium'
                  : 'text-muted dark:text-mutedDark hover:text-ink dark:hover:text-offwhite'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {categories
          .filter((category) => filterKind === 'all' || category.kind === filterKind)
          .map((category) => {
          const isDefault = category.user_id === null
          const isEditing = editingId === category.id

          return (
            <div
              key={category.id}
              className="border border-line dark:border-lineDark rounded-md px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      maxLength={40}
                      className="text-sm py-1 px-2 rounded bg-surface dark:bg-charcoalSurface border border-gold outline-none focus:ring-2 focus:ring-gold/50"
                    />
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium truncate ${categoryPillClasses(category.name)}`}>
                      {category.name}
                    </span>
                  )}
                  <span className="text-xs text-muted dark:text-mutedDark shrink-0">{category.kind}</span>
                  {isDefault && (
                    <span className="text-xs px-1.5 py-0.5 rounded border border-line dark:border-lineDark text-muted dark:text-mutedDark shrink-0">
                      Default
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleRenameSave(category)}
                        aria-label="Save name"
                        className="p-1.5 text-good hover:bg-paper dark:hover:bg-charcoal rounded"
                      >
                        <Check size={15} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel"
                        className="p-1.5 text-muted dark:text-mutedDark hover:bg-paper dark:hover:bg-charcoal rounded"
                      >
                        <X size={15} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(category)}
                        aria-label={`Rename ${category.name}`}
                        title={isDefault ? DEFAULT_LOCKED_MESSAGE : 'Rename'}
                        className={`p-1.5 rounded hover:bg-paper dark:hover:bg-charcoal ${
                          isDefault ? 'text-muted/50 dark:text-mutedDark/50' : 'text-muted dark:text-mutedDark'
                        }`}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(category)}
                        aria-label={`Delete ${category.name}`}
                        title={isDefault ? DEFAULT_LOCKED_MESSAGE : 'Delete'}
                        className={`p-1.5 rounded hover:bg-paper dark:hover:bg-charcoal ${
                          isDefault ? 'text-muted/50 dark:text-mutedDark/50' : 'text-muted dark:text-mutedDark'
                        }`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {keywordsFor(category.id).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {keywordsFor(category.id).map((rule) => (
                    <span
                      key={rule.id}
                      className="text-xs px-1.5 py-0.5 rounded bg-paper dark:bg-charcoal text-muted dark:text-mutedDark"
                    >
                      {rule.keyword}
                    </span>
                  ))}
                </div>
              )}

              {!isDefault && (
                <div className="mt-2">
                  {addingKeywordFor === category.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={keywordDraft[category.id] || ''}
                        onChange={(e) => setKeywordDraft((prev) => ({ ...prev, [category.id]: e.target.value }))}
                        placeholder="keyword"
                        maxLength={30}
                        className="text-xs py-1 px-2 rounded bg-surface dark:bg-charcoalSurface border border-line dark:border-lineDark outline-none focus:border-gold"
                      />
                      <button
                        onClick={() => handleAddKeyword(category)}
                        className="text-xs text-gold hover:underline"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => setAddingKeywordFor(null)}
                        className="text-xs text-muted dark:text-mutedDark hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingKeywordFor(category.id)}
                      className="text-xs text-muted dark:text-mutedDark hover:text-gold"
                    >
                      + Add keyword
                    </button>
                  )}
                </div>
              )}

              {rowError[category.id] && <p className="text-xs text-bad mt-1.5">{rowError[category.id]}</p>}
            </div>
          )
        })}
        {categories.filter((c) => filterKind === 'all' || c.kind === filterKind).length === 0 && (
          <EmptyState message={`No ${filterKind} categories yet.`} className="py-2" />
        )}
      </div>
    </div>
  )
}
