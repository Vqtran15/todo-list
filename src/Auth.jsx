import { useState } from 'react'
import { supabase } from './supabase.js'
import { ClipboardList } from 'lucide-react'

export default function AuthScreen() {
  const [mode, setMode]         = useState('signin')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [sent, setSent]         = useState(false)

  const handle = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else if (!data.session) setSent(true)
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    }
    setLoading(false)
  }

  if (sent) return (
    <div className="min-h-screen bg-[#F8F6F2] flex items-center justify-center p-5" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#7C9A7E] flex items-center justify-center mx-auto mb-4 shadow-sm">
          <ClipboardList size={28} color="white" strokeWidth={1.75} />
        </div>
        <h2 className="text-xl font-semibold text-[#3D4A3E] mb-2">Check your email</h2>
        <p className="text-[13px] text-[#9BAA9C]">We sent a confirmation link to <strong>{email}</strong>. Click it to finish signing up.</p>
        <button onClick={() => { setSent(false); setMode('signin') }} className="mt-6 text-[13px] text-[#7C9A7E] font-semibold hover:underline">
          Back to sign in
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F8F6F2] flex items-center justify-center p-5" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#7C9A7E] flex items-center justify-center mb-3 shadow-sm">
            <ClipboardList size={30} color="white" strokeWidth={1.75} />
          </div>
          <h1 className="text-2xl font-semibold text-[#3D4A3E]">My Lists</h1>
          <p className="text-[13px] text-[#9BAA9C] mt-1">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</p>
        </div>

        {/* Form */}
        <form onSubmit={handle} className="bg-white rounded-2xl border border-[#E0EAE0] shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#9BAA9C] mb-1.5">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required autoComplete="email"
              className="w-full px-4 py-3 rounded-xl border border-[#E0EAE0] text-[#3D4A3E] placeholder-[#C0CCC0] outline-none transition-all"
              style={{ fontSize: 16 }}
              onFocus={e => (e.target.style.borderColor = '#7C9A7EBB')}
              onBlur={e  => (e.target.style.borderColor = '#E0EAE0')}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#9BAA9C] mb-1.5">Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="w-full px-4 py-3 rounded-xl border border-[#E0EAE0] text-[#3D4A3E] placeholder-[#C0CCC0] outline-none transition-all"
              style={{ fontSize: 16 }}
              onFocus={e => (e.target.style.borderColor = '#7C9A7EBB')}
              onBlur={e  => (e.target.style.borderColor = '#E0EAE0')}
            />
            {mode === 'signup' && (
              <p className="text-[11px] text-[#B5C4B6] mt-1.5">Minimum 6 characters</p>
            )}
          </div>

          {error && (
            <p className="text-[12px] text-rose-500 bg-rose-50 border border-rose-100 px-3 py-2.5 rounded-xl">{error}</p>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full py-3.5 rounded-xl bg-[#7C9A7E] hover:bg-[#6A8870] text-white font-semibold text-[15px] transition-all active:scale-[0.98] disabled:opacity-60 shadow-sm"
          >
            {loading ? '…' : mode === 'signup' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-[13px] text-[#9BAA9C] mt-5">
          {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
          <button
            onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError('') }}
            className="text-[#7C9A7E] font-semibold hover:underline"
          >
            {mode === 'signup' ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  )
}
