import { useState, useRef, useEffect } from 'react'
import { supabase } from './supabase.js'
import {
  DndContext, closestCenter,
  PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  // default category icons
  ClipboardList, HeartHandshake, ShoppingCart, FolderKanban, Archive,
  // custom category icon picker options
  List, Star, Bookmark, Flag, Home, Music, Dumbbell, BookOpen,
  Coffee, Camera, Plane, Heart, ShoppingBag, Leaf, Utensils, Laptop,
  Sparkles, Bike, Baby, Pill, PawPrint, Sunrise, Wallet, Globe,
  // UI icons
  Plus, Search, Pencil, X, GripVertical, Settings,
} from 'lucide-react'

// ── Icon registry ──────────────────────────────────────────────────────────

const ICON_MAP = {
  'clipboard-list':  ClipboardList,
  'heart-handshake': HeartHandshake,
  'shopping-cart':   ShoppingCart,
  'folder-kanban':   FolderKanban,
  'archive':         Archive,
  'list':            List,
  'star':            Star,
  'bookmark':        Bookmark,
  'flag':            Flag,
  'home':            Home,
  'music':           Music,
  'dumbbell':        Dumbbell,
  'book-open':       BookOpen,
  'coffee':          Coffee,
  'camera':          Camera,
  'plane':           Plane,
  'heart':           Heart,
  'shopping-bag':    ShoppingBag,
  'leaf':            Leaf,
  'utensils':        Utensils,
  'laptop':          Laptop,
  'sparkles':        Sparkles,
  'bike':            Bike,
  'baby':            Baby,
  'pill':            Pill,
  'paw-print':       PawPrint,
  'sunrise':         Sunrise,
  'wallet':          Wallet,
  'globe':           Globe,
}

// Icons available to choose when creating a new list
const CUSTOM_ICONS = [
  'list', 'star', 'bookmark', 'flag', 'home', 'heart',
  'music', 'dumbbell', 'book-open', 'coffee', 'camera', 'plane',
  'shopping-bag', 'leaf', 'utensils', 'laptop', 'sparkles', 'bike',
  'baby', 'pill', 'paw-print', 'sunrise', 'wallet', 'globe',
]

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  { id: 'general',   name: 'General',   iconName: 'clipboard-list',  color: '#7C9A7E', light: '#EEF3EC', dark: '#4A6B4C', custom: false },
  { id: 'afsp',      name: 'AFSP',      iconName: 'heart-handshake', color: '#9B8EB8', light: '#F0EDF7', dark: '#6A5D8A', custom: false },
  { id: 'groceries', name: 'Groceries', iconName: 'shopping-cart',   color: '#B89A6A', light: '#F6F0E4', dark: '#8A6E42', custom: false },
  { id: 'projects',  name: 'Projects',  iconName: 'folder-kanban',   color: '#7A9BB5', light: '#EAF0F6', dark: '#4A6B85', custom: false },
]

const ARCHIVE_CAT = {
  id: 'archive', name: 'Archive', iconName: 'archive',
  color: '#9BAA9C', light: '#F0F2EE', dark: '#5A6B5C',
}

const PALETTE = [
  { color: '#C47A7A', light: '#F5EDED', dark: '#8A4A4A' },
  { color: '#7AB8B0', light: '#E9F4F3', dark: '#4A8A82' },
  { color: '#B87A9A', light: '#F5EAF0', dark: '#8A4A72' },
  { color: '#8A9E7C', light: '#EDF3E9', dark: '#52724A' },
  { color: '#C4A57A', light: '#F5EFE3', dark: '#8A7242' },
  { color: '#9BB87A', light: '#EFF5E9', dark: '#5A8A42' },
  { color: '#7A8EB8', light: '#EAF0F6', dark: '#4A5E8A' },
  { color: '#B8AA7A', light: '#F5F0E3', dark: '#8A7A42' },
]

const SEED = [
  { id: 1, text: 'Tap the circle to complete a task',  category: 'general',   archived: false },
  { id: 2, text: 'Review meeting notes',               category: 'afsp',      archived: false },
  { id: 3, text: 'Eggs, milk, avocados',               category: 'groceries', archived: false },
  { id: 4, text: 'Define project milestones',          category: 'projects',  archived: false },
]

// ── Supabase ↔ app shape mappers ───────────────────────────────────────────

const catToDb  = (c, i) => ({ id: c.id, name: c.name, icon_name: c.iconName, color: c.color, light: c.light, dark: c.dark, custom: c.custom ?? false, sort_order: i })
const dbToCat  = r => ({ id: r.id, name: r.name, iconName: r.icon_name, color: r.color, light: r.light, dark: r.dark, custom: r.custom })
const taskToDb = (t, i) => ({ id: t.id, text: t.text, category: t.category, archived: t.archived, sort_order: i })
const dbToTask = r => ({ id: r.id, text: r.text, category: r.category, archived: r.archived })

