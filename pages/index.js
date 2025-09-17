import { useCallback, useEffect, useRef, useState } from 'react'

export default function Home() {
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [remindersEnabled, setRemindersEnabled] = useState(false)
  const audioCtxRef = useRef(null)
  const lastReminderRef = useRef(0)

  async function load() {
    setLoading(true)
    const res = await fetch('/todos')
    const data = await res.json()
    setTodos(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function addTodo(e) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    await fetch('/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: t }),
    })
    setTitle('')
    await load()
  }

  async function toggle(id) {
    await fetch(`/todos/${id}/toggle`, { method: 'POST' })
    await load()
  }

  function reorderList(list, fromId, toId) {
    if (fromId === toId) return list
    const copy = list.slice()
    const fromIndex = copy.findIndex((t) => t.id === fromId)
    const toIndex = copy.findIndex((t) => t.id === toId)
    if (fromIndex === -1 || toIndex === -1) return list
    const [moved] = copy.splice(fromIndex, 1)
    copy.splice(toIndex, 0, moved)
    return copy
  }

  async function persistOrder(list) {
    const ids = list.map((t) => t.id)
    await fetch('/todos/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
  }

  const dragId = useRef(null)

  function onDragStart(e, id) {
    dragId.current = id
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(id))
  }

  function onDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  async function onDrop(e, overId) {
    e.preventDefault()
    const dragged = dragId.current ?? parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (!dragged) return
    const next = reorderList(todos, dragged, overId)
    if (next !== todos) {
      setTodos(next)
      await persistOrder(next)
    }
    dragId.current = null
  }

  async function onDropAtEnd(e) {
    e.preventDefault()
    const dragged = dragId.current ?? parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (!dragged) return
    const copy = todos.slice()
    const fromIndex = copy.findIndex((t) => t.id === dragged)
    if (fromIndex === -1) return
    const [moved] = copy.splice(fromIndex, 1)
    copy.push(moved)
    setTodos(copy)
    await persistOrder(copy)
    dragId.current = null
  }

  const ensureAudioContext = useCallback(async () => {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume()
      }
      return audioCtxRef.current
    }
    if (typeof window === 'undefined') return null
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    const ctx = new AudioContextClass()
    audioCtxRef.current = ctx
    return ctx
  }, [])

  const isToday = useCallback((isoString) => {
    if (!isoString) return false
    const now = new Date()
    const day = new Date(isoString)
    return (
      now.getFullYear() === day.getFullYear() &&
      now.getMonth() === day.getMonth() &&
      now.getDate() === day.getDate()
    )
  }, [])

  const playReminder = useCallback(
    async (kind) => {
      const ctx = await ensureAudioContext()
      if (!ctx) return
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }
      const now = ctx.currentTime
      const master = ctx.createGain()
      master.gain.setValueAtTime(0.0001, now)
      master.connect(ctx.destination)

      const scheduleTone = (frequency, startOffset, duration, type = 'sine', gainValue = 1) => {
        const oscillator = ctx.createOscillator()
        oscillator.type = type
        oscillator.frequency.setValueAtTime(frequency, now + startOffset)
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(gainValue, now + startOffset)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration)
        oscillator.connect(gain)
        gain.connect(master)
        oscillator.start(now + startOffset)
        oscillator.stop(now + startOffset + duration)
      }

      const totalDuration = kind === 'gentle' ? 1.2 : 2.2
      const targetGain = kind === 'gentle' ? 0.25 : 0.5
      master.gain.setValueAtTime(0.0001, now)
      master.gain.exponentialRampToValueAtTime(targetGain, now + 0.05)

      if (kind === 'gentle') {
        scheduleTone(880, 0, 0.35)
        scheduleTone(660, 0.45, 0.5)
      } else {
        scheduleTone(440, 0, 0.5, 'square', 0.8)
        scheduleTone(523.25, 0.55, 0.5, 'sawtooth', 0.7)
        scheduleTone(392, 1.1, 0.5, 'square', 0.8)
        const noise = ctx.createBufferSource()
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < data.length; i += 1) {
          data[i] = Math.random() * 2 - 1
        }
        noise.buffer = buffer
        const noiseGain = ctx.createGain()
        noiseGain.gain.setValueAtTime(0.6, now + 1.6)
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.1)
        noise.connect(noiseGain)
        noiseGain.connect(master)
        noise.start(now + 1.6)
        noise.stop(now + 2.2)
      }

      master.gain.exponentialRampToValueAtTime(0.0001, now + totalDuration)
      setTimeout(() => {
        try {
          master.disconnect()
        } catch (err) {
          // noop
        }
      }, totalDuration * 1000 + 100)
    },
    [ensureAudioContext]
  )

  const maybePlayReminder = useCallback(
    async (force = false) => {
      if (!remindersEnabled) return
      if (todos.length === 0) return
      const hasIncomplete = todos.some((t) => !t.completed)
      if (!hasIncomplete) return
      const now = Date.now()
      const hour = 60 * 60 * 1000
      if (!force && now - lastReminderRef.current < hour) {
        return
      }
      const madeProgressToday = todos.some((t) => t.completed && isToday(t.completedAt))
      await playReminder(madeProgressToday ? 'gentle' : 'obnoxious')
      lastReminderRef.current = Date.now()
    },
    [isToday, playReminder, remindersEnabled, todos]
  )

  useEffect(() => {
    if (!remindersEnabled) return undefined
    maybePlayReminder(true)
    const interval = setInterval(() => {
      maybePlayReminder()
    }, 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [maybePlayReminder, remindersEnabled])

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close()
        } catch (err) {
          // noop
        }
      }
    }
  }, [])

  async function enableReminders() {
    const ctx = await ensureAudioContext()
    if (!ctx) {
      console.warn('Audio reminders are not supported in this browser.')
      return
    }
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
    lastReminderRef.current = 0
    setRemindersEnabled(true)
  }

  async function disableReminders() {
    setRemindersEnabled(false)
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      try {
        await audioCtxRef.current.suspend()
      } catch (err) {
        // noop
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 mb-6">Tasks</h1>

        <form onSubmit={addTodo} className="flex gap-2 mb-6">
          <input
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="What needs to be done?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-white shadow hover:bg-emerald-700 active:bg-emerald-800"
          >
            Add
          </button>
        </form>

        {loading ? (
          <div className="text-slate-500">Loading…</div>
        ) : (
          <div>
            <ul className="space-y-3" onDragOver={onDragOver}>
              {todos.map((todo) => (
                <li key={todo.id}>
                  <div
                    draggable
                    onDragStart={(e) => onDragStart(e, todo.id)}
                    onDragOver={onDragOver}
                    onDrop={(e) => onDrop(e, todo.id)}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                      <button
                        onClick={() => toggle(todo.id)}
                        aria-label={todo.completed ? 'Mark as incomplete' : 'Mark as complete'}
                        className={`h-6 w-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                          todo.completed
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {todo.completed ? (
                          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 10l3 3 7-7" />
                          </svg>
                        ) : (
                          <span className="block h-3 w-3 rounded-full"></span>
                        )}
                      </button>
                      <div className={`flex-1 text-slate-800 ${todo.completed ? 'line-through text-slate-400' : ''}`}>
                        {todo.title}
                      </div>
                      <div className="text-slate-400 select-none">⋮⋮</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div
              className="mt-3 h-10 rounded-xl border-2 border-dashed border-slate-300 bg-slate-100/40 text-center text-slate-400 flex items-center justify-center"
              onDragOver={onDragOver}
              onDrop={onDropAtEnd}
            >
              Drop here to move to end
            </div>
          </div>
        )}

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Need a nudge?</h2>
          <p className="mt-2 text-sm text-slate-600">
            Turn on audible reminders to hear a friendly ding-dong when you&apos;ve made progress today,
            or a more insistent one if nothing&apos;s been checked off yet.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={remindersEnabled ? disableReminders : enableReminders}
              className={`rounded-lg px-4 py-2 text-white shadow ${
                remindersEnabled
                  ? 'bg-rose-500 hover:bg-rose-600 active:bg-rose-700'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
              }`}
            >
              {remindersEnabled ? 'Disable reminders' : 'Enable reminders'}
            </button>
            {remindersEnabled ? (
              <button
                type="button"
                onClick={() => maybePlayReminder(true)}
                className="rounded-lg border border-emerald-600 px-4 py-2 text-emerald-700 hover:bg-emerald-50"
              >
                Play reminder now
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
