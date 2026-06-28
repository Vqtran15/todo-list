import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { supabase } from './supabase.js'
import AuthScreen from './Auth.jsx'
import {
  DndContext, DragOverlay, closestCenter,
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
  Plus, Search, Pencil, X, GripVertical, Settings, ChevronDown,
  Square, SquareCheck, ListPlus, ListChecks, Trash2, MoreHorizontal, CheckCircle2,
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
  { id: 'groceries', name: 'Groceries', iconName: 'shopping-cart',   color: '#B89A6A', light: '#F6F0E4', dark: '#8A6E42', custom: false },
  { id: 'projects',  name: 'Projects',  iconName: 'folder-kanban',   color: '#7A9BB5', light: '#EAF0F6', dark: '#4A6B85', custom: false },
]

const STARRED_CAT = {
  id: 'starred', name: 'Starred', iconName: 'star',
  color: '#C4A93A', light: '#FBF6E3', dark: '#8A7020',
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
  { id: 1, text: 'Tap the circle to complete a task', category: 'general',   archived: false },
  { id: 2, text: 'Eggs, milk, avocados',              category: 'groceries', archived: false },
  { id: 3, text: 'Define project milestones',         category: 'projects',  archived: false },
]

// ── Supabase ↔ app shape mappers ───────────────────────────────────────────