// Read localStorage for one-time migration on first Supabase load
function readLocalCats() {
  try {
    const saved = JSON.parse(localStorage.getItem('todo-categories'))
    if (!saved) return null
    return saved.map(cat => {
      const def = DEFAULT_CATEGORIES.find(d => d.id === cat.id)
      return def ? { ...cat, iconName: cat.iconName ?? def.iconName } : cat
    })
  } catch { return null }
}
function readLocalTasks() {
  try {
    const raw = JSON.parse(localStorage.getItem('todo-tasks'))
    if (!raw) return null
    return raw.map(t => ({ ...t, archived: t.archived ?? t.done ?? false }))
  } catch { return null }
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [categories, setCategories] = useState([])
  const [tasks, setTasks]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [active, setActive]         = useState('general')
  const [prevActive, setPrevActive] = useState('general')
  const [viewKey, setViewKey]       = useState(0)
  const [text, setText]             = useState('')
  const [search, setSearch]         = useState('')
  const [editingId, setEditingId]   = useState(null)
  const [editText, setEditText]     = useState('')
  const [newTaskId, setNewTaskId]   = useState(null)
  const inputRef = useRef()

  useEffect(() => {
    async function load() {
      const [catsRes, tasksRes] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('tasks').select('*').order('sort_order'),
      ])

      if (catsRes.error)  console.error('[supabase] categories:', catsRes.error)
      if (tasksRes.error) console.error('[supabase] tasks:',      tasksRes.error)

      const dbCats  = catsRes.data
      const dbTasks = tasksRes.data

      let cats, tsk
      if (!dbCats || dbCats.length === 0) {
        cats = readLocalCats() ?? DEFAULT_CATEGORIES
        const { error } = await supabase.from('categories').insert(cats.map(catToDb))
        if (error) console.error('[supabase] seed categories:', error)
      } else {
        cats = dbCats.map(dbToCat)
      }

      if (!dbTasks || dbTasks.length === 0) {
        tsk = readLocalTasks() ?? SEED
        const { error } = await supabase.from('tasks').insert(tsk.map(taskToDb))
        if (error) console.error('[supabase] seed tasks:', error)
      } else {
        tsk = dbTasks.map(dbToTask)
      }

      setCategories(cats)
      setTasks(tsk)
      setLoading(false)
    }
    load()
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const isArchive    = active === 'archive'
  const isSettings   = active === 'settings'
  const isSearching  = search.trim().length > 0 && !isSettings
  const cat          = categories.find(c => c.id === active)
  const archiveCount = tasks.filter(t => t.archived).length
  const activeTasks  = tasks.filter(t => t.category === active && !t.archived)
  const searchResults = isSearching
    ? tasks.filter(t => !t.archived && t.text.toLowerCase().includes(search.toLowerCase()))
    : []

  const add = e => {
    e.preventDefault()
    if (!text.trim() || isArchive) return
    const newTask = { id: Date.now(), text: text.trim(), category: active, archived: false }
    const sortPos = -(tasks.filter(t => t.category === active && !t.archived).length + 1)
    setTasks(p => [newTask, ...p])
    setNewTaskId(newTask.id)
    setTimeout(() => setNewTaskId(null), 400)
    setText('')
    inputRef.current?.focus()
    supabase.from('tasks').insert({ ...taskToDb(newTask, 0), sort_order: sortPos })
      .then(({ error }) => { if (error) console.error('[supabase] add task:', error) })
  }

  const archive = id => {
    setTasks(p => p.map(t => t.id === id ? { ...t, archived: true } : t))
    supabase.from('tasks').update({ archived: true }).eq('id', id)
      .then(({ error }) => { if (error) console.error('[supabase] archive:', error) })
  }
  const restore = id => {
    setTasks(p => p.map(t => t.id === id ? { ...t, archived: false } : t))
    supabase.from('tasks').update({ archived: false }).eq('id', id)
      .then(({ error }) => { if (error) console.error('[supabase] restore:', error) })
  }
  const remove = id => {
    setTasks(p => p.filter(t => t.id !== id))
    supabase.from('tasks').delete().eq('id', id)
      .then(({ error }) => { if (error) console.error('[supabase] delete:', error) })
  }

  const startEdit  = (id, cur) => { setEditingId(id); setEditText(cur) }
  const saveEdit   = id => {
    if (editText.trim()) {
      setTasks(p => p.map(t => t.id === id ? { ...t, text: editText.trim() } : t))
      supabase.from('tasks').update({ text: editText.trim() }).eq('id', id)
        .then(({ error }) => { if (error) console.error('[supabase] edit:', error) })
    }
    setEditingId(null)
  }
  const cancelEdit = () => setEditingId(null)

  const handleDragEnd = ({ active: a, over }) => {
    if (!over || a.id === over.id) return
    const si = tasks.findIndex(t => t.id === a.id)
    const oi = tasks.findIndex(t => t.id === over.id)
    if (si === -1 || oi === -1) return
    const next = [...tasks]
    const [moved] = next.splice(si, 1)
    next.splice(oi, 0, moved)
    setTasks(next)
    next
      .filter(t => t.category === active && !t.archived)
      .forEach((t, i) => supabase.from('tasks').update({ sort_order: i }).eq('id', t.id))
  }

  const createCat = ({ name, iconName, color, light, dark }) => {
    const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now()
    const newCat = { id, name, iconName, color, light, dark, custom: true }
    setCategories(p => [...p, newCat])
    supabase.from('categories').insert(catToDb(newCat, categories.length))
    return id
  }

  const updateCategory = (id, updates) => {
    setCategories(p => p.map(c => c.id === id ? { ...c, ...updates } : c))
    const dbUp = {}
    if (updates.name     !== undefined) dbUp.name      = updates.name
    if (updates.iconName !== undefined) dbUp.icon_name = updates.iconName
    if (updates.color    !== undefined) dbUp.color     = updates.color
    if (updates.light    !== undefined) dbUp.light     = updates.light
    if (updates.dark     !== undefined) dbUp.dark      = updates.dark
    supabase.from('categories').update(dbUp).eq('id', id)
  }

  const deleteCategory = id => {
    setCategories(p => p.filter(c => c.id !== id))
    setTasks(p => p.filter(t => t.category !== id))
    if (active === id) setActive('general')
    supabase.from('categories').delete().eq('id', id)
    supabase.from('tasks').delete().eq('category', id)
  }
  const navTo = id => {
    if (id === 'settings' && active === 'settings') {
      // toggle: return to previous category
      setActive(prevActive)
    } else {
      if (active !== 'settings') setPrevActive(active)
      setActive(id)
    }
    setSearch('')
    setViewKey(k => k + 1)
  }

  const allNavItems = [...categories]

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F6F2]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[#EEF3EC] flex items-center justify-center animate-pulse">
          <ClipboardList size={20} style={{ color: '#7C9A7E' }} strokeWidth={1.75} />
        </div>
        <p className="text-[13px] text-[#9BAA9C]">Loading…</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex bg-[#F8F6F2]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ════════ DESKTOP SIDEBAR ════════ */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col bg-[#ECF0EA] border-r border-[#D5E2D4]">
        <div className="px-5 pt-7 pb-4">
          <h1 className="text-xs font-semibold tracking-widest text-[#7C9A7E] uppercase">My Lists</h1>
        </div>

        <nav className="flex-1 px-2.5 space-y-0.5 overflow-y-auto pb-2">
          {categories.map(c => {
            const count = tasks.filter(t => t.category === c.id && !t.archived).length
            const on    = active === c.id && !isArchive && !isSettings && !isSearching
            return (
              <button
                key={c.id}
                onClick={() => navTo(c.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all"
                style={on ? { backgroundColor: c.color + '22', color: c.dark } : { color: '#637265' }}
              >
                <CatIcon cat={c} size={16} style={{ color: on ? c.color : '#9BAA9C', flexShrink: 0 }} />
                <span className={`flex-1 text-[13px] ${on ? 'font-semibold' : 'font-medium'}`}>{c.name}</span>
                {count > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: c.color }}>{count}</span>
                )}
              </button>
            )
          })}

        </nav>

        <div className="mx-4 py-3 border-t border-[#D5E2D4] flex items-center justify-between">
          <p className="text-[11px] text-[#9BAA9C]">{tasks.filter(t => !t.archived).length} active tasks</p>
          <button
            onClick={() => navTo('settings')}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${
              isSettings
                ? 'bg-[#7C9A7E22] text-[#4A6B4C]'
                : 'text-[#9BAA9C] hover:text-[#637265] hover:bg-[#E5EBE4]'
            }`}
            title="Settings"
          >
            <Settings size={14} />
          </button>
        </div>
      </aside>

      {/* ════════ MAIN CONTENT ════════ */}
      <main className="flex-1 overflow-y-auto">
        <div key={viewKey} className="view-enter px-4 md:px-10 pt-5 md:pt-8 pb-32 md:pb-10 max-w-xl mx-auto md:mx-0">

          {/* Mobile header */}
          <div className="flex items-center justify-between mb-4 md:hidden">
            <h1 className="text-xs font-semibold tracking-widest text-[#7C9A7E] uppercase">My Lists</h1>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#9BAA9C]">{tasks.filter(t => !t.archived).length} active</span>
              <button
                onClick={() => navTo('settings')}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                  isSettings ? 'bg-[#7C9A7E22] text-[#4A6B4C]' : 'text-[#9BAA9C] hover:text-[#637265]'
                }`}
              >
                <Settings size={16} />
              </button>
            </div>
          </div>

          {/* Settings page */}
          {isSettings && (
            <SettingsPage
              categories={categories}
              tasks={tasks}
              onUpdate={updateCategory}
              onDelete={deleteCategory}
              onAdd={createCat}
              onClearArchive={() => {
                setTasks(p => p.filter(t => !t.archived))
                supabase.from('tasks').delete().eq('archived', true)
              }}
              onClearCatArchive={catId => {
                setTasks(p => p.filter(t => !(t.archived && t.category === catId)))
                supabase.from('tasks').delete().eq('archived', true).eq('category', catId)
              }}
            />
          )}

          {/* Search — hidden on Settings page */}
          {!isSettings && <div className="mb-5 relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9BAA9C]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search all tasks…"
              className="w-full pl-10 pr-9 py-3 rounded-xl bg-white border text-[#3D4A3E] placeholder-[#BFC9C0] outline-none shadow-sm transition-all"
              style={{ borderColor: isSearching ? '#7C9A7EBB' : '#DBE8DA', fontSize: 16 }}
            />
            {isSearching && (
              <button onClick={() => setSearch('')} className="absolute right-0 top-0 w-11 h-full flex items-center justify-center text-[#9BAA9C] hover:text-[#637265]">
                <X size={16} />
              </button>
            )}
          </div>}

          {/* ── Search Results ── */}
          {isSearching && (
            <>
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-[#5A6B5C]">"{search}"</h2>
                <p className="text-xs text-[#9BAA9C] mt-0.5">{searchResults.length} task{searchResults.length !== 1 ? 's' : ''} found</p>
              </div>
              {searchResults.length === 0
                ? <p className="text-center text-sm text-[#B5C4B6] py-12">No tasks match that search.</p>
                : (
                  <div className="space-y-2">
                    {searchResults.map(t => {
                      const tc = categories.find(c => c.id === t.category)
                      if (!tc) return null
                      return (
                        <SearchRow
                          key={t.id} task={t} cat={tc}
                          isEditing={editingId === t.id} editText={editText}
                          onEditChange={setEditText} onStartEdit={startEdit}
                          onSaveEdit={saveEdit} onCancelEdit={cancelEdit}
                          onArchive={archive} onDelete={remove}
                        />
                      )
                    })}
                  </div>
                )
              }
            </>
          )}

          {/* ── Archive ── */}
          {!isSearching && isArchive && (
            <>
              <div className="flex items-center gap-2.5 mb-6">
                <Archive size={22} style={{ color: '#9BAA9C' }} strokeWidth={1.75} />
                <div>
                  <h2 className="text-xl font-semibold text-[#5A6B5C]">Archive</h2>
                  <p className="text-xs text-[#9BAA9C] mt-0.5">{archiveCount} completed</p>
                </div>
                {archiveCount > 0 && (
                  <button onClick={() => { setTasks(p => p.filter(t => !t.archived)); supabase.from('tasks').delete().eq('archived', true) }} className="ml-auto text-xs text-[#CABFB5] hover:text-rose-400 py-2 px-1 transition-colors">
                    Clear all
                  </button>
                )}
              </div>
              {archiveCount === 0
                ? <div className="text-center py-14"><p className="text-4xl mb-3 text-[#E0EAE0]">○</p><p className="text-sm text-[#B5C4B6]">Nothing archived yet.</p></div>
                : categories.map(c => {
                    const done = tasks.filter(t => t.archived && t.category === c.id)
                    if (!done.length) return null
                    return (
                      <div key={c.id} className="mb-5">
                        <div className="flex items-center gap-1.5 mb-2">
                          <CatIcon cat={c} size={13} style={{ color: c.color }} />
                          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: c.color }}>{c.name}</span>
                        </div>
                        <div className="space-y-2">
                          {done.map(t => <ArchiveRow key={t.id} task={t} cat={c} onRestore={restore} onDelete={remove} />)}
                        </div>
                      </div>
                    )
                  })
              }
            </>
          )}

          {/* ── Category View ── */}
          {!isSearching && !isArchive && cat && (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: cat.light }}>
                  <CatIcon cat={cat} size={20} style={{ color: cat.color }} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold" style={{ color: cat.dark }}>{cat.name}</h2>
                  <p className="text-xs mt-0.5" style={{ color: cat.color }}>{activeTasks.length} remaining</p>
                </div>
              </div>

              <form onSubmit={add} className="flex gap-2 mb-5">
                <input
                  ref={inputRef}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder={`Add to ${cat.name}…`}
                  className="flex-1 px-4 py-3 rounded-xl bg-white border text-[#3D4A3E] placeholder-[#BFC9C0] outline-none shadow-sm transition-all"
                  style={{ borderColor: '#DBE8DA', fontSize: 16 }}
                  onFocus={e => (e.target.style.borderColor = cat.color + 'BB')}
                  onBlur={e => (e.target.style.borderColor = '#DBE8DA')}
                />
                <button
                  type="submit"
                  className="px-5 py-3 rounded-xl text-white font-semibold shadow-sm hover:opacity-80 active:scale-95 transition-all"
                  style={{ backgroundColor: cat.color, fontSize: 15, minWidth: 64 }}
                >
                  Add
                </button>
              </form>

              {activeTasks.length === 0 ? (
                <div className="text-center py-14">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: cat.light }}>
                    <CatIcon cat={cat} size={28} style={{ color: cat.color, opacity: 0.5 }} />
                  </div>
                  <p className="text-sm text-[#B5C4B6]">
                    {tasks.filter(t => t.category === active && t.archived).length > 0
                      ? 'All done! Check the Archive.' : 'No tasks yet — add one above!'}
                  </p>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={activeTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {activeTasks.map(t => (
                        <SortableTaskRow
                          key={t.id} task={t} cat={cat}
                          isNew={t.id === newTaskId}
                          isEditing={editingId === t.id} editText={editText}
                          onEditChange={setEditText} onStartEdit={startEdit}
                          onSaveEdit={saveEdit} onCancelEdit={cancelEdit}
                          onArchive={archive} onDelete={remove}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </>
          )}
        </div>
      </main>

      {/* ════════ MOBILE BOTTOM NAV ════════ */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 bg-[#ECF0EA] border-t border-[#D5E2D4] z-10 flex"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
      >
        <div className="flex overflow-x-auto no-scrollbar flex-1">
          {allNavItems.map(c => {
            const count = c.id === 'archive'
              ? archiveCount
              : tasks.filter(t => t.category === c.id && !t.archived).length
            const on = active === c.id && !isSearching
            return (
              <button
                key={c.id}
                onClick={() => navTo(c.id)}
                className="flex flex-col items-center justify-center flex-1 min-w-[58px] py-2 px-1 relative transition-colors"
                style={{ color: on ? c.color : '#9BAA9C' }}
              >
                {on && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full" style={{ backgroundColor: c.color }} />}
                <CatIcon cat={c} size={20} strokeWidth={on ? 2 : 1.6} />
                <span className="text-[10px] font-medium mt-1 leading-none max-w-[52px] truncate">{c.name}</span>
                {count > 0 && (
                  <span
                    className="absolute top-1 right-1/2 translate-x-4 w-4 h-4 rounded-full text-white flex items-center justify-center font-bold"
                    style={{ backgroundColor: c.color, fontSize: 9 }}
                  >
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

// ── Sortable wrapper ───────────────────────────────────────────────────────

function SortableTaskRow(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.task.id })
  return (
    <div
      ref={setNodeRef}
      className={props.isNew ? 'task-entering' : ''}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : 'auto' }}
    >
      <TaskRow {...props} isDragging={isDragging} dragListeners={listeners} dragAttributes={attributes} />
    </div>
  )
}

// ── Task Row ───────────────────────────────────────────────────────────────

function TaskRow({ task, cat, isEditing, editText, onEditChange, onStartEdit, onSaveEdit, onCancelEdit, onArchive, onDelete, isDragging, dragListeners, dragAttributes }) {
  const [completing, setCompleting] = useState(false)
  const [deleting, setDeleting]     = useState(false)

  const handleComplete = () => {
    setCompleting(true)
    setTimeout(() => onArchive(task.id), 320)
  }

  const handleDelete = () => {
    setDeleting(true)
    setTimeout(() => onDelete(task.id), 260)
  }

  return (
    <div
      className={`group flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-white border shadow-sm transition-all ${
        completing ? 'task-completing'
        : deleting  ? 'task-deleting'
        : isDragging ? 'border-[#7C9A7E] shadow-lg opacity-50 rotate-1 scale-[1.02]'
                     : 'border-[#E0EAE0] md:hover:border-[#C8DCC8] md:hover:shadow'
      }`}
    >
      <span
        {...dragListeners} {...dragAttributes}
        className="shrink-0 flex items-center text-[#D0DDD0] md:group-hover:text-[#A8BAA8] cursor-grab active:cursor-grabbing touch-none select-none transition-colors p-1 -ml-1"
      >
        <GripVertical size={16} />
      </span>

      <button
        onClick={handleComplete}
        className="shrink-0 -m-1 p-1 rounded-full transition-all active:scale-90 group/check"
      >
        <div
          className={`w-[20px] h-[20px] rounded-full border-2 transition-all group-hover/check:scale-110 ${completing ? 'scale-125' : ''}`}
          style={{
            borderColor: completing ? cat.color : '#C0D0BF',
            backgroundColor: completing ? cat.color + '33' : 'transparent',
          }}
          onMouseEnter={e => { if (!completing) { e.currentTarget.style.borderColor = cat.color; e.currentTarget.style.backgroundColor = cat.color + '22' } }}
          onMouseLeave={e => { if (!completing) { e.currentTarget.style.borderColor = '#C0D0BF'; e.currentTarget.style.backgroundColor = 'transparent' } }}
        />
      </button>

      {isEditing ? (
        <input
          autoFocus
          value={editText}
          onChange={e => onEditChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(task.id); if (e.key === 'Escape') onCancelEdit() }}
          onBlur={() => onSaveEdit(task.id)}
          className="flex-1 text-[#3D4A3E] outline-none bg-transparent border-b pb-px"
          style={{ borderColor: cat.color, fontSize: 16 }}
        />
      ) : (
        <span className="flex-1 text-[#3D4A3E] select-none leading-snug" style={{ fontSize: 14 }}>{task.text}</span>
      )}

      {!isEditing && (
        <div className="flex items-center gap-0.5 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onStartEdit(task.id, task.text)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[#C0D0BF] hover:text-[#7C9A7E] active:bg-[#EEF3EC] transition-all"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={handleDelete}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[#C8BEB4] hover:text-rose-400 active:bg-rose-50 transition-all"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Archive Row ────────────────────────────────────────────────────────────

function ArchiveRow({ task, cat, onRestore, onDelete }) {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-white border border-[#EAEAE8] shadow-sm">
      <div className="shrink-0 w-[20px] h-[20px] rounded-full flex items-center justify-center" style={{ backgroundColor: cat.color }}>
        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <span className="flex-1 leading-snug line-through text-[#9BAA9C] select-none" style={{ fontSize: 14 }}>{task.text}</span>
      <button onClick={() => onRestore(task.id)} className="text-[12px] text-[#9BAA9C] hover:text-[#5A7A5C] px-3 h-9 rounded-lg hover:bg-[#EEF3EC] transition-all font-medium shrink-0">
        Restore
      </button>
      <button onClick={() => onDelete(task.id)} className="w-9 h-9 flex items-center justify-center rounded-lg text-[#C8BEB4] hover:text-rose-400 active:bg-rose-50 transition-all shrink-0">
        <X size={16} />
      </button>
    </div>
  )
}

// ── Search Row ─────────────────────────────────────────────────────────────

function SearchRow({ task, cat, isEditing, editText, onEditChange, onStartEdit, onSaveEdit, onCancelEdit, onArchive, onDelete }) {
  return (
    <div className="group flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-white border border-[#E0EAE0] shadow-sm">
      <button onClick={() => onArchive(task.id)} className="shrink-0 -m-1 p-1 rounded-full active:scale-90 transition-transform">
        <div className="w-[20px] h-[20px] rounded-full border-2" style={{ borderColor: '#C0D0BF' }} />
      </button>
      {isEditing ? (
        <input
          autoFocus value={editText}
          onChange={e => onEditChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(task.id); if (e.key === 'Escape') onCancelEdit() }}
          onBlur={() => onSaveEdit(task.id)}
          className="flex-1 text-[#3D4A3E] outline-none bg-transparent border-b pb-px"
          style={{ borderColor: cat.color, fontSize: 16 }}
        />
      ) : (
        <span className="flex-1 text-[#3D4A3E] select-none leading-snug" style={{ fontSize: 14 }}>{task.text}</span>
      )}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[11px] font-semibold px-2 py-1 rounded-full flex items-center gap-1" style={{ backgroundColor: cat.light, color: cat.dark }}>
          <CatIcon cat={cat} size={10} />
          {cat.name}
        </span>
        {!isEditing && (
          <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <button onClick={() => onStartEdit(task.id, task.text)} className="w-9 h-9 flex items-center justify-center rounded-lg text-[#C0D0BF] hover:text-[#7C9A7E] active:bg-[#EEF3EC] transition-all">
              <Pencil size={14} />
            </button>
            <button onClick={() => onDelete(task.id)} className="w-9 h-9 flex items-center justify-center rounded-lg text-[#C8BEB4] hover:text-rose-400 active:bg-rose-50 transition-all">
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── New Category Form ──────────────────────────────────────────────────────

function NewCatForm({ name, setName, color, setColor, icon, setIcon, onSubmit, onClose, mobile }) {
  const PreviewIcon = ICON_MAP[icon]
  return (
    <form onSubmit={onSubmit} className={mobile ? '' : 'mx-1 mt-1 p-3 bg-white rounded-xl border border-[#D5E2D4] shadow-sm'}>
      {/* Name + live icon preview */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors" style={{ backgroundColor: color.light }}>
          {PreviewIcon && <PreviewIcon size={16} style={{ color: color.color }} strokeWidth={1.8} />}
        </div>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onClose()}
          placeholder="List name…"
          className={`flex-1 text-[#3D4A3E] placeholder-[#BFC9C0] outline-none border-b border-[#E0EAE0] pb-1.5 ${mobile ? 'text-base' : 'text-[13px]'}`}
          style={mobile ? { fontSize: 16 } : {}}
        />
      </div>

      {/* Color swatches */}
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9BAA9C] mb-1.5">Color</p>
      <div className={`flex gap-2 flex-wrap ${mobile ? 'mb-4' : 'mb-3'}`}>
        {PALETTE.map(p => (
          <button
            key={p.color} type="button" onClick={() => setColor(p)}
            className={`rounded-full transition-transform hover:scale-110 active:scale-95 ${mobile ? 'w-7 h-7' : 'w-5 h-5'}`}
            style={{ backgroundColor: p.color, outline: color.color === p.color ? `2.5px solid ${p.color}` : 'none', outlineOffset: 2 }}
          />
        ))}
      </div>

      {/* Icon picker */}
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9BAA9C] mb-1.5">Icon</p>
      <div className={`grid grid-cols-8 gap-1 ${mobile ? 'mb-5' : 'mb-3'}`}>
        {CUSTOM_ICONS.map(name => {
          const Ic = ICON_MAP[name]
          if (!Ic) return null
          const selected = icon === name
          return (
            <button
              key={name} type="button" onClick={() => setIcon(name)}
              className={`rounded-lg flex items-center justify-center transition-all active:scale-90 ${mobile ? 'w-9 h-9' : 'w-7 h-7'}`}
              style={{
                backgroundColor: selected ? color.color + '22' : 'transparent',
                color: selected ? color.color : '#9BAA9C',
                outline: selected ? `1.5px solid ${color.color}55` : 'none',
              }}
            >
              <Ic size={mobile ? 17 : 14} strokeWidth={1.8} />
            </button>
          )
        })}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className={`flex-1 rounded-xl text-white font-semibold hover:opacity-80 active:scale-95 transition-all ${mobile ? 'py-3 text-[15px]' : 'py-1.5 text-[11px]'}`}
          style={{ backgroundColor: color.color }}
        >
          Add List
        </button>
        <button
          type="button" onClick={onClose}
          className={`flex-1 rounded-xl font-medium text-[#9BAA9C] bg-[#F0F2EF] hover:bg-[#E5E8E4] transition-colors ${mobile ? 'py-3 text-[15px]' : 'py-1.5 text-[11px]'}`}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Settings Page ──────────────────────────────────────────────────────────

function SettingsPage({ categories, tasks, onUpdate, onDelete, onAdd, onClearArchive, onClearCatArchive }) {
  const [editingId, setEditingId]   = useState(null)
  const [editName, setEditName]     = useState('')
  const [editColor, setEditColor]   = useState(PALETTE[0])
  const [editIcon, setEditIcon]     = useState(CUSTOM_ICONS[0])
  const [deletingId, setDeletingId] = useState(null)
  const [showAdd, setShowAdd]       = useState(false)
  const [addName, setAddName]       = useState('')
  const [addColor, setAddColor]     = useState(PALETTE[0])
  const [addIcon, setAddIcon]       = useState(CUSTOM_ICONS[0])

  const startEdit = cat => {
    setEditingId(cat.id)
    setEditName(cat.name)
    setEditColor(PALETTE.find(p => p.color === cat.color) ?? { color: cat.color, light: cat.light, dark: cat.dark })
    setEditIcon(cat.iconName ?? CUSTOM_ICONS[0])
    setDeletingId(null)
    setShowAdd(false)
  }

  const saveEdit = () => {
    if (!editName.trim()) return
    onUpdate(editingId, { name: editName.trim(), iconName: editIcon, ...editColor })
    setEditingId(null)
  }

  const handleAdd = e => {
    e.preventDefault()
    if (!addName.trim()) return
    onAdd({ name: addName.trim(), iconName: addIcon, ...addColor })
    setAddName(''); setAddColor(PALETTE[0]); setAddIcon(CUSTOM_ICONS[0]); setShowAdd(false)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-7">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#EEF3EC]">
          <Settings size={20} style={{ color: '#7C9A7E' }} strokeWidth={1.75} />
        </div>
        <h2 className="text-xl font-semibold text-[#3D4A3E]">Settings</h2>
      </div>

      {/* Lists section */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9BAA9C] mb-3">Lists</p>
      <div className="space-y-2">
        {categories.map(cat => {
          const activeCount   = tasks.filter(t => t.category === cat.id && !t.archived).length
          const archivedCount = tasks.filter(t => t.category === cat.id &&  t.archived).length
          const isEditing  = editingId  === cat.id
          const isDeleting = deletingId === cat.id
          const previewCat = isEditing
            ? { iconName: editIcon, color: editColor.color, light: editColor.light, dark: editColor.dark }
            : cat

          return (
            <div key={cat.id} className="bg-white rounded-2xl border border-[#E0EAE0] shadow-sm overflow-hidden">

              {/* Row */}
              {!isDeleting && (
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors" style={{ backgroundColor: previewCat.light ?? cat.light }}>
                    <CatIcon cat={previewCat} size={18} style={{ color: previewCat.color }} strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[#3D4A3E] truncate">{cat.name}</p>
                    <p className="text-[11px] text-[#9BAA9C]">
                      {activeCount} active{archivedCount > 0 ? ` · ${archivedCount} archived` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => isEditing ? setEditingId(null) : startEdit(cat)}
                      className="h-8 px-3 rounded-lg text-[12px] font-medium transition-all"
                      style={isEditing
                        ? { color: '#9BAA9C', backgroundColor: '#F0F2EF' }
                        : { color: '#7C9A7E', backgroundColor: '#EEF3EC' }
                      }
                    >
                      {isEditing ? 'Cancel' : 'Edit'}
                    </button>
                    <button
                      onClick={() => { setDeletingId(cat.id); setEditingId(null) }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-[#C8BEB4] hover:text-rose-400 hover:bg-rose-50 transition-all"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              )}

              {/* Inline edit panel */}
              {isEditing && !isDeleting && (
                <div className="px-4 pb-4 border-t border-[#F0F4EF] pt-3 space-y-3">
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                    placeholder="List name"
                    className="w-full px-3 py-2.5 rounded-xl border text-[14px] text-[#3D4A3E] outline-none transition-all"
                    style={{ borderColor: editColor.color + '88', fontSize: 16 }}
                  />

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9BAA9C] mb-2">Color</p>
                    <div className="flex gap-2 flex-wrap">
                      {PALETTE.map(p => (
                        <button
                          key={p.color} type="button" onClick={() => setEditColor(p)}
                          className="w-6 h-6 rounded-full transition-transform hover:scale-110 active:scale-95"
                          style={{ backgroundColor: p.color, outline: editColor.color === p.color ? `2.5px solid ${p.color}` : 'none', outlineOffset: 2 }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9BAA9C] mb-2">Icon</p>
                    <div className="grid grid-cols-8 gap-1">
                      {CUSTOM_ICONS.map(name => {
                        const Ic  = ICON_MAP[name]
                        const sel = editIcon === name
                        if (!Ic) return null
                        return (
                          <button
                            key={name} type="button" onClick={() => setEditIcon(name)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90"
                            style={{
                              backgroundColor: sel ? editColor.color + '22' : 'transparent',
                              color: sel ? editColor.color : '#9BAA9C',
                              outline: sel ? `1.5px solid ${editColor.color}55` : 'none',
                            }}
                          >
                            <Ic size={15} strokeWidth={1.8} />
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <button
                    onClick={saveEdit}
                    className="w-full py-2.5 rounded-xl text-white text-[13px] font-semibold hover:opacity-80 active:scale-[0.98] transition-all"
                    style={{ backgroundColor: editColor.color }}
                  >
                    Save Changes
                  </button>
                </div>
              )}

              {/* Delete confirmation */}
              {isDeleting && (
                <div className="px-4 py-4 bg-rose-50">
                  <p className="text-[13px] font-semibold text-rose-700 mb-0.5">Delete "{cat.name}"?</p>
                  {(activeCount + archivedCount) > 0 && (
                    <p className="text-[12px] text-rose-500 mb-3">
                      {activeCount + archivedCount} task{activeCount + archivedCount !== 1 ? 's' : ''} will be permanently deleted.
                    </p>
                  )}
                  {(activeCount + archivedCount) === 0 && <div className="mb-3" />}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { onDelete(cat.id); setDeletingId(null) }}
                      className="flex-1 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-[13px] font-semibold transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="flex-1 py-2 rounded-xl bg-white border border-[#E0EAE0] text-[#9BAA9C] text-[13px] font-medium hover:bg-[#F8F6F2] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Add new list */}
        <div className="bg-white rounded-2xl border border-dashed border-[#C8DAC7] shadow-sm overflow-hidden">
          {showAdd ? (
            <div className="p-4">
              <p className="text-[12px] font-semibold text-[#5A6B5C] mb-3">New List</p>
              <NewCatForm
                name={addName} setName={setAddName}
                color={addColor} setColor={setAddColor}
                icon={addIcon}  setIcon={setAddIcon}
                onSubmit={handleAdd}
                onClose={() => { setShowAdd(false); setAddName('') }}
              />
            </div>
          ) : (
            <button
              onClick={() => { setShowAdd(true); setEditingId(null); setDeletingId(null) }}
              className="w-full flex items-center gap-2.5 px-4 py-3.5 text-[#9BAA9C] hover:text-[#7C9A7E] hover:bg-[#F4F8F4] transition-all"
            >
              <Plus size={16} />
              <span className="text-[13px] font-medium">New List</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Archive section ── */}
      <ArchiveSettings tasks={tasks} categories={categories} onClearAll={onClearArchive} onClearCat={onClearCatArchive} />
    </div>
  )
}

// ── Archive Settings section ───────────────────────────────────────────────

function ArchiveSettings({ tasks, categories, onClearAll, onClearCat }) {
  const [confirmClear, setConfirmClear] = useState(false)
  const totalArchived = tasks.filter(t => t.archived).length
  const catsWithArchive = categories
    .map(c => ({ ...c, count: tasks.filter(t => t.archived && t.category === c.id).length }))
    .filter(c => c.count > 0)

  return (
    <div className="mt-8">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9BAA9C] mb-3">Archive</p>

      <div className="bg-white rounded-2xl border border-[#E0EAE0] shadow-sm overflow-hidden">
        {/* Summary row */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#F0F4EF]">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#F0F2EE]">
            <Archive size={18} style={{ color: '#9BAA9C' }} strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-medium text-[#3D4A3E]">Completed Tasks</p>
            <p className="text-[11px] text-[#9BAA9C]">{totalArchived} task{totalArchived !== 1 ? 's' : ''} archived</p>
          </div>
          {totalArchived > 0 && !confirmClear && (
            <button
              onClick={() => setConfirmClear(true)}
              className="h-8 px-3 rounded-lg text-[12px] font-medium text-rose-400 hover:bg-rose-50 transition-all"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Confirm clear all */}
        {confirmClear && (
          <div className="px-4 py-3.5 bg-rose-50 border-b border-rose-100">
            <p className="text-[13px] font-semibold text-rose-700 mb-0.5">Clear entire archive?</p>
            <p className="text-[12px] text-rose-500 mb-3">{totalArchived} completed task{totalArchived !== 1 ? 's' : ''} will be permanently deleted.</p>
            <div className="flex gap-2">
              <button
                onClick={() => { onClearAll(); setConfirmClear(false) }}
                className="flex-1 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-[13px] font-semibold transition-colors"
              >
                Clear all
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="flex-1 py-2 rounded-xl bg-white border border-[#E0EAE0] text-[#9BAA9C] text-[13px] font-medium hover:bg-[#F8F6F2] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Per-category breakdown */}
        {totalArchived === 0 && (
          <div className="px-4 py-5 text-center">
            <p className="text-[13px] text-[#B5C4B6]">Nothing archived yet.</p>
          </div>
        )}
        {catsWithArchive.map((c, i) => (
          <div
            key={c.id}
            className={`flex items-center gap-3 px-4 py-3 ${i < catsWithArchive.length - 1 ? 'border-b border-[#F4F6F3]' : ''}`}
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: c.light }}>
              <CatIcon cat={c} size={14} style={{ color: c.color }} strokeWidth={1.75} />
            </div>
            <span className="flex-1 text-[13px] text-[#5A6B5C]">{c.name}</span>
            <span className="text-[12px] text-[#9BAA9C] mr-2">{c.count} completed</span>
            <button
              onClick={() => onClearCat(c.id)}
              className="text-[11px] text-[#C8BEB4] hover:text-rose-400 transition-colors px-1 py-0.5"
            >
              Clear
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── CatIcon helper — renders a Lucide icon if iconName is set ──────────────

function CatIcon({ cat, size = 16, style, strokeWidth = 1.75 }) {
  const Comp = cat?.iconName ? ICON_MAP[cat.iconName] : null
  if (Comp) return <Comp size={size} style={style} strokeWidth={strokeWidth} />
  // Legacy fallback for any old saved data without iconName
  return <span style={{ fontSize: size * 0.85, lineHeight: 1, ...style }}>{cat?.icon || '●'}</span>
}
