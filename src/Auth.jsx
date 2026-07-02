import { useState } from 'react'
import { supabase } from './supabase.js'
import { ClipboardList } from 'lucide-react'

export default function AuthScreen() {
  const [mode, setMode]                       = useState('signin')
  const [email, setEmail]                     = useState('')
  const [password, setPassword]               = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError]                     = useState('')
  const [loading, setLoading]                 = useState(false)
  const [sent, setSent]                       = useState(false)
  const [resetSent, setResetSent]             = useState(false)

  const switchMode = m => { setMode(m); setError(''); setConfirmPassword(''); setResetSent(false) }

  const handle = async e => {
    e.preventDefault()
    setError('')

    if (mode === 'forgot') {
      setLoading(true)
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      setLoading(false)
      if (error) setError(error.message)
      else setResetSent(true)
      return
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

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
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center p-5" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#7C9A7E] flex items-center justify-center mx-auto mb-4 shadow-sm">
          <ClipboardList size={28} color="white" strokeWidth={1.75} />
        </div>
        <h2 className="text-xl font-semibold text-[var(--text-1)] mb-2">Check your email</h2>
        <p className="text-[13px] text-[var(--text-3)] leading-relaxed">
          We sent a confirmation link to <strong className="text-[var(--text-med)]">{email}</strong>. Click it to finish creating your account.
        </p>
        <button onClick={() => { setSent(false); setMode('signin') }} className="mt-6 text-[13px] text-[#7C9A7E] font-semibold hover:underline">
          Back to sign in
        </button>
      </div>
    </div>
  )

  const isSignUp = mode === 'signup'
  const isForgot = mode === 'forgot'

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center p-5" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-7">
          <div className="w-16 h-16 rounded-2xl bg-[#7C9A7E] flex items-center justify-center mb-3 shadow-sm">
            <ClipboardList size={30} color="white" strokeWidth={1.75} />
          </div>
          <h1 className="text-2xl font-semibold text-[var(--text-1)]">My Lists</h1>
        </div>

        {/* Card */}
        <div className={`bg-[var(--bg-surface)] rounded-2xl shadow-sm overflow-hidden transition-all ${isSignUp ? 'border-2 border-[#7C9A7E]' : 'border border-[var(--border)]'}`}>

          {/* Segmented tab switcher — hidden in forgot mode */}
          {!isForgot && (
            <div className="flex border-b border-[var(--border-sub)]">
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className={`flex-1 py-3.5 text-[13px] font-semibold transition-all ${
                  !isSignUp
                    ? 'text-[var(--text-1)] border-b-2 border-[#7C9A7E] -mb-px'
                    : 'text-[var(--text-4)] hover:text-[#7C9A7E]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`flex-1 py-3.5 text-[13px] font-semibold transition-all ${
                  isSignUp
                    ? 'text-[var(--text-1)] border-b-2 border-[#7C9A7E] -mb-px'
                    : 'text-[var(--text-4)] hover:text-[#7C9A7E]'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          <form onSubmit={handle} className="p-6 space-y-4">

            {/* Forgot password header */}
            {isForgot && (
              <div className="pb-1">
                <p className="text-[15px] font-semibold text-[var(--text-1)]">Reset your password</p>
                <p className="text-[13px] text-[var(--text-3)] mt-1">Enter your email and we'll send a reset link.</p>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1.5">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required autoComplete="email"
                className="w-full px-4 py-3 rounded-xl border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-6)] bg-[var(--bg-surface)] outline-none transition-all"
                style={{ fontSize: 16 }}
                onFocus={e => (e.target.style.borderColor = 'var(--border-inp)')}
                onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>

            {!isForgot && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1.5">Password</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-6)] bg-[var(--bg-surface)] outline-none transition-all"
                  style={{ fontSize: 16 }}
                  onFocus={e => (e.target.style.borderColor = 'var(--border-inp)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
                />
                {isSignUp && (
                  <p className="text-[11px] text-[var(--text-4)] mt-1.5">Minimum 6 characters</p>
                )}
              </div>
            )}

            {isSignUp && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1.5">Confirm Password</label>
                <input
                  type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="new-password"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--border)] text-[var(--text-1)] placeholder-[var(--text-6)] bg-[var(--bg-surface)] outline-none transition-all"
                  style={{ fontSize: 16 }}
                  onFocus={e => (e.target.style.borderColor = 'var(--border-inp)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
                />
              </div>
            )}

            {error && (
              <p className="text-[12px] text-rose-500 bg-rose-50 border border-rose-100 px-3 py-2.5 rounded-xl">{error}</p>
            )}

            {resetSent ? (
              <div className="text-center py-1">
                <p className="text-[13px] font-semibold text-[#7C9A7E]">Reset email sent!</p>
                <p className="text-[12px] text-[var(--text-3)] mt-1">Check your inbox for a link to reset your password.</p>
                <button type="button" onClick={() => switchMode('signin')} className="mt-4 text-[13px] text-[#7C9A7E] font-semibold hover:underline">
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <button
                  type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-xl text-white font-semibold text-[15px] transition-all active:scale-[0.98] disabled:opacity-60 shadow-sm"
                  style={{ backgroundColor: '#7C9A7E' }}
                >
                  {loading ? '…' : isForgot ? 'Send Reset Email' : isSignUp ? 'Create Account' : 'Sign In'}
                </button>

                {!isSignUp && !isForgot && (
                  <p className="text-center text-[12px] text-[var(--text-3)]">
                    <button type="button" onClick={() => switchMode('forgot')} className="text-[#7C9A7E] font-semibold hover:underline">
                      Forgot password?
                    </button>
                  </p>
                )}

                {isForgot && (
                  <p className="text-center text-[12px] text-[var(--text-3)]">
                    <button type="button" onClick={() => switchMode('signin')} className="text-[#7C9A7E] font-semibold hover:underline">
                      Back to sign in
                    </button>
                  </p>
                )}
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