const catToDb  = (c, i) => ({ id: c.id, name: c.name, icon_name: c.iconName, color: c.color, light: c.light, dark: c.dark, custom: c.custom ?? false, sort_order: i })
const dbToCat  = r => ({ id: r.id, name: r.name, iconName: r.icon_name, color: r.color, light: r.light, dark: r.dark, custom: r.custom })
const taskToDb = (t, i) => ({ id: t.id, text: t.text, category: t.category, archived: t.archived, starred: t.starred ?? false, subtasks: t.subtasks ?? [], sort_order: i })
const dbToTask = r => ({ id: r.id, text: r.text, category: r.category, archived: r.archived, starred: r.starred ?? false, subtasks: r.subtasks ?? [] })

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
  const swReg = useRef(null)
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegistered(r) { swReg.current = r },
  })
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') swReg.current?.update() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const [categories, setCategories] = useState([])
  const [tasks, setTasks]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [active, setActive]         = useState('general')
  const [prevActive, setPrevActive] = useState('general')
  const [viewKey, setViewKey]       = useState(0)
  const [navDir, setNavDir]         = useState('none')
  const [text, setText]             = useState('')
  const [search, setSearch]         = useState('')
  const [editingId, setEditingId]     = useState(null)
  const [editText, setEditText]       = useState('')
  const [detailTaskId, setDetailTaskId] = useState(null)
  const [newTaskId, setNewTaskId]   = useState(null)
  const [searchOpen, setSearchOpen]   = useState(false)
  const [dragActiveId, setDragActiveId] = useState(null)
  const [mobileAddOpen, setMobileAddOpen] = useState(false)
  const [kbOffset, setKbOffset]           = useState(0)
  const [clearingIds, setClearingIds] = useState(new Set())
  const clearingOrderMap              = useRef(new Map())
  const inputRef = useRef()
  const textRef = useRef('')
  const mobileFormRef = useRef()
  const [user, setUser]             = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [toast, setToast]           = useState(null)
  const toastTimer                  = useRef(null)
  const undoStackRef                = useRef([])
  const [sortBy, setSortBy]         = useState(() => {
    try { return JSON.parse(localStorage.getItem('todo-sort-by')) || {} } catch { return {} }
  })
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [selectMode, setSelectMode]       = useState(false)
  const [selectBarClosing, setSelectBarClosing] = useState(false)
  const [movePicker, setMovePicker]       = useState(false)
  const [completedOpen, setCompletedOpen]       = useState(false)
  const [completedClosing, setCompletedClosing] = useState(false)

  const closeCompleted = () => {
    setCompletedClosing(true)
    setTimeout(() => { setCompletedOpen(false); setCompletedClosing(false) }, 180)
  }

  useEffect(() => { setCompletedOpen(false); setCompletedClosing(false) }, [active])
  useEffect(() => { setDetailTaskId(null) }, [active])
  useEffect(() => { textRef.current = text }, [text])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
      if (!session) {
        setCategories([])
        setTasks([])
        setLoading(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const showToast = (msg, type = 'error') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('realtime-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, ({ new: row }) => {
        setTasks(p => p.some(t => t.id === row.id) ? p : [...p, dbToTask(row)])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, ({ new: row }) => {
        setTasks(p => p.map(t => t.id === row.id ? { ...t, ...dbToTask(row) } : t))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, ({ old: row }) => {
        setTasks(p => p.filter(t => t.id !== row.id))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'categories' }, ({ new: row }) => {
        setCategories(p => p.some(c => c.id === row.id) ? p : [...p, dbToCat(row)])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'categories' }, ({ new: row }) => {
        setCategories(p => p.map(c => c.id === row.id ? { ...c, ...dbToCat(row) } : c))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'categories' }, ({ old: row }) => {
        setCategories(p => p.filter(c => c.id !== row.id))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  const prevKbOffset = useRef(0)
  useEffect(() => {
    if (!mobileAddOpen) { setKbOffset(0); prevKbOffset.current = 0; return }
    const update = () => {
      const vv = window.visualViewport
      const next = vv ? Math.max(0, window.innerHeight - vv.height) : 0
      if (prevKbOffset.current > 0 && next === 0) {
        if (textRef.current.trim()) {
          // Keyboard dismissed with text — submit the task
          mobileFormRef.current?.requestSubmit()
        } else {
          setMobileAddOpen(false)
          setText('')
        }
      }
      prevKbOffset.current = next
      setKbOffset(next)
    }
    window.visualViewport?.addEventListener('resize', update)
    update()
    return () => { window.visualViewport?.removeEventListener('resize', update); setKbOffset(0) }
  }, [mobileAddOpen])

  useEffect(() => {
    if (!user) return
    async function load() {
      setLoading(true)
      const [catsRes, tasksRes] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('tasks').select('*').order('sort_order'),
      ])

      if (catsRes.error)  console.error('[supabase] categories:', catsRes.error)
      if (tasksRes.error) console.error('[supabase] tasks:',      tasksRes.error)

      const dbCats  = catsRes.data
      const dbTasks = tasksRes.data

      let cats, tsk
      const firstRun = !dbCats || dbCats.length === 0

      if (firstRun) {
        cats = DEFAULT_CATEGORIES
        const { error } = await supabase.from('categories').insert(cats.map((c, i) => ({ ...catToDb(c, i), user_id: user.id })))
        if (error) console.error('[supabase] seed categories:', error)
        const now = Date.now()
        tsk = SEED.map((t, i) => ({ ...t, id: now + i }))
        const { error: te } = await supabase.from('tasks').insert(tsk.map((t, i) => ({ ...taskToDb(t, i), user_id: user.id })))
        if (te) console.error('[supabase] seed tasks:', te)
      } else {
        cats = dbCats.map(dbToCat)
        tsk  = dbTasks ? dbTasks.map(dbToTask) : []
      }

      setCategories(cats)
      setTasks(tsk)
      const saved = localStorage.getItem('todo-last-active')
      const validId = cats.find(c => c.id === saved) ? saved : cats[0]?.id
      if (validId) setActive(validId)
      setLoading(false)
    }
    load()
  }, [user])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const isSettings   = active === 'settings'
  const isStarred    = active === 'starred'
  const isSearching  = search.trim().length > 0 && !isSettings
  const cat          = categories.find(c => c.id === active)
  const prevCat      = categories.find(c => c.id === prevActive)
  const themeColor   = isStarred ? '#C4A93A' : (cat?.color ?? prevCat?.color ?? '#7C9A7E')
  const themeDark    = isStarred ? '#8A7020' : (cat?.dark  ?? prevCat?.dark  ?? '#4A6B4C')
  const themeLight   = isStarred ? '#FBF6E3' : (cat?.light ?? prevCat?.light ?? '#EEF3EC')
  const starredTasks = tasks.filter(t => t.starred && !t.archived)
  const detailTask   = detailTaskId ? tasks.find(t => t.id === detailTaskId && !t.archived) : null
  const activeTasks  = tasks.filter(t => t.category === active && !t.archived)
  const currentSort  = sortBy[active] || 'manual'
  const displayTasks = (() => {
    const t = [...activeTasks]
    if (currentSort === 'date-desc')  return t.sort((a, b) => b.id - a.id)
    if (currentSort === 'date-asc')   return t.sort((a, b) => a.id - b.id)
    if (currentSort === 'starred')    return t.sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0))
    return t
  })()
  const searchResults = isSearching
    ? tasks.filter(t => !t.archived && t.text.toLowerCase().includes(search.toLowerCase()))
    : []

  const add = e => {
    e.preventDefault()
    if (!text.trim()) return
    const newTask = { id: Date.now(), text: text.trim(), category: active, archived: false, starred: false, subtasks: [] }
    const sortPos = -(tasks.filter(t => t.category === active && !t.archived).length + 1)
    setTasks(p => [newTask, ...p])
    setNewTaskId(newTask.id)
    setTimeout(() => setNewTaskId(null), 400)
    setText('')
    inputRef.current?.focus()
    const prevTasks = tasks
    supabase.from('tasks').insert({ ...taskToDb(newTask, 0), sort_order: sortPos, user_id: user.id })
      .then(({ error }) => { if (error) { setTasks(prevTasks); showToast('Failed to add task.') } })
  }

  const archive = id => {
    const prev = tasks
    undoStackRef.current = [{ type: 'complete', taskId: id }, ...undoStackRef.current].slice(0, 10)
    setTasks(p => p.map(t => t.id === id ? { ...t, archived: true } : t))
    supabase.from('tasks').update({ archived: true }).eq('id', id)
      .then(({ error }) => { if (error) { setTasks(prev); showToast('Failed to complete task.') } })
  }
  const restore = id => {
    const prev = tasks
    setTasks(p => p.map(t => t.id === id ? { ...t, archived: false } : t))
    supabase.from('tasks').update({ archived: false }).eq('id', id)
      .then(({ error }) => { if (error) { setTasks(prev); showToast('Failed to restore task.') } })
  }
  const remove = id => {
    const task = tasks.find(t => t.id === id)
    if (task) undoStackRef.current = [{ type: 'delete', task }, ...undoStackRef.current].slice(0, 10)
    const prev = tasks
    setTasks(p => p.filter(t => t.id !== id))
    supabase.from('tasks').delete().eq('id', id)
      .then(({ error }) => { if (error) { setTasks(prev); showToast('Failed to delete task.') } })
  }

  const toggleStar = id => {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    const prev = tasks
    const newVal = !task.starred
    setTasks(p => p.map(t => t.id === id ? { ...t, starred: newVal } : t))
    supabase.from('tasks').update({ starred: newVal }).eq('id', id)
      .then(({ error }) => { if (error) { setTasks(prev); showToast('Failed to update star.') } })
  }

  const updateSort = (catId, value) => {
    const next = { ...sortBy, [catId]: value }
    setSortBy(next)
    localStorage.setItem('todo-sort-by', JSON.stringify(next))
  }

  const addSubtask = (taskId, text, id = Date.now()) => {
    if (!text.trim()) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const sub = { id, text: text.trim(), done: false }
    const prev = tasks
    const updated = [...(task.subtasks || []), sub]
    setTasks(p => p.map(t => t.id === taskId ? { ...t, subtasks: updated } : t))
    supabase.from('tasks').update({ subtasks: updated }).eq('id', taskId)
      .then(({ error }) => { if (error) { setTasks(prev); showToast('Failed to add subtask.') } })
  }
  const toggleSubtask = (taskId, subId) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const prev = tasks
    const updated = task.subtasks.map(s => s.id === subId ? { ...s, done: !s.done } : s)
    setTasks(p => p.map(t => t.id === taskId ? { ...t, subtasks: updated } : t))
    supabase.from('tasks').update({ subtasks: updated }).eq('id', taskId)
      .then(({ error }) => { if (error) { setTasks(prev); showToast('Failed to update subtask.') } })
  }
  const removeSubtask = (taskId, subId) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const prev = tasks
    const updated = task.subtasks.filter(s => s.id !== subId)
    setTasks(p => p.map(t => t.id === taskId ? { ...t, subtasks: updated } : t))
    supabase.from('tasks').update({ subtasks: updated }).eq('id', taskId)
      .then(({ error }) => { if (error) { setTasks(prev); showToast('Failed to remove subtask.') } })
  }
  const editSubtask = (taskId, subId, text) => {
    if (!text.trim()) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const prev = tasks
    const updated = task.subtasks.map(s => s.id === subId ? { ...s, text: text.trim() } : s)
    setTasks(p => p.map(t => t.id === taskId ? { ...t, subtasks: updated } : t))
    supabase.from('tasks').update({ subtasks: updated }).eq('id', taskId)
      .then(({ error }) => { if (error) { setTasks(prev); showToast('Failed to update subtask.') } })
  }

  const exitSelectMode = () => {
    setSelectBarClosing(true)
    setTimeout(() => { setSelectMode(false); setSelectedIds(new Set()); setSelectBarClosing(false) }, 220)
  }
  const toggleSelect = id => setSelectedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const bulkArchive = ids => {
    const prev = tasks
    setTasks(p => p.map(t => ids.has(t.id) ? { ...t, archived: true } : t))
    exitSelectMode()
    Promise.all([...ids].map(id => supabase.from('tasks').update({ archived: true }).eq('id', id)))
      .then(results => { if (results.some(r => r.error)) { setTasks(prev); showToast('Failed to complete some tasks.') } })
  }
  const bulkRemove = ids => {
    const prev = tasks
    setTasks(p => p.filter(t => !ids.has(t.id)))
    exitSelectMode()
    Promise.all([...ids].map(id => supabase.from('tasks').delete().eq('id', id)))
      .then(results => { if (results.some(r => r.error)) { setTasks(prev); showToast('Failed to delete some tasks.') } })
  }
  const bulkMove = (ids, catId) => {
    const prev = tasks
    setTasks(p => p.map(t => ids.has(t.id) ? { ...t, category: catId } : t))
    setMovePicker(false)
    exitSelectMode()
    Promise.all([...ids].map(id => supabase.from('tasks').update({ category: catId }).eq('id', id)))
      .then(results => { if (results.some(r => r.error)) { setTasks(prev); showToast('Failed to move some tasks.') } })
  }

  const startClearArchive = (catId = null) => {
    const toDelete = tasks.filter(t => t.archived && (catId === null || t.category === catId))
    if (!toDelete.length) return
    const ids = new Set(toDelete.map(t => t.id))
    clearingOrderMap.current = new Map(toDelete.map((t, i) => [t.id, i]))
    setClearingIds(ids)
    const timeout = Math.min(toDelete.length - 1, 9) * 35 + 380
    setTimeout(() => {
      setTasks(p => p.filter(t => !ids.has(t.id)))
      setClearingIds(new Set())
      const base = supabase.from('tasks').delete().eq('archived', true)
      const q = catId ? base.eq('category', catId) : base
      q.then(({ error }) => { if (error) console.error('[supabase] clear archive:', error) })
    }, timeout)
  }

  const startEdit  = (id, cur) => { setEditingId(id); setEditText(cur) }
  const saveEdit   = id => {
    if (editText.trim()) {
      const prev = tasks
      setTasks(p => p.map(t => t.id === id ? { ...t, text: editText.trim() } : t))
      supabase.from('tasks').update({ text: editText.trim() }).eq('id', id)
        .then(({ error }) => { if (error) { setTasks(prev); showToast('Failed to save edit.') } })
    }
    setEditingId(null)
  }
  const cancelEdit = () => setEditingId(null)

  const renameTask = (id, text) => {
    if (!text.trim()) return
    const prev = tasks
    setTasks(p => p.map(t => t.id === id ? { ...t, text: text.trim() } : t))
    supabase.from('tasks').update({ text: text.trim() }).eq('id', id)
      .then(({ error }) => { if (error) { setTasks(prev); showToast('Failed to save.') } })
  }

  const handleDragEnd = ({ active: a, over }) => {
    setDragActiveId(null)
    if (!over || a.id === over.id) return
    const si = tasks.findIndex(t => t.id === a.id)
    const oi = tasks.findIndex(t => t.id === over.id)
    if (si === -1 || oi === -1) return
    const prev = tasks
    const next = [...tasks]
    const [moved] = next.splice(si, 1)
    next.splice(oi, 0, moved)
    setTasks(next)
    Promise.all(
      next
        .filter(t => t.category === active && !t.archived)
        .map((t, i) => supabase.from('tasks').update({ sort_order: i }).eq('id', t.id))
    ).then(results => {
      if (results.some(r => r.error)) { setTasks(prev); showToast('Failed to save order.') }
    })
  }

  const createCat = ({ name, iconName, color, light, dark }) => {
    const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now()
    const newCat = { id, name, iconName, color, light, dark, custom: true }
    const prevCats = categories
    setCategories(p => [...p, newCat])
    supabase.from('categories').insert({ ...catToDb(newCat, categories.length), user_id: user.id })
      .then(({ error }) => { if (error) { setCategories(prevCats); showToast('Failed to create list.') } })
    return id
  }

  const updateCategory = (id, updates) => {
    const prevCats = categories
    setCategories(p => p.map(c => c.id === id ? { ...c, ...updates } : c))
    const dbUp = {}
    if (updates.name     !== undefined) dbUp.name      = updates.name
    if (updates.iconName !== undefined) dbUp.icon_name = updates.iconName
    if (updates.color    !== undefined) dbUp.color     = updates.color
    if (updates.light    !== undefined) dbUp.light     = updates.light
    if (updates.dark     !== undefined) dbUp.dark      = updates.dark
    supabase.from('categories').update(dbUp).eq('id', id)
      .then(({ error }) => { if (error) { setCategories(prevCats); showToast('Failed to update list.') } })
  }

  const deleteCategory = id => {
    const prevCats = categories
    const prevTasks = tasks
    setCategories(p => p.filter(c => c.id !== id))
    setTasks(p => p.filter(t => t.category !== id))
    if (active === id) setActive('general')
    supabase.from('categories').delete().eq('id', id)
      .then(({ error }) => { if (error) { setCategories(prevCats); setTasks(prevTasks); showToast('Failed to delete list.') } })
    supabase.from('tasks').delete().eq('category', id)
      .then(({ error }) => { if (error) console.error('[supabase] delete cat tasks:', error) })
  }

  const reorderCategories = newOrder => {
    setCategories(newOrder)
    newOrder.forEach((c, i) =>
      supabase.from('categories').update({ sort_order: i }).eq('id', c.id)
        .then(({ error }) => { if (error) console.error('[supabase] reorder cat:', error) })
    )
  }
  const closeDetailPanel = useCallback(() => setDetailTaskId(null), [])

  const kbRef = useRef({})
  kbRef.current = { searchOpen, cat, isSettings, isStarred }

  const performUndoRef = useRef(null)
  performUndoRef.current = () => {
    const [top, ...rest] = undoStackRef.current
    if (!top) return
    undoStackRef.current = rest
    if (top.type === 'complete') {
      restore(top.taskId)
      showToast('Task restored', 'success')
    } else if (top.type === 'delete') {
      setTasks(p => [...p, top.task])
      supabase.from('tasks').insert({ ...taskToDb(top.task, 0), user_id: user.id })
      showToast('Deletion undone', 'success')
    }
  }

  useEffect(() => {
    const onKey = e => {
      const { searchOpen, cat, isSettings, isStarred } = kbRef.current
      const inInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (searchOpen) { setSearch(''); setSearchOpen(false) }
        else { setSearchOpen(true) }
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        performUndoRef.current?.()
      }
      if (e.key === 'n' && !inInput && !e.metaKey && !e.ctrlKey && !e.altKey && cat && !isSettings && !isStarred) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const navTo = id => {
    const catIds = categories.map(c => c.id)
    const curIdx = catIds.indexOf(active)
    const newIdx = catIds.indexOf(id)
    if (curIdx !== -1 && newIdx !== -1) {
      setNavDir(newIdx > curIdx ? 'right' : 'left')
    } else {
      setNavDir('none')
    }

    if (id === 'settings' && active === 'settings') {
      setActive(prevActive)
    } else {
      if (active !== 'settings') setPrevActive(active)
      setActive(id)
      if (id !== 'settings' && id !== 'starred') localStorage.setItem('todo-last-active', id)
    }
    setSearch('')
    setSearchOpen(false)
    setMobileAddOpen(false)
    setText('')
    setSelectMode(false)
    setSelectBarClosing(false)
    setSelectedIds(new Set())
    setViewKey(k => k + 1)
  }

  const allNavItems = [...categories]

  if (authLoading || (user && loading)) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F6F2]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[#EEF3EC] flex items-center justify-center animate-pulse">
          <ClipboardList size={20} style={{ color: '#7C9A7E' }} strokeWidth={1.75} />
        </div>
        <p className="text-[13px] text-[#9BAA9C]">Loading…</p>
      </div>
    </div>
  )

  if (!user) return <AuthScreen />

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
            const on    = active === c.id && !isSettings && !isSearching
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

        <div className="px-2.5 pb-1">
          <button
            onClick={() => navTo('starred')}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all"
            style={isStarred ? { backgroundColor: '#C4A93A22', color: '#8A7020' } : { color: '#637265' }}
          >
            <Star size={16} fill={isStarred ? 'currentColor' : 'none'} style={{ color: isStarred ? '#C4A93A' : '#9BAA9C', flexShrink: 0 }} />
            <span className={`flex-1 text-[13px] ${isStarred ? 'font-semibold' : 'font-medium'}`}>Starred</span>
            {starredTasks.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: '#C4A93A' }}>{starredTasks.length}</span>
            )}
          </button>
        </div>

        <div className="mx-4 py-3 border-t border-[#D5E2D4] flex items-center justify-between">
          <p className="text-[11px] text-[#9BAA9C]">{tasks.filter(t => !t.archived).length} active tasks</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (searchOpen) { setSearch(''); setSearchOpen(false) }
                else { if (isSettings) navTo(prevActive); setSearchOpen(true) }
              }}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all text-[#9BAA9C] hover:text-[#637265] hover:bg-[#E5EBE4]"
              style={searchOpen ? { backgroundColor: themeColor + '22', color: themeDark } : {}}
              title="Search"
            >
              <Search size={16} />
            </button>
            <button
              onClick={() => navTo('settings')}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all text-[#9BAA9C] hover:text-[#637265] hover:bg-[#E5EBE4]"
              style={isSettings ? { backgroundColor: themeColor + '22', color: themeDark } : {}}
              title="Settings"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* ════════ MAIN CONTENT ════════ */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <main id="main-scroll" className="flex-1 overflow-y-auto">
        <div key={viewKey} className={`${navDir === 'right' ? 'slide-from-right' : navDir === 'left' ? 'slide-from-left' : 'view-enter'} px-4 md:px-10 pt-5 md:pt-8 pb-36 md:pb-10 max-w-xl mx-auto md:mx-0`}>

          {/* Mobile header */}
          <div className="flex items-center justify-between mb-4 md:hidden">
            {/* Left: current view title */}
            {cat && !isSettings && !isSearching ? (
              <div className="flex items-center gap-2 min-w-0 flex-1 mr-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: cat.light }}>
                  <CatIcon cat={cat} size={16} style={{ color: cat.color }} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-[28px] font-semibold leading-tight truncate" style={{ color: cat.dark }}>{cat.name}</h2>
                  <p className="text-[12px] leading-none mt-0.5" style={{ color: cat.color }}>{activeTasks.length} remaining</p>
                </div>
              </div>
            ) : isSettings ? (
              <h2 className="text-[28px] font-semibold text-[#3D4A3E]">Settings</h2>
            ) : isStarred ? (
              <h2 className="text-[28px] font-semibold" style={{ color: '#8A7020' }}>Starred</h2>
            ) : <div />}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  if (searchOpen) { setSearch(''); setSearchOpen(false) }
                  else { if (isSettings) navTo(prevActive); setSearchOpen(true) }
                }}
                className="w-10 h-10 flex items-center justify-center rounded-xl transition-all active:scale-90"
                style={searchOpen
                  ? { backgroundColor: themeColor, color: 'white' }
                  : { backgroundColor: themeLight, color: themeColor }}
              >
                <Search size={18} strokeWidth={searchOpen ? 2.2 : 1.75} />
              </button>
              <button
                onClick={() => navTo('starred')}
                className="w-10 h-10 flex items-center justify-center rounded-xl transition-all active:scale-90 relative"
                style={isStarred
                  ? { backgroundColor: '#C4A93A', color: 'white' }
                  : { backgroundColor: themeLight, color: themeColor }}
              >
                <Star size={18} fill={isStarred ? 'currentColor' : 'none'} strokeWidth={isStarred ? 2.2 : 1.75} />
                {starredTasks.length > 0 && !isStarred && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#C4A93A]" />
                )}
              </button>
              <button
                onClick={() => navTo('settings')}
                className="w-10 h-10 flex items-center justify-center rounded-xl transition-all active:scale-90"
                style={isSettings
                  ? { backgroundColor: themeColor, color: 'white' }
                  : { backgroundColor: themeLight, color: themeColor }}
              >
                <Settings size={20} strokeWidth={isSettings ? 2.2 : 1.75} />
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
              onReorder={reorderCategories}
              onRestoreTask={restore}
              onDeleteTask={remove}
              user={user}
              onSignOut={() => supabase.auth.signOut()}
              clearingIds={clearingIds}
              clearingOrderMap={clearingOrderMap}
            />
          )}

          {/* Search input — visible when searchOpen and not on Settings */}
          {!isSettings && searchOpen && (
            <div className="mb-5 relative field-expand">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9BAA9C]" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setSearch(''); setSearchOpen(false) } }}
                placeholder="Search all tasks…"
                className="w-full pl-10 pr-9 py-3 rounded-xl bg-white border text-[#3D4A3E] placeholder-[#BFC9C0] outline-none shadow-sm transition-all"
                style={{ borderColor: isSearching ? '#7C9A7EBB' : '#DBE8DA', fontSize: 16 }}
                onFocus={e => (e.target.style.borderColor = '#7C9A7EBB')}
                onBlur={e  => (e.target.style.borderColor = isSearching ? '#7C9A7EBB' : '#DBE8DA')}
              />
              <button
                onClick={() => { setSearch(''); setSearchOpen(false) }}
                className="absolute right-0 top-0 w-11 h-full flex items-center justify-center text-[#9BAA9C] hover:text-[#637265]"
              >
                <X size={16} />
              </button>
            </div>
          )}

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
                          onToggleStar={toggleStar} onRenameTask={renameTask}
                        />
                      )
                    })}
                  </div>
                )
              }
            </>
          )}

          {/* ── Starred View ── */}
          {!isSearching && isStarred && (
            <>
              <div className="hidden md:flex items-center gap-2.5 mb-6">
                <Star size={22} style={{ color: '#C4A93A' }} strokeWidth={1.75} />
                <div>
                  <h2 className="text-xl font-semibold" style={{ color: '#8A7020' }}>Starred</h2>
                  <p className="text-xs text-[#9BAA9C] mt-0.5">{starredTasks.length} starred</p>
                </div>
              </div>
              {starredTasks.length === 0
                ? <div className="text-center py-14">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 bg-[#FBF6E3]">
                      <Star size={28} style={{ color: '#C4A93A', opacity: 0.5 }} />
                    </div>
                    <p className="text-sm text-[#B5C4B6]">No starred tasks yet — tap the star on any task.</p>
                  </div>
                : categories.map(c => {
                    const items = starredTasks.filter(t => t.category === c.id)
                    if (!items.length) return null
                    return (
                      <div key={c.id} className="mb-5">
                        <div className="flex items-center gap-1.5 mb-2">
                          <CatIcon cat={c} size={13} style={{ color: c.color }} />
                          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: c.color }}>{c.name}</span>
                        </div>
                        <div className="space-y-2">
                          {items.map(t => (
                            <SearchRow
                              key={t.id} task={t} cat={c}
                              isEditing={editingId === t.id} editText={editText}
                              onEditChange={setEditText} onStartEdit={startEdit}
                              onSaveEdit={saveEdit} onCancelEdit={cancelEdit}
                              onArchive={archive} onDelete={remove}
                              onToggleStar={toggleStar} onRenameTask={renameTask}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })
              }
            </>
          )}

          {/* ── Category View ── */}
          {!isSearching && !isStarred && cat && (
            <>
              <div className="hidden md:flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: cat.light }}>
                  <CatIcon cat={cat} size={20} style={{ color: cat.color }} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold" style={{ color: cat.dark }}>{cat.name}</h2>
                  <p className="text-xs mt-0.5" style={{ color: cat.color }}>{activeTasks.length} remaining</p>
                </div>
              </div>

              <form onSubmit={add} className="mb-5 hidden md:block">
                <input
                  ref={inputRef}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setText('') }}
                  placeholder={`New task in ${cat.name}…`}
                  className="w-full px-4 py-3 rounded-xl bg-white border text-[#3D4A3E] placeholder-[#BFC9C0] outline-none shadow-sm transition-all"
                  style={{ borderColor: '#DBE8DA', fontSize: 15 }}
                  onFocus={e => (e.target.style.borderColor = cat.color + 'BB')}
                  onBlur={e => (e.target.style.borderColor = '#DBE8DA')}
                />
              </form>

              {/* Sort + Select controls */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1 flex-wrap">
                  {[
                    { value: 'manual',     label: 'Manual' },
                    { value: 'date-desc',  label: 'Newest' },
                    { value: 'date-asc',   label: 'Oldest' },
                    { value: 'starred',    label: 'Starred' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => updateSort(active, opt.value)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
                      style={currentSort === opt.value
                        ? { backgroundColor: cat.color, color: 'white' }
                        : { backgroundColor: cat.light, color: cat.color }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setSelectMode(p => !p); setSelectedIds(new Set()) }}
                  className="text-[12px] font-semibold px-3 py-1 rounded-full transition-all shrink-0 ml-2"
                  style={selectMode
                    ? { backgroundColor: cat.color, color: 'white' }
                    : { color: cat.color }}
                >
                  {selectMode ? 'Cancel' : 'Select'}
                </button>
              </div>

              {activeTasks.length === 0 ? (
                <div className="text-center py-14">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: cat.light }}>
                    <CatIcon cat={cat} size={28} style={{ color: cat.color, opacity: 0.5 }} />
                  </div>
                  <p className="text-sm text-[#B5C4B6]">
                    {tasks.filter(t => t.category === active && t.archived).length > 0
                      ? 'All done! Scroll down to see completed tasks.'
                      : <><span className="md:hidden">No tasks yet — tap + to add one!</span><span className="hidden md:inline">No tasks yet — add one above!</span></>}
                  </p>
                </div>
              ) : currentSort === 'manual' ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={({ active: a }) => setDragActiveId(a.id)}
                  onDragCancel={() => setDragActiveId(null)}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={displayTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {displayTasks.map((t, i) => (
                        <SortableTaskRow
                          key={t.id} task={t} cat={cat}
                          isNew={t.id === newTaskId} staggerIndex={i}
                          isEditing={editingId === t.id} editText={editText}
                          onEditChange={setEditText} onStartEdit={startEdit}
                          onSaveEdit={saveEdit} onCancelEdit={cancelEdit}
                          onArchive={archive} onDelete={remove} onToggleStar={toggleStar} onRenameTask={renameTask}
                          onAddSubtask={addSubtask} onToggleSubtask={toggleSubtask} onRemoveSubtask={removeSubtask} onEditSubtask={editSubtask}
                          selectMode={selectMode} isSelected={selectedIds.has(t.id)} onToggleSelect={toggleSelect}
                          onOpenDetail={id => setDetailTaskId(id)} isDetailOpen={detailTaskId === t.id}
                        />
                      ))}
                    </div>
                  </SortableContext>
                  <DragOverlay dropAnimation={null}>
                    {dragActiveId ? (() => {
                      const t = displayTasks.find(t => t.id === dragActiveId)
                      return t ? (
                        <TaskRow
                          task={t} cat={cat} overlay={true}
                          isEditing={false} editText=""
                          onEditChange={() => {}} onStartEdit={() => {}}
                          onSaveEdit={() => {}} onCancelEdit={() => {}}
                          onArchive={() => {}} onDelete={() => {}} onToggleStar={() => {}} onRenameTask={() => {}}
                          onAddSubtask={() => {}} onToggleSubtask={() => {}} onRemoveSubtask={() => {}} onEditSubtask={() => {}}
                          isDragging={true} dragListeners={{}} dragAttributes={{}}
                          selectMode={false} isSelected={false} onToggleSelect={() => {}}
                        />
                      ) : null
                    })() : null}
                  </DragOverlay>
                </DndContext>
              ) : (
                <div className="space-y-2">
                  {displayTasks.map((t, i) => (
                    <PlainTaskRow
                      key={t.id} task={t} cat={cat}
                      isNew={t.id === newTaskId} staggerIndex={i}
                      isEditing={editingId === t.id} editText={editText}
                      onEditChange={setEditText} onStartEdit={startEdit}
                      onSaveEdit={saveEdit} onCancelEdit={cancelEdit}
                      onArchive={archive} onDelete={remove} onToggleStar={toggleStar} onRenameTask={renameTask}
                      onAddSubtask={addSubtask} onToggleSubtask={toggleSubtask} onRemoveSubtask={removeSubtask} onEditSubtask={editSubtask}
                      selectMode={selectMode} isSelected={selectedIds.has(t.id)} onToggleSelect={toggleSelect}
                      onOpenDetail={id => setDetailTaskId(id)} isDetailOpen={detailTaskId === t.id}
                    />
                  ))}
                </div>
              )}

              {/* ── Completed section ── */}
              {(() => {
                const catArchived = tasks.filter(t => t.archived && t.category === active)
                if (!catArchived.length) return null
                return (
                  <div className="mt-5">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-px bg-[#E8EEE7]" />
                      <button
                        onClick={() => { if (completedOpen || completedClosing) closeCompleted(); else setCompletedOpen(true) }}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-[#9BAA9C] hover:text-[#637265] transition-colors py-1 px-2 rounded-lg hover:bg-[#F0F4EF]"
                      >
                        <ChevronDown size={12} style={{ transform: completedOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                        Completed ({catArchived.length})
                      </button>
                      {completedOpen && (
                        <button
                          onClick={() => startClearArchive(active)}
                          className="text-[11px] text-[#CABFB5] hover:text-rose-400 px-2 py-1 transition-colors"
                        >
                          Clear
                        </button>
                      )}
                      <div className="flex-1 h-px bg-[#E8EEE7]" />
                    </div>
                    {(completedOpen || completedClosing) && (
                      <div className={`space-y-2 ${completedClosing ? 'completed-section-out' : 'completed-section-in'}`}>
                        {catArchived.map(t => (
                          <ArchiveRow
                            key={t.id} task={t} cat={cat}
                            onRestore={restore} onDelete={remove}
                            clearing={clearingIds.has(t.id)}
                            clearingIndex={clearingOrderMap.current.get(t.id) ?? 0}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
            </>
          )}
        </div>
        </main>
      {detailTask && (
        <TaskDetailPanel
          task={detailTask}
          cat={categories.find(c => c.id === detailTask.category) ?? cat}
          onClose={closeDetailPanel}
          onArchive={id => { archive(id); setDetailTaskId(null) }}
          onDelete={id => { remove(id); setDetailTaskId(null) }}
          onToggleStar={toggleStar}
          onRenameTask={renameTask}
          onAddSubtask={addSubtask}
          onToggleSubtask={toggleSubtask}
          onRemoveSubtask={removeSubtask}
          onEditSubtask={editSubtask}
        />
      )}
      </div>

      {/* ════════ BULK ACTION BAR ════════ */}
      {(selectMode || selectBarClosing) && cat && (
        <div className={`fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#E0EAE0] shadow-lg md:left-60 bulk-bar ${selectBarClosing ? 'bulk-bar-out' : 'bulk-bar-in'}`}>
          <div className="flex flex-col items-center gap-2 px-4 pt-3 max-w-xl mx-auto w-full">
            <span className="text-[13px] font-semibold text-[#3D4A3E]">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Tap tasks to select'}
            </span>
            <div className="flex items-center justify-center gap-2 w-full">
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 bulk-actions-in">
                  <button onClick={() => bulkArchive(selectedIds)} className="px-3 py-2 rounded-xl text-[12px] font-semibold text-white shadow-sm" style={{ backgroundColor: cat.color }}>Complete</button>
                  <button onClick={() => setMovePicker(true)} className="px-3 py-2 rounded-xl text-[12px] font-semibold bg-[#EEF3EC] text-[#3D4A3E]">Move</button>
                  <button onClick={() => bulkRemove(selectedIds)} className="px-3 py-2 rounded-xl text-[12px] font-semibold bg-rose-50 text-rose-500 flex items-center gap-1"><Trash2 size={12} />Delete</button>
                </div>
              )}
              <button onClick={exitSelectMode} className="px-3 py-2 text-[12px] font-medium text-[#9BAA9C]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MOVE PICKER ════════ */}
      {movePicker && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }} onClick={() => setMovePicker(false)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden view-enter" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3">
              <p className="text-[15px] font-semibold text-[#3D4A3E]">Move {selectedIds.size} task{selectedIds.size !== 1 ? 's' : ''} to…</p>
            </div>
            {categories.filter(c => c.id !== active).map(c => (
              <button key={c.id} onClick={() => bulkMove(selectedIds, c.id)} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-[#F8F6F2] transition-colors border-t border-[#F0F0EE]">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: c.light }}>
                  <CatIcon cat={c} size={16} style={{ color: c.color }} />
                </div>
                <span className="text-[14px] font-medium text-[#3D4A3E]">{c.name}</span>
              </button>
            ))}
            <button onClick={() => setMovePicker(false)} className="w-full py-4 text-[13px] font-medium text-[#9BAA9C] border-t border-[#F0F0EE]">Cancel</button>
          </div>
        </div>
      )}

      {/* ════════ MOBILE FAB ════════ */}
      {cat && !selectMode && (
        <button
          onClick={() => setMobileAddOpen(true)}
          className="md:hidden fixed z-20 flex items-center justify-center w-14 h-14 rounded-full shadow-lg active:scale-90 transition-transform"
          style={{ backgroundColor: cat.color, bottom: 'calc(env(safe-area-inset-bottom) + 120px)', right: '20px' }}
        >
          <Plus size={24} className="text-white" />
        </button>
      )}

      {/* ════════ MOBILE ADD SHEET ════════ */}
      {mobileAddOpen && cat && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => { setMobileAddOpen(false); setText('') }}>
          {/* White fill to cover the iOS keyboard toolbar gap */}
          {kbOffset > 0 && (
            <div className="absolute inset-x-0 bottom-0 bg-white" style={{ height: kbOffset + 1 }} />
          )}
          <div
            className="absolute inset-x-0 bg-white rounded-t-2xl border-t border-[#E0EAE0] sheet-up"
            style={{
              bottom: kbOffset,
              paddingBottom: kbOffset > 0 ? '20px' : 'calc(env(safe-area-inset-bottom) + 20px)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-[#D0DDD0]" />
            </div>

            {/* Header row */}
            <div className="flex items-center gap-2.5 px-4 pb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: cat.light }}>
                <CatIcon cat={cat} size={14} style={{ color: cat.color }} />
              </div>
              <span className="flex-1 text-[14px] font-semibold" style={{ color: cat.dark }}>{cat.name}</span>
              <button
                type="button"
                onClick={() => { setMobileAddOpen(false); setText('') }}
                className="text-[14px] font-medium text-[#9BAA9C] active:opacity-60 px-1"
              >Cancel</button>
            </div>

            {/* Input */}
            <form ref={mobileFormRef} onSubmit={e => { add(e); if (text.trim()) setMobileAddOpen(false) }} className="px-4">
              <input
                autoFocus
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setText(''); setMobileAddOpen(false) } }}
                placeholder="New task…"
                enterKeyHint="go"
                className="w-full px-4 py-3 rounded-xl border text-[#3D4A3E] placeholder-[#BFC9C0] outline-none shadow-sm transition-colors"
                style={{ borderColor: '#DBE8DA', fontSize: 16 }}
                onFocus={e => (e.target.style.borderColor = cat.color + 'BB')}
                onBlur={e => (e.target.style.borderColor = '#DBE8DA')}
              />
            </form>
          </div>
        </div>
      )}

      {/* ════════ UPDATE BANNER ════════ */}
      {needRefresh && (
        <div className="fixed top-4 left-4 right-4 md:left-auto md:right-5 md:w-80 z-50 view-enter">
          <div className="bg-[#3D4A3E] text-white text-[13px] font-medium px-4 py-3 rounded-xl shadow-lg flex items-center justify-between gap-3">
            <span>New version available</span>
            <button
              onClick={() => updateServiceWorker(true)}
              className="shrink-0 bg-white text-[#3D4A3E] text-[12px] font-semibold px-3 py-1.5 rounded-lg active:opacity-70 transition-opacity"
              style={{ touchAction: 'manipulation' }}
            >
              Update
            </button>
          </div>
        </div>
      )}

      {/* ════════ TOAST ════════ */}
      {toast && (
        <div className="fixed bottom-24 md:bottom-5 left-4 right-4 md:left-auto md:right-5 md:w-80 z-50 view-enter">
          <div className="bg-[#3D4A3E] text-white text-[13px] font-medium px-4 py-3 rounded-xl shadow-lg">
            {toast.msg}
          </div>
        </div>
      )}

      {/* ════════ MOBILE BOTTOM NAV ════════ */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 bg-[#ECF0EA] border-t border-[#D5E2D4] z-10 flex"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)', paddingTop: '14px', paddingRight: 'env(safe-area-inset-right)' }}
      >
        <div className="relative flex-1 overflow-hidden">
          <div className="flex overflow-x-auto no-scrollbar h-full">
          {allNavItems.map(c => {
            const count = c.id === 'archive'
              ? archiveCount
              : tasks.filter(t => t.category === c.id && !t.archived).length
            const on = active === c.id && !isSearching
            return (
              <button
                key={c.id}
                onClick={() => navTo(c.id)}
                className="flex flex-col items-center justify-center flex-1 min-w-[68px] pt-2 pb-2 px-2 relative transition-colors"
                style={{ color: on ? c.color : '#9BAA9C' }}
              >
                {on && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{ backgroundColor: c.color }} />}
                <CatIcon cat={c} size={24} strokeWidth={on ? 2 : 1.6} />
                <span className="text-[11px] font-medium mt-1.5 leading-none max-w-[52px] truncate">{c.name}</span>
                {count > 0 && (
                  <span
                    className="absolute top-2 right-1/2 translate-x-5 w-4 h-4 rounded-full text-white flex items-center justify-center font-bold"
                    style={{ backgroundColor: c.color, fontSize: 9 }}
                  >
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </button>
            )
          })}
          </div>
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10" style={{ background: 'linear-gradient(to right, transparent, #ECF0EA)' }} />
        </div>
      </nav>
    </div>
  )
}

// ── Confirm modal ─────────────────────────────────────────────────────────

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden view-enter"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4">
          <p className="text-[15px] font-semibold text-[#3D4A3E] mb-1">Delete task?</p>
          <p className="text-[13px] text-[#9BAA9C] leading-snug">"{message}"</p>
        </div>
        <div className="flex border-t border-[#F0F0EE]">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 text-[14px] font-medium text-[#9BAA9C] hover:bg-[#F8F6F2] transition-colors border-r border-[#F0F0EE]"
          >
            Keep
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3.5 text-[14px] font-semibold text-rose-500 hover:bg-rose-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Task Detail Panel (desktop right pane) ─────────────────────────────────

function TaskDetailPanel({ task, cat, onClose, onArchive, onDelete, onToggleStar, onRenameTask, onAddSubtask, onToggleSubtask, onRemoveSubtask, onEditSubtask }) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleText, setTitleText]       = useState(task.text)
  const [newSubtask, setNewSubtask]     = useState('')
  const [editingSubId, setEditingSubId] = useState(null)
  const [editSubText, setEditSubText]   = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pendingDone, setPendingDone]   = useState(false)
  const [isClosing, setIsClosing]       = useState(false)
  const titleRef    = useRef()
  const subtaskRef  = useRef()
  const closeTimer  = useRef()

  const triggerClose = useCallback((cb) => {
    setIsClosing(true)
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(cb, 215)
  }, [])

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  useEffect(() => {
    setTitleText(task.text); setEditingTitle(false)
    setPendingDone(false); setNewSubtask(''); setEditingSubId(null)
    clearTimeout(closeTimer.current); setIsClosing(false)
  }, [task.id])

  useEffect(() => { if (!editingTitle) setTitleText(task.text) }, [task.text])

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape' && !editingTitle && !editingSubId && !confirmDelete) triggerClose(onClose)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editingTitle, editingSubId, confirmDelete, triggerClose, onClose])

  const saveTitle = () => {
    if (titleText.trim() && titleText.trim() !== task.text) onRenameTask(task.id, titleText.trim())
    else setTitleText(task.text)
    setEditingTitle(false)
  }

  const startEditTitle = () => {
    setEditingTitle(true)
    setTimeout(() => { titleRef.current?.focus(); titleRef.current?.select() }, 10)
  }

  const handleAddSubtask = e => {
    e.preventDefault()
    if (!newSubtask.trim()) return
    onAddSubtask(task.id, newSubtask.trim())
    setNewSubtask('')
    subtaskRef.current?.focus()
  }

  const subtasks = task.subtasks || []
  const doneSubs = subtasks.filter(s => s.done).length

  return (
    <aside className={`hidden md:flex flex-col w-[400px] shrink-0 bg-white border-l border-[#E0EAE0] overflow-hidden ${isClosing ? 'slide-to-right' : 'slide-from-right'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F4EF] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: cat.light }}>
            <CatIcon cat={cat} size={12} style={{ color: cat.color }} />
          </div>
          <span className="text-[12px] font-semibold truncate" style={{ color: cat.color }}>{cat.name}</span>
        </div>
        <button onClick={() => triggerClose(onClose)} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#9BAA9C] hover:text-[#3D4A3E] hover:bg-[#F0F4EF] transition-colors shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div key={task.id} className="flex-1 overflow-y-auto px-5 py-5 detail-content-enter">
        {/* Title */}
        {editingTitle ? (
          <textarea
            ref={titleRef}
            value={titleText}
            onChange={e => setTitleText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTitle() }
              if (e.key === 'Escape') { setTitleText(task.text); setEditingTitle(false) }
            }}
            onBlur={saveTitle}
            rows={3}
            className="w-full font-semibold text-[#3D4A3E] outline-none resize-none border-b-2 pb-1 bg-transparent leading-snug mb-4"
            style={{ borderColor: cat.color, fontSize: 20 }}
          />
        ) : (
          <h2
            onDoubleClick={startEditTitle}
            title="Double-click to edit title"
            className="text-[20px] font-semibold text-[#3D4A3E] leading-snug mb-4 cursor-default"
          >{task.text}</h2>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {pendingDone ? (
            <>
              <button onClick={() => { setPendingDone(false); triggerClose(() => onArchive(task.id)) }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white transition-colors" style={{ backgroundColor: cat.color }}>
                <CheckCircle2 size={14} /> Done
              </button>
              <button onClick={() => setPendingDone(false)} className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#F0F4EF] text-[#637265] hover:bg-[#E4EAE3] transition-colors">
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setPendingDone(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#F0F4EF] text-[#637265] hover:bg-[#E4EAE3] transition-colors">
              <CheckCircle2 size={14} /> Mark done
            </button>
          )}
          <button title={task.starred ? 'Unstar' : 'Star'} onClick={() => onToggleStar(task.id)} className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${task.starred ? 'text-[#C4A93A]' : 'text-[#C0D0BF] hover:text-[#C4A93A]'}`}>
            <Star size={15} fill={task.starred ? 'currentColor' : 'none'} />
          </button>
          <button title="Delete" onClick={() => setConfirmDelete(true)} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#C8BEB4] hover:text-rose-400 transition-colors">
            <Trash2 size={15} />
          </button>
        </div>

        {/* Subtasks */}
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9BAA9C] mb-3">
          Subtasks{subtasks.length > 0 && ` · ${doneSubs}/${subtasks.length}`}
        </p>

        {subtasks.length > 0 && (
          <div className="space-y-1 mb-3">
            {subtasks.map(s => (
              <div key={s.id} className="group/dp flex items-start gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[#F8F6F2] transition-colors">
                <button
                  onClick={() => onToggleSubtask(task.id, s.id)}
                  className="mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all active:scale-90"
                  style={{ borderColor: s.done ? cat.color : '#C0D0BF', backgroundColor: s.done ? cat.color : 'transparent' }}
                >
                  {s.done && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                </button>
                {editingSubId === s.id ? (
                  <input
                    autoFocus value={editSubText}
                    onChange={e => setEditSubText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { onEditSubtask(task.id, s.id, editSubText); setEditingSubId(null) }
                      if (e.key === 'Escape') setEditingSubId(null)
                    }}
                    onBlur={() => { if (editSubText.trim()) onEditSubtask(task.id, s.id, editSubText); setEditingSubId(null) }}
                    className="flex-1 text-[#3D4A3E] outline-none bg-transparent border-b"
                    style={{ borderColor: cat.color, fontSize: 14 }}
                  />
                ) : (
                  <span
                    onDoubleClick={() => { setEditingSubId(s.id); setEditSubText(s.text) }}
                    className={`flex-1 leading-snug select-none cursor-default ${s.done ? 'line-through text-[#9BAA9C]' : 'text-[#3D4A3E]'}`}
                    style={{ fontSize: 14 }}
                  >{s.text}</span>
                )}
                <div className="flex items-center gap-0.5 opacity-0 group-hover/dp:opacity-100 transition-opacity shrink-0 mt-0.5">
                  <button onClick={() => { setEditingSubId(s.id); setEditSubText(s.text) }} className="w-6 h-6 flex items-center justify-center rounded text-[#C8BEB4] hover:text-[#7C9A7E] transition-colors">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => onRemoveSubtask(task.id, s.id)} className="w-6 h-6 flex items-center justify-center rounded text-[#C8BEB4] hover:text-rose-400 transition-colors">
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddSubtask}>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed hover:bg-[#F8F6F2] transition-colors" style={{ borderColor: cat.color + '55' }}>
            <Plus size={14} style={{ color: cat.color, opacity: 0.7, flexShrink: 0 }} />
            <input
              ref={subtaskRef}
              value={newSubtask}
              onChange={e => setNewSubtask(e.target.value)}
              placeholder="Add subtask…"
              className="flex-1 text-[14px] text-[#3D4A3E] placeholder-[#C0CCC0] outline-none bg-transparent"
            />
            {newSubtask.trim() && (
              <button type="submit" className="text-[11px] font-semibold px-2 py-0.5 rounded-lg text-white shrink-0" style={{ backgroundColor: cat.color }}>Add</button>
            )}
          </div>
        </form>
      </div>

      {confirmDelete && (
        <ConfirmModal
          message={task.text}
          onConfirm={() => { setConfirmDelete(false); triggerClose(() => onDelete(task.id)) }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </aside>
  )
}

// ── Sortable wrapper ───────────────────────────────────────────────────────

function SortableTaskRow(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.task.id })
  // Lock animation class at mount — prevents re-triggering when isNew clears after 400ms
  const [animClass] = useState(() => props.isNew ? 'task-entering' : 'task-stagger-in')
  const delay = props.isNew ? 0 : Math.min(props.staggerIndex, 10) * 40

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? '' : animClass}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        animationDelay: isDragging ? undefined : `${delay}ms`,
        opacity: isDragging ? 0 : undefined,
        height: isDragging ? 60 : undefined,
      }}
    >
      {!isDragging && (
        <TaskRow {...props} isDragging={false} dragListeners={listeners} dragAttributes={attributes} />
      )}
    </div>
  )
}

// ── Plain (non-sortable) task row wrapper ──────────────────────────────────

function PlainTaskRow(props) {
  const [animClass] = useState(() => props.isNew ? 'task-entering' : 'task-stagger-in')
  const delay = props.isNew ? 0 : Math.min(props.staggerIndex, 10) * 40
  return (
    <div className={animClass} style={{ animationDelay: `${delay}ms` }}>
      <TaskRow {...props} isDragging={false} dragListeners={null} dragAttributes={null} />
    </div>
  )
}

// ── Task Row ───────────────────────────────────────────────────────────────

function TaskRow({ task, cat, isEditing, editText, onEditChange, onStartEdit, onSaveEdit, onCancelEdit, onArchive, onDelete, onToggleStar, onRenameTask, isDragging, dragListeners, dragAttributes, selectMode, isSelected, onToggleSelect, onAddSubtask, onToggleSubtask, onRemoveSubtask, onEditSubtask, overlay, onOpenDetail, isDetailOpen }) {
  const [pendingComplete, setPendingComplete] = useState(false)
  const [completing, setCompleting]           = useState(false)
  const [deleting, setDeleting]               = useState(false)
  const [confirmDelete, setConfirmDelete]   = useState(false)
  const [subtasksOpen, setSubtasksOpen]     = useState(false)
  const [subtasksClosing, setSubtasksClosing] = useState(false)
  const [addingSubtask, setAddingSubtask]   = useState(false)
  const [newSubtaskText, setNewSubtaskText] = useState('')
  const [editingSubId, setEditingSubId]     = useState(null)
  const [editSubText, setEditSubText]       = useState('')
  const [removingSubIds, setRemovingSubIds] = useState(new Set())
  const [starAnim, setStarAnim]             = useState(false)
  const [unstarAnim, setUnstarAnim]         = useState(false)
  const prevStarredRef = useRef(task.starred)
  useEffect(() => {
    if (task.starred !== prevStarredRef.current) {
      const wasStarred = prevStarredRef.current
      prevStarredRef.current = task.starred
      if (task.starred) {
        setStarAnim(true)
        const t = setTimeout(() => setStarAnim(false), 700)
        return () => clearTimeout(t)
      } else if (wasStarred) {
        setUnstarAnim(true)
        const t = setTimeout(() => setUnstarAnim(false), 500)
        return () => clearTimeout(t)
      }
    }
  }, [task.starred])
  const [actionSheetOpen, setActionSheetOpen]       = useState(false)
  const [actionSheetClosing, setActionSheetClosing] = useState(false)
  const [sheetView, setSheetView]                   = useState('menu')
  const [sheetViewDir, setSheetViewDir]             = useState('forward')
  const [sheetEditText, setSheetEditText]           = useState('')
  const [sheetSubtaskText, setSheetSubtaskText]     = useState('')
  const [sheetEditSubId, setSheetEditSubId]         = useState(null)
  const [sheetEditSubText, setSheetEditSubText]     = useState('')
  const [sheetKbOffset, setSheetKbOffset]           = useState(0)
  const [pendingDeleteSubId, setPendingDeleteSubId] = useState(null)
  const subtaskInputRef  = useRef()
  const sheetEditRef     = useRef()
  const sheetSubRef      = useRef()
  const sheetEditSubRef  = useRef()

  const openActionSheet = () => {
    const main = document.getElementById('main-scroll')
    if (main) main.style.overflow = 'hidden'
    setSheetView('menu')
    setActionSheetOpen(true)
  }
  const closeActionSheet = () => {
    const main = document.getElementById('main-scroll')
    if (main) main.style.overflow = ''
    setActionSheetClosing(true)
    setTimeout(() => { setActionSheetOpen(false); setActionSheetClosing(false); setSheetView('menu'); setPendingDeleteSubId(null) }, 200)
  }
  const navigateSheet   = (view) => { setSheetViewDir('forward'); setSheetView(view) }
  const backToMenu      = () => { setSheetViewDir('back'); setSheetView('menu'); setPendingDeleteSubId(null) }
  const backToSubtasks  = () => { setSheetViewDir('back'); setSheetView('subtasks'); setSheetEditSubId(null) }

  useEffect(() => () => { document.getElementById('main-scroll')?.style.setProperty('overflow', '') }, [])

  useEffect(() => {
    if (!actionSheetOpen || sheetView === 'menu' || sheetView === 'subtasks') return
    const ref = sheetView === 'edit' ? sheetEditRef : sheetView === 'edit-subtask' ? sheetEditSubRef : sheetSubRef
    const t = setTimeout(() => ref.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [actionSheetOpen, sheetView])

  useEffect(() => {
    if (!actionSheetOpen || sheetView === 'menu' || sheetView === 'subtasks') { setSheetKbOffset(0); return }
    // 'edit', 'subtask', 'edit-subtask' views all have inputs that open the keyboard
    const update = () => {
      const vv = window.visualViewport
      setSheetKbOffset(vv ? Math.max(0, window.innerHeight - vv.offsetTop - vv.height) : 0)
    }
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    update()
    return () => {
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
      setSheetKbOffset(0)
    }
  }, [actionSheetOpen, sheetView])

  const subtasks = task.subtasks || []
  const doneSubs = subtasks.filter(s => s.done).length

  const handleComplete = () => { setCompleting(true); setTimeout(() => onArchive(task.id), 320) }
  const handleDelete   = () => { setDeleting(true);   setTimeout(() => onDelete(task.id), 260) }

  const closeSubtasks = () => {
    setSubtasksClosing(true)
    setAddingSubtask(false)
    setNewSubtaskText('')
    setTimeout(() => { setSubtasksOpen(false); setSubtasksClosing(false) }, 150)
  }

  const handleAddSubtask = e => {
    e.preventDefault()
    if (!newSubtaskText.trim()) return
    const newId = Date.now()
    onAddSubtask(task.id, newSubtaskText.trim(), newId)
    setNewSubtaskText('')
    subtaskInputRef.current?.focus()
  }

  const handleRemoveSubtask = subId => {
    setRemovingSubIds(p => new Set([...p, subId]))
    setTimeout(() => {
      onRemoveSubtask(task.id, subId)
      setRemovingSubIds(p => { const n = new Set(p); n.delete(subId); return n })
    }, 200)
  }

  const handleCardClick = (!overlay && onOpenDetail && !completing && !deleting)
    ? e => { if (!e.target.closest('button, input, textarea')) onOpenDetail(task.id) }
    : undefined

  return (
    <>
      <div
        onClick={handleCardClick}
        className={`relative group flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-white border shadow-sm transition-all ${
          !overlay && onOpenDetail && !completing && !deleting ? 'md:cursor-pointer' : ''
        } ${
          completing  ? 'task-completing'
          : deleting  ? 'task-deleting'
          : isDragging ? 'border-[#7C9A7E] shadow-lg opacity-50 rotate-1 scale-[1.02]'
          : isSelected ? 'border-[#7C9A7E]'
          : isDetailOpen ? 'shadow'
          : 'border-[#E0EAE0] md:hover:border-[#C8DCC8] md:hover:shadow'
        }`}
        style={
          isSelected ? { borderColor: cat.color }
          : isDetailOpen && !completing && !deleting ? { borderColor: cat.color, ...(task.starred ? { backgroundColor: '#FEFBF0' } : {}) }
          : task.starred && !completing && !deleting ? { backgroundColor: '#FEFBF0' }
          : undefined
        }
      >
        {/* Starred accent bar */}
        {task.starred && !completing && !deleting && (
          <div className="absolute left-0 top-[3px] bottom-[3px] w-[3px] rounded-full" style={{ backgroundColor: '#C4A93A' }} />
        )}

        {/* Select checkbox */}
        {selectMode && (
          <button onClick={() => onToggleSelect(task.id)} className="shrink-0 -m-1 p-1 transition-all active:scale-90 checkbox-in">
            <span key={String(isSelected)} className="check-pop">
              {isSelected ? <SquareCheck size={18} style={{ color: cat.color }} /> : <Square size={18} className="text-[#C0D0BF]" />}
            </span>
          </button>
        )}

        {/* Drag handle — only when sortable */}
        {dragListeners && !selectMode && (
          <span {...dragListeners} {...dragAttributes} className="shrink-0 flex items-center text-[#D0DDD0] md:group-hover:text-[#A8BAA8] cursor-grab active:cursor-grabbing touch-none select-none transition-colors p-1 -ml-1">
            <GripVertical size={16} />
          </span>
        )}

        {/* Complete circle */}
        {!selectMode && (
          <button
            onClick={() => pendingComplete ? undefined : setPendingComplete(true)}
            className="shrink-0 -m-2 p-2 md:-m-1 md:p-1 rounded-full transition-all active:scale-90 group/check"
            style={{ touchAction: 'manipulation' }}
          >
            <div
              className={`w-[22px] h-[22px] md:w-[20px] md:h-[20px] rounded-full border-2 transition-all group-hover/check:scale-110 ${completing || pendingComplete ? 'scale-110' : ''}`}
              style={{ borderColor: completing || pendingComplete ? cat.color : '#C0D0BF', backgroundColor: completing || pendingComplete ? cat.color + '33' : 'transparent' }}
              onMouseEnter={e => { if (!completing && !pendingComplete) { e.currentTarget.style.borderColor = cat.color; e.currentTarget.style.backgroundColor = cat.color + '22' } }}
              onMouseLeave={e => { if (!completing && !pendingComplete) { e.currentTarget.style.borderColor = '#C0D0BF'; e.currentTarget.style.backgroundColor = 'transparent' } }}
            />
          </button>
        )}

        {/* Text + subtask progress */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              autoFocus value={editText}
              onChange={e => onEditChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(task.id); if (e.key === 'Escape') onCancelEdit() }}
              onBlur={() => onSaveEdit(task.id)}
              className="w-full text-[#3D4A3E] outline-none bg-transparent border-b pb-px"
              style={{ borderColor: cat.color, fontSize: 16 }}
            />
          ) : (
            <>
              <span
                onDoubleClick={() => !overlay && onStartEdit(task.id, task.text)}
                className="text-[#3D4A3E] select-none leading-snug cursor-default"
                style={{ fontSize: 14 }}
              >{task.text}</span>
              {subtasks.length > 0 && !overlay && (
                <button onClick={() => setSubtasksOpen(p => !p)} className="flex items-center gap-1 mt-0.5">
                  <span className="text-[11px] font-medium" style={{ color: cat.color }}>{doneSubs}/{subtasks.length}</span>
                  <ChevronDown size={11} style={{ color: cat.color, transform: subtasksOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                </button>
              )}
            </>
          )}
        </div>

        {/* Action buttons */}
        {!isEditing && !selectMode && (
          <div className="flex items-center gap-0.5 shrink-0">

            {pendingComplete ? (
              <div className="flex items-center gap-1.5 actions-expand">
                <button
                  onClick={() => { setPendingComplete(false); handleComplete() }}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-all active:opacity-80"
                  style={{ backgroundColor: cat.color, touchAction: 'manipulation' }}
                >
                  Done
                </button>
                <button
                  onClick={() => setPendingComplete(false)}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[#9BAA9C] bg-[#F0F4EF] transition-all active:opacity-80"
                  style={{ touchAction: 'manipulation' }}
                >
                  Undo
                </button>
              </div>
            ) : (
              <>
                {/* ── Mobile: 3-dot trigger only ── */}
                {!overlay && (
                  <button
                    onClick={openActionSheet}
                    className="md:hidden w-11 h-11 flex items-center justify-center rounded-lg text-[#C0D0BF] transition-colors"
                    style={{ touchAction: 'manipulation' }}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                )}

                {/* ── Desktop: all 4 with hover ── */}
                <div className={`hidden md:flex items-center gap-0.5 transition-opacity ${task.starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  <button title={task.starred ? 'Unstar' : 'Star'} onClick={() => onToggleStar(task.id)} className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${task.starred ? 'text-[#C4A93A] hover:text-[#A88020]' : 'text-[#C0D0BF] hover:text-[#C4A93A]'}`}>
                    <span key={String(task.starred)} className={task.starred ? 'star-pop' : ''}><Star size={14} fill={task.starred ? 'currentColor' : 'none'} /></span>
                  </button>
                  {!overlay && (
                    <button title="Add subtask" onClick={() => { if ((subtasksOpen || subtasksClosing) && !newSubtaskText.trim()) { closeSubtasks() } else { setSubtasksOpen(true); setAddingSubtask(true) } }} className="w-9 h-9 flex items-center justify-center rounded-lg text-[#C0D0BF] hover:text-[#7C9A7E] transition-all">
                      <ListPlus size={14} />
                    </button>
                  )}
                  <button title="Edit (double-click)" onClick={() => onStartEdit(task.id, task.text)} className="w-9 h-9 flex items-center justify-center rounded-lg text-[#C0D0BF] hover:text-[#7C9A7E] active:bg-[#EEF3EC] transition-all">
                    <Pencil size={14} />
                  </button>
                  <button title="Delete" onClick={() => setConfirmDelete(true)} className="w-9 h-9 flex items-center justify-center rounded-lg text-[#C8BEB4] hover:text-rose-400 active:bg-rose-50 transition-all">
                    <Trash2 size={15} />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {confirmDelete && <ConfirmModal message={task.text} onConfirm={() => { setConfirmDelete(false); handleDelete() }} onCancel={() => setConfirmDelete(false)} />}
        {starAnim   && <Star size={22} fill="#C4A93A"  className="star-celebrate pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 z-10" style={{ color: '#C4A93A' }} />}
        {unstarAnim && <Star size={22} fill="#C4A93A"  className="star-fade     pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 z-10" style={{ color: '#C4A93A' }} />}
      </div>

      {/* Mobile action sheet — rendered in a portal to escape any transformed ancestor */}
      {(actionSheetOpen || actionSheetClosing) && createPortal(
        <div className="md:hidden fixed inset-0 z-50" onClick={sheetView === 'menu' ? closeActionSheet : undefined}>
          <div className="absolute inset-0 bg-black/25 transition-opacity duration-200" style={{ opacity: actionSheetClosing ? 0 : 1 }} />
          <div
            className={`absolute inset-x-0 bg-white rounded-t-2xl shadow-xl overflow-y-auto ${actionSheetClosing ? 'sheet-down' : 'sheet-up'}`}
            style={{
              bottom: sheetKbOffset,
              maxHeight: `calc(100vh - ${sheetKbOffset + 24}px)`,
              paddingBottom: sheetKbOffset > 0 ? '12px' : 'calc(env(safe-area-inset-bottom) + 8px)',
              transition: 'bottom 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2"><div className="w-10 h-1 rounded-full bg-[#D0DDD0]" /></div>

            {/* Animated view container */}
            <div key={sheetView} className={`overflow-hidden ${sheetViewDir === 'forward' ? 'sheet-view-right' : 'sheet-view-left'}`}>

            {/* ── Menu view ── */}
            {sheetView === 'menu' && <>
              <div className="px-5 pb-3 border-b border-[#F0F4EF]">
                <p className="text-[13px] text-[#9BAA9C] truncate">{task.text}</p>
              </div>
              <div className="py-1">
                <button onClick={() => { onToggleStar(task.id); closeActionSheet() }} className="flex items-center gap-4 w-full px-5 py-3.5 active:bg-[#F5F8F5] transition-colors" style={{ touchAction: 'manipulation' }}>
                  <Star size={18} fill={task.starred ? 'currentColor' : 'none'} style={{ color: task.starred ? '#C4A93A' : '#7C9A7E' }} />
                  <span className="text-[15px] text-[#3D4A3E]">{task.starred ? 'Unstar' : 'Star'}</span>
                </button>
                <button onClick={() => { setSheetEditText(task.text); navigateSheet('edit') }} className="flex items-center gap-4 w-full px-5 py-3.5 active:bg-[#F5F8F5] transition-colors" style={{ touchAction: 'manipulation' }}>
                  <Pencil size={18} style={{ color: '#7C9A7E' }} />
                  <span className="text-[15px] text-[#3D4A3E]">Edit Task</span>
                </button>
                {!overlay && (
                  <button onClick={() => { setSheetSubtaskText(''); navigateSheet('subtask') }} className="flex items-center gap-4 w-full px-5 py-3.5 active:bg-[#F5F8F5] transition-colors" style={{ touchAction: 'manipulation' }}>
                    <ListPlus size={18} style={{ color: '#7C9A7E' }} />
                    <span className="text-[15px] text-[#3D4A3E]">Add Subtask</span>
                  </button>
                )}
                {!overlay && subtasks.length > 0 && (
                  <button onClick={() => navigateSheet('subtasks')} className="flex items-center gap-4 w-full px-5 py-3.5 active:bg-[#F5F8F5] transition-colors" style={{ touchAction: 'manipulation' }}>
                    <ListChecks size={18} style={{ color: '#7C9A7E' }} />
                    <span className="text-[15px] text-[#3D4A3E]">View Subtasks ({subtasks.length})</span>
                  </button>
                )}
                <button onClick={() => { setConfirmDelete(true); closeActionSheet() }} className="flex items-center gap-4 w-full px-5 py-3.5 active:bg-rose-50 transition-colors" style={{ touchAction: 'manipulation' }}>
                  <Trash2 size={18} className="text-rose-400" />
                  <span className="text-[15px] text-rose-400">Delete</span>
                </button>
              </div>
              <div className="px-4 pt-1" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
                <button onClick={closeActionSheet} className="w-full py-3.5 rounded-xl bg-[#F0F4EF] text-[15px] font-medium text-[#637265] active:bg-[#E4EAE3] transition-colors" style={{ touchAction: 'manipulation' }}>
                  Cancel
                </button>
              </div>
            </>}

            {/* ── Edit view ── */}
            {sheetView === 'edit' && <>
              <div className="flex items-center gap-3 px-4 pb-3 border-b border-[#F0F4EF]">
                <button onClick={backToMenu} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#9BAA9C] active:bg-[#F0F4EF] transition-colors" style={{ touchAction: 'manipulation' }}>
                  <ChevronDown size={18} style={{ transform: 'rotate(90deg)' }} />
                </button>
                <span className="text-[14px] font-semibold text-[#3D4A3E]">Edit Task</span>
              </div>
              <div className="px-4 py-3">
                <textarea
                  ref={sheetEditRef}
                  value={sheetEditText}
                  onChange={e => setSheetEditText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') backToMenu() }}
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border text-[#3D4A3E] outline-none resize-none shadow-sm"
                  style={{ borderColor: cat.color + 'BB', fontSize: 16 }}
                />
              </div>
              <div className="px-4 flex flex-col gap-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
                <button
                  onClick={() => { if (sheetEditText.trim()) { onRenameTask(task.id, sheetEditText.trim()); closeActionSheet() } }}
                  className="w-full py-3.5 rounded-xl text-[15px] font-semibold text-white transition-colors active:opacity-80"
                  style={{ backgroundColor: cat.color, touchAction: 'manipulation' }}
                >
                  Save
                </button>
                <button onClick={backToMenu} className="w-full py-3.5 rounded-xl bg-[#F0F4EF] text-[15px] font-medium text-[#637265] active:bg-[#E4EAE3] transition-colors" style={{ touchAction: 'manipulation' }}>
                  Cancel
                </button>
              </div>
            </>}

            {/* ── Add Subtask view ── */}
            {sheetView === 'subtask' && <>
              <div className="flex items-center gap-3 px-4 pb-3 border-b border-[#F0F4EF]">
                <button onClick={backToMenu} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#9BAA9C] active:bg-[#F0F4EF] transition-colors" style={{ touchAction: 'manipulation' }}>
                  <ChevronDown size={18} style={{ transform: 'rotate(90deg)' }} />
                </button>
                <span className="text-[14px] font-semibold text-[#3D4A3E]">Add Subtask</span>
              </div>
              <div className="px-4 py-3">
                <input
                  ref={sheetSubRef}
                  value={sheetSubtaskText}
                  onChange={e => setSheetSubtaskText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && sheetSubtaskText.trim()) { onAddSubtask(task.id, sheetSubtaskText.trim(), Date.now()); closeActionSheet() }
                    if (e.key === 'Escape') backToMenu()
                  }}
                  placeholder="Subtask name…"
                  className="w-full px-4 py-3 rounded-xl border text-[#3D4A3E] placeholder-[#BFC9C0] outline-none shadow-sm"
                  style={{ borderColor: cat.color + 'BB', fontSize: 16 }}
                />
              </div>
              <div className="px-4 flex flex-col gap-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
                <button
                  onClick={() => { if (sheetSubtaskText.trim()) { onAddSubtask(task.id, sheetSubtaskText.trim(), Date.now()); closeActionSheet() } }}
                  className="w-full py-3.5 rounded-xl text-[15px] font-semibold text-white transition-colors active:opacity-80"
                  style={{ backgroundColor: cat.color, touchAction: 'manipulation' }}
                >
                  Add
                </button>
                <button onClick={backToMenu} className="w-full py-3.5 rounded-xl bg-[#F0F4EF] text-[15px] font-medium text-[#637265] active:bg-[#E4EAE3] transition-colors" style={{ touchAction: 'manipulation' }}>
                  Cancel
                </button>
              </div>
            </>}

            {/* ── Manage Subtasks view ── */}
            {sheetView === 'subtasks' && <>
              <div className="flex items-center gap-3 px-4 pb-3 border-b border-[#F0F4EF]">
                <button onClick={backToMenu} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#9BAA9C] active:bg-[#F0F4EF] transition-colors" style={{ touchAction: 'manipulation' }}>
                  <ChevronDown size={18} style={{ transform: 'rotate(90deg)' }} />
                </button>
                <span className="text-[14px] font-semibold text-[#3D4A3E]">Subtasks</span>
              </div>
              <div className="py-1">
                {subtasks.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center" style={{ borderColor: s.done ? cat.color : '#C0D0BF', backgroundColor: s.done ? cat.color : 'transparent' }}>
                      {s.done && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <span className={`flex-1 text-[14px] leading-snug ${s.done ? 'line-through text-[#9BAA9C]' : 'text-[#3D4A3E]'}`}>{s.text}</span>
                    <button
                      onClick={() => { setSheetEditSubId(s.id); setSheetEditSubText(s.text); navigateSheet('edit-subtask') }}
                      className="w-9 h-9 flex items-center justify-center rounded-lg active:bg-[#F0F4EF] transition-colors"
                      style={{ touchAction: 'manipulation' }}
                    >
                      <Pencil size={14} className="text-[#9BAA9C]" />
                    </button>
                    <button
                      onClick={() => setPendingDeleteSubId(s.id)}
                      className="w-9 h-9 flex items-center justify-center rounded-lg active:bg-rose-50 transition-colors"
                      style={{ touchAction: 'manipulation' }}
                    >
                      <Trash2 size={15} className="text-rose-400" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="px-4 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
                {pendingDeleteSubId ? (() => {
                  const sub = subtasks.find(s => s.id === pendingDeleteSubId)
                  return (
                    <div className="view-enter">
                      <p className="text-[13px] text-[#9BAA9C] text-center mb-2.5 px-1 truncate">Remove "{sub?.text}"?</p>
                      <div className="flex gap-2">
                        <button onClick={() => setPendingDeleteSubId(null)} className="flex-1 py-3 rounded-xl bg-[#F0F4EF] text-[15px] font-medium text-[#637265] active:bg-[#E4EAE3] transition-colors" style={{ touchAction: 'manipulation' }}>Cancel</button>
                        <button onClick={() => { onRemoveSubtask(task.id, pendingDeleteSubId); setPendingDeleteSubId(null); if (subtasks.length === 1) backToMenu() }} className="flex-1 py-3 rounded-xl bg-rose-50 text-[15px] font-semibold text-rose-500 active:bg-rose-100 transition-colors" style={{ touchAction: 'manipulation' }}>Remove</button>
                      </div>
                    </div>
                  )
                })() : (
                  <button onClick={backToMenu} className="w-full py-3.5 rounded-xl bg-[#F0F4EF] text-[15px] font-medium text-[#637265] active:bg-[#E4EAE3] transition-colors" style={{ touchAction: 'manipulation' }}>Done</button>
                )}
              </div>
            </>}

            {/* ── Edit Subtask view ── */}
            {sheetView === 'edit-subtask' && <>
              <div className="flex items-center gap-3 px-4 pb-3 border-b border-[#F0F4EF]">
                <button onClick={backToSubtasks} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#9BAA9C] active:bg-[#F0F4EF] transition-colors" style={{ touchAction: 'manipulation' }}>
                  <ChevronDown size={18} style={{ transform: 'rotate(90deg)' }} />
                </button>
                <span className="text-[14px] font-semibold text-[#3D4A3E]">Edit Subtask</span>
              </div>
              <div className="px-4 pt-4">
                <textarea
                  ref={sheetEditSubRef}
                  value={sheetEditSubText}
                  onChange={e => setSheetEditSubText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (sheetEditSubText.trim()) { onEditSubtask(task.id, sheetEditSubId, sheetEditSubText); backToSubtasks() } } }}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border text-[#3D4A3E] outline-none resize-none shadow-sm transition-colors"
                  style={{ borderColor: cat.color + '88', fontSize: 16 }}
                />
              </div>
              <div className="px-4 pt-3 flex gap-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
                <button
                  onClick={backToSubtasks}
                  className="flex-1 py-3.5 rounded-xl bg-[#F0F4EF] text-[15px] font-medium text-[#637265] active:bg-[#E4EAE3] transition-colors"
                  style={{ touchAction: 'manipulation' }}
                >Cancel</button>
                <button
                  onClick={() => { if (sheetEditSubText.trim()) { onEditSubtask(task.id, sheetEditSubId, sheetEditSubText); backToSubtasks() } }}
                  className="flex-1 py-3.5 rounded-xl text-[15px] font-semibold text-white transition-colors"
                  style={{ backgroundColor: cat.color, touchAction: 'manipulation' }}
                >Save</button>
              </div>
            </>}

            </div>{/* end animated view container */}
          </div>
        </div>,
        document.body
      )}

      {/* Subtasks */}
      {(subtasksOpen || subtasksClosing) && !overlay && (
        <div
          className={`ml-6 mt-1.5 mb-1 space-y-1.5 ${subtasksClosing ? 'subtask-section-out' : 'subtask-section-in'}`}
        >
          {subtasks.map((s, i) => (
            <div
              key={s.id}
              className={`group/sub flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ${removingSubIds.has(s.id) ? 'subtask-row-out' : 'subtask-row-in'}`}
              style={{ backgroundColor: cat.light, borderColor: cat.color + '40', animationDelay: removingSubIds.has(s.id) ? '0ms' : `${Math.min(i, 8) * 35}ms` }}
            >
              <button onClick={() => onToggleSubtask(task.id, s.id)} className="shrink-0 -m-1.5 p-1.5 md:-m-1 md:p-1 active:scale-90 transition-transform" style={{ touchAction: 'manipulation' }}>
                <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all" style={{ borderColor: s.done ? cat.color : '#C0D0BF', backgroundColor: s.done ? cat.color : 'transparent' }}>
                  {s.done && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
              </button>
              {editingSubId === s.id ? (
                <input
                  autoFocus
                  value={editSubText}
                  onChange={e => setEditSubText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { onEditSubtask(task.id, s.id, editSubText); setEditingSubId(null) }
                    if (e.key === 'Escape') setEditingSubId(null)
                  }}
                  onBlur={() => { onEditSubtask(task.id, s.id, editSubText); setEditingSubId(null) }}
                  className="flex-1 text-[#3D4A3E] outline-none bg-transparent border-b pb-px"
                  style={{ borderColor: cat.color, fontSize: 16 }}
                />
              ) : (
                <span
                  onDoubleClick={() => { setEditingSubId(s.id); setEditSubText(s.text) }}
                  className={`flex-1 leading-snug cursor-text ${s.done ? 'line-through text-[#9BAA9C]' : 'text-[#3D4A3E]'}`}
                  style={{ fontSize: 14, touchAction: 'manipulation' }}
                >{s.text}</span>
              )}
              <button onClick={() => { setEditingSubId(s.id); setEditSubText(s.text) }} className="hidden md:flex md:opacity-0 md:group-hover/sub:opacity-100 md:w-8 md:h-8 items-center justify-center rounded-lg text-[#C8BEB4] hover:text-[#7C9A7E] active:text-[#7C9A7E] transition-all" style={{ touchAction: 'manipulation' }}>
                <Pencil size={13} />
              </button>
              <button onClick={() => handleRemoveSubtask(s.id)} className="hidden md:flex md:opacity-0 md:group-hover/sub:opacity-100 md:w-8 md:h-8 items-center justify-center rounded-lg text-[#C8BEB4] hover:text-rose-400 active:text-rose-400 transition-all" style={{ touchAction: 'manipulation' }}>
                <X size={14} />
              </button>
            </div>
          ))}
          {addingSubtask ? (
            <form onSubmit={handleAddSubtask} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border" style={{ backgroundColor: cat.light, borderColor: cat.color + '40' }}>
              <div className="w-5 h-5 rounded-full border-2 shrink-0" style={{ borderColor: cat.color + '80' }} />
              <input
                ref={subtaskInputRef} autoFocus
                value={newSubtaskText} onChange={e => setNewSubtaskText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setAddingSubtask(false); setNewSubtaskText('') } }}
                onBlur={() => { if (!newSubtaskText.trim()) { if (!task.subtasks?.length) closeSubtasks(); else setAddingSubtask(false) } }}
                placeholder="Add subtask…"
                className="flex-1 text-[#3D4A3E] placeholder-[#C0CCC0] outline-none bg-transparent"
                style={{ fontSize: 16 }}
              />
              {newSubtaskText.trim() && (
                <button type="submit" className="text-[11px] font-semibold px-2.5 py-1 rounded-lg text-white shrink-0" style={{ backgroundColor: cat.color }}>Add</button>
              )}
            </form>
          ) : subtasks.length > 0 ? (
            <button onClick={() => setAddingSubtask(true)} className="flex items-center gap-1.5 w-full px-3 py-2 rounded-xl border border-dashed transition-colors" style={{ borderColor: cat.color + '55', color: cat.color, fontSize: 13, opacity: 0.7 }}>
              <Plus size={13} />Add subtask
            </button>
          ) : null}
        </div>
      )}
    </>
  )
}

// ── Archive Row ────────────────────────────────────────────────────────────

function ArchiveRow({ task, cat, onRestore, onDelete, clearing = false, clearingIndex = 0 }) {
  const subtasks = task.subtasks ?? []
  return (
    <div
      className={`px-3.5 py-3 rounded-xl bg-white border border-[#EAEAE8] shadow-sm ${clearing ? 'task-deleting' : ''}`}
      style={clearing ? { animationDelay: `${clearingIndex * 35}ms` } : undefined}
    >
      <div className="flex items-center gap-2.5">
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
          <Trash2 size={15} />
        </button>
      </div>
      {subtasks.length > 0 && (
        <div className="ml-[28px] mt-1.5 pl-3 border-l-2 space-y-1" style={{ borderColor: cat.color + '55' }}>
          {subtasks.map(s => (
            <div key={s.id} className="flex items-center gap-2 py-0.5">
              <div className="w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center" style={{ backgroundColor: cat.color }}>
                <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-[12px] line-through text-[#B5C4B6] leading-snug">{s.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Search Row ─────────────────────────────────────────────────────────────

function SearchRow({ task, cat, isEditing, editText, onEditChange, onStartEdit, onSaveEdit, onCancelEdit, onArchive, onDelete, onToggleStar, onRenameTask }) {
  const [unstarring, setUnstarring]               = useState(false)
  const [confirmDelete, setConfirmDelete]         = useState(false)
  const [actionSheetOpen, setActionSheetOpen]     = useState(false)
  const [actionSheetClosing, setActionSheetClosing] = useState(false)
  const [sheetView, setSheetView]                 = useState('menu')
  const [sheetViewDir, setSheetViewDir]           = useState('forward')
  const [sheetEditText, setSheetEditText]         = useState('')
  const [sheetKbOffset, setSheetKbOffset]         = useState(0)
  const sheetEditRef = useRef()

  const openActionSheet  = () => { setSheetView('menu'); setActionSheetOpen(true) }
  const closeActionSheet = () => {
    setActionSheetClosing(true)
    setTimeout(() => { setActionSheetOpen(false); setActionSheetClosing(false); setSheetView('menu') }, 200)
  }
  const navigateSheet = (view) => { setSheetViewDir('forward'); setSheetView(view) }
  const backToMenu    = () => { setSheetViewDir('back'); setSheetView('menu') }

  useEffect(() => {
    if (!actionSheetOpen || sheetView !== 'edit') return
    const t = setTimeout(() => sheetEditRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [actionSheetOpen, sheetView])

  useEffect(() => {
    if (!actionSheetOpen || sheetView !== 'edit') { setSheetKbOffset(0); return }
    const update = () => {
      const vv = window.visualViewport
      setSheetKbOffset(vv ? Math.max(0, window.innerHeight - vv.offsetTop - vv.height) : 0)
    }
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    update()
    return () => {
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
      setSheetKbOffset(0)
    }
  }, [actionSheetOpen, sheetView])

  const toggleStarWithAnim = () => {
    if (task.starred) { setUnstarring(true); setTimeout(() => onToggleStar(task.id), 200) }
    else { onToggleStar(task.id) }
  }

  return (
    <>
      <div className={`group flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-white border border-[#E0EAE0] shadow-sm ${unstarring ? 'task-unstarring' : ''}`}>
        <button onClick={() => onArchive(task.id)} className="shrink-0 -m-1 p-1 rounded-full active:scale-90 transition-transform" style={{ touchAction: 'manipulation' }}>
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
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full flex items-center gap-1" style={{ backgroundColor: cat.light, color: cat.dark }}>
            <CatIcon cat={cat} size={10} />
            {cat.name}
          </span>
          {!isEditing && (
            <>
              {/* Mobile: 3-dot trigger */}
              <button onClick={openActionSheet} className="md:hidden w-11 h-11 flex items-center justify-center rounded-lg text-[#C0D0BF] transition-colors" style={{ touchAction: 'manipulation' }}>
                <MoreHorizontal size={16} />
              </button>
              {/* Desktop: full controls */}
              <div className={`hidden md:flex items-center gap-0.5 transition-opacity ${task.starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                <button onClick={toggleStarWithAnim} className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${task.starred ? 'text-[#C4A93A] hover:text-[#A88020]' : 'text-[#C0D0BF] hover:text-[#C4A93A]'}`}>
                  <span key={String(task.starred)} className={task.starred ? 'star-pop' : ''}>
                    <Star size={14} fill={task.starred ? 'currentColor' : 'none'} />
                  </span>
                </button>
                <button onClick={() => onStartEdit(task.id, task.text)} className="w-9 h-9 flex items-center justify-center rounded-lg text-[#C0D0BF] hover:text-[#7C9A7E] active:bg-[#EEF3EC] transition-all">
                  <Pencil size={14} />
                </button>
                <button onClick={() => setConfirmDelete(true)} className="w-9 h-9 flex items-center justify-center rounded-lg text-[#C8BEB4] hover:text-rose-400 active:bg-rose-50 transition-all">
                  <Trash2 size={15} />
                </button>
              </div>
            </>
          )}
        </div>
        {confirmDelete && <ConfirmModal message={task.text} onConfirm={() => { setConfirmDelete(false); onDelete(task.id) }} onCancel={() => setConfirmDelete(false)} />}
      </div>

      {/* Mobile action sheet */}
      {(actionSheetOpen || actionSheetClosing) && createPortal(
        <div className="md:hidden fixed inset-0 z-50" onClick={sheetView === 'menu' ? closeActionSheet : undefined}>
          <div className="absolute inset-0 bg-black/25 transition-opacity duration-200" style={{ opacity: actionSheetClosing ? 0 : 1 }} />
          <div
            className={`absolute inset-x-0 bg-white rounded-t-2xl shadow-xl overflow-y-auto ${actionSheetClosing ? 'sheet-down' : 'sheet-up'}`}
            style={{
              bottom: sheetKbOffset,
              maxHeight: `calc(100vh - ${sheetKbOffset + 24}px)`,
              transition: 'bottom 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-2"><div className="w-10 h-1 rounded-full bg-[#D0DDD0]" /></div>

            <div key={sheetView} className={`overflow-hidden ${sheetViewDir === 'forward' ? 'sheet-view-right' : 'sheet-view-left'}`}>

              {/* Menu */}
              {sheetView === 'menu' && <>
                <div className="px-5 pb-3 border-b border-[#F0F4EF]">
                  <p className="text-[13px] text-[#9BAA9C] truncate">{task.text}</p>
                </div>
                <div className="py-1">
                  <button onClick={() => { toggleStarWithAnim(); closeActionSheet() }} className="flex items-center gap-4 w-full px-5 py-3.5 active:bg-[#F5F8F5] transition-colors" style={{ touchAction: 'manipulation' }}>
                    <Star size={18} fill={task.starred ? 'currentColor' : 'none'} style={{ color: task.starred ? '#C4A93A' : '#7C9A7E' }} />
                    <span className="text-[15px] text-[#3D4A3E]">{task.starred ? 'Unstar' : 'Star'}</span>
                  </button>
                  <button onClick={() => { setSheetEditText(task.text); navigateSheet('edit') }} className="flex items-center gap-4 w-full px-5 py-3.5 active:bg-[#F5F8F5] transition-colors" style={{ touchAction: 'manipulation' }}>
                    <Pencil size={18} style={{ color: '#7C9A7E' }} />
                    <span className="text-[15px] text-[#3D4A3E]">Edit</span>
                  </button>
                  <button onClick={() => { setConfirmDelete(true); closeActionSheet() }} className="flex items-center gap-4 w-full px-5 py-3.5 active:bg-rose-50 transition-colors" style={{ touchAction: 'manipulation' }}>
                    <Trash2 size={18} className="text-rose-400" />
                    <span className="text-[15px] text-rose-400">Delete</span>
                  </button>
                </div>
                <div className="px-4 pt-1" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
                  <button onClick={closeActionSheet} className="w-full py-3.5 rounded-xl bg-[#F0F4EF] text-[15px] font-medium text-[#637265] active:bg-[#E4EAE3] transition-colors" style={{ touchAction: 'manipulation' }}>Cancel</button>
                </div>
              </>}

              {/* Edit */}
              {sheetView === 'edit' && <>
                <div className="flex items-center gap-3 px-4 pb-3 border-b border-[#F0F4EF]">
                  <button onClick={backToMenu} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#9BAA9C] active:bg-[#F0F4EF] transition-colors" style={{ touchAction: 'manipulation' }}>
                    <ChevronDown size={18} style={{ transform: 'rotate(90deg)' }} />
                  </button>
                  <span className="text-[14px] font-semibold text-[#3D4A3E]">Edit Task</span>
                </div>
                <div className="px-4 py-3">
                  <textarea
                    ref={sheetEditRef}
                    value={sheetEditText}
                    onChange={e => setSheetEditText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') backToMenu() }}
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl border text-[#3D4A3E] outline-none resize-none shadow-sm"
                    style={{ borderColor: cat.color + 'BB', fontSize: 16 }}
                  />
                </div>
                <div className="px-4 flex flex-col gap-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
                  <button
                    onClick={() => { if (sheetEditText.trim()) { onRenameTask(task.id, sheetEditText.trim()); closeActionSheet() } }}
                    className="w-full py-3.5 rounded-xl text-[15px] font-semibold text-white transition-colors active:opacity-80"
                    style={{ backgroundColor: cat.color, touchAction: 'manipulation' }}
                  >Save</button>
                  <button onClick={backToMenu} className="w-full py-3.5 rounded-xl bg-[#F0F4EF] text-[15px] font-medium text-[#637265] active:bg-[#E4EAE3] transition-colors" style={{ touchAction: 'manipulation' }}>Cancel</button>
                </div>
              </>}

            </div>
          </div>
        </div>,
        document.body
      )}
    </>
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
          enterKeyHint="enter"
          className={`flex-1 text-[#3D4A3E] placeholder-[#BFC9C0] outline-none border-b border-[#E0EAE0] pb-1.5 ${mobile ? 'text-base' : 'text-[13px]'}`}
          style={{ fontSize: 16 }}
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

// ── Sortable category card wrapper ─────────────────────────────────────────

function SortableCatCard({ id, className = '', children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : 'auto' }}
      className={`bg-white rounded-2xl border border-[#E0EAE0] shadow-sm overflow-hidden ${isDragging ? 'opacity-50 shadow-lg' : ''} ${className}`}
    >
      {children(listeners, attributes)}
    </div>
  )
}

// ── Settings Page ──────────────────────────────────────────────────────────

function SettingsPage({ categories, tasks, onUpdate, onDelete, onAdd, onReorder, onRestoreTask, onDeleteTask, user, onSignOut, clearingIds, clearingOrderMap }) {
  const [editingId, setEditingId]     = useState(null)
  const [editName, setEditName]       = useState('')
  const [editColor, setEditColor]     = useState(PALETTE[0])
  const [editIcon, setEditIcon]       = useState(CUSTOM_ICONS[0])
  const [deletingId, setDeletingId]   = useState(null)
  const [exitingCatId, setExitingCatId] = useState(null)
  const [newCatId, setNewCatId]       = useState(null)
  const [showAdd, setShowAdd]         = useState(false)
  const [addName, setAddName]         = useState('')
  const [addColor, setAddColor]       = useState(PALETTE[0])
  const [addIcon, setAddIcon]         = useState(CUSTOM_ICONS[0])

  const catSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const handleCatDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const oldIdx = categories.findIndex(c => c.id === active.id)
    const newIdx = categories.findIndex(c => c.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const next = [...categories]
    const [moved] = next.splice(oldIdx, 1)
    next.splice(newIdx, 0, moved)
    onReorder(next)
  }

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
    const id = onAdd({ name: addName.trim(), iconName: addIcon, ...addColor })
    setNewCatId(id)
    setTimeout(() => setNewCatId(null), 400)
    setAddName(''); setAddColor(PALETTE[0]); setAddIcon(CUSTOM_ICONS[0]); setShowAdd(false)
  }

  return (
    <div>
      {/* Header — desktop only; mobile shows title in top bar */}
      <div className="hidden md:flex items-center gap-2.5 mb-7">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#EEF3EC]">
          <Settings size={20} style={{ color: '#7C9A7E' }} strokeWidth={1.75} />
        </div>
        <h2 className="text-xl font-semibold text-[#3D4A3E]">Settings</h2>
      </div>

      {/* Lists section */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9BAA9C] mb-3">Lists</p>
      <DndContext sensors={catSensors} collisionDetection={closestCenter} onDragEnd={handleCatDragEnd}>
        <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
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
            <SortableCatCard key={cat.id} id={cat.id} className={newCatId === cat.id ? 'cat-entering' : exitingCatId === cat.id ? 'cat-exiting' : ''}>
              {(dragListeners, dragAttributes) => (<>

              {/* Row */}
              {!isDeleting && (
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span
                    {...(isEditing ? {} : dragListeners)}
                    {...(isEditing ? {} : dragAttributes)}
                    className={`shrink-0 flex items-center text-[#D0DDD0] touch-none select-none transition-colors p-1 -ml-1 ${isEditing ? 'opacity-0 pointer-events-none' : 'cursor-grab active:cursor-grabbing hover:text-[#A8BAA8]'}`}
                  >
                    <GripVertical size={16} />
                  </span>
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
                      onClick={() => {
                        setExitingCatId(cat.id)
                        setTimeout(() => { onDelete(cat.id); setExitingCatId(null); setDeletingId(null) }, 220)
                      }}
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
              </>)}
            </SortableCatCard>
          )
        })}
      </div>
        </SortableContext>
      </DndContext>

        {/* Add new list */}
        <div className="mt-2 bg-white rounded-2xl border border-dashed border-[#C8DAC7] shadow-sm overflow-hidden">
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

      {/* Account section */}
      <div className="mt-8 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9BAA9C] mb-3">Account</p>
        <div className="bg-white rounded-2xl border border-[#E0EAE0] shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-9 h-9 rounded-xl bg-[#EEF3EC] flex items-center justify-center shrink-0">
              <span className="text-[15px] font-semibold text-[#7C9A7E]">{user?.email?.[0]?.toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-[#3D4A3E] truncate">{user?.email}</p>
              <p className="text-[11px] text-[#9BAA9C]">Signed in</p>
            </div>
            <button
              onClick={onSignOut}
              className="h-8 px-3 rounded-lg text-[12px] font-medium text-rose-400 hover:bg-rose-50 transition-all shrink-0"
            >
              Sign out
            </button>
          </div>
        </div>
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
