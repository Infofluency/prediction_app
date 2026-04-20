'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type AuthMethod = 'email' | 'letterboxd'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode]                       = useState<'login' | 'signup'>('login')
  const [authMethod, setAuthMethod]           = useState<AuthMethod | null>(null)
  const [email, setEmail]                     = useState('')
  const [password, setPassword]               = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName]                       = useState('')
  const [letterboxdUsername, setLetterboxdUsername] = useState('')
  const [error, setError]                     = useState('')
  const [loading, setLoading]                 = useState(false)

  const resetFields = () => {
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setName('')
    setLetterboxdUsername('')
    setError('')
    setAuthMethod(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (mode === 'signup' && authMethod === 'email' && password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    if (mode === 'signup') {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authMethod === 'email' ? email : undefined,
          password,
          name,
          letterboxdUsername: authMethod === 'letterboxd' ? letterboxdUsername : undefined,
          authMethod,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error)
        setLoading(false)
        return
      }
    }

    // Sign in — pass both fields, the backend figures out which to use
    const result = await signIn('credentials', {
      email:    authMethod === 'email' ? email : '',
      username: authMethod === 'letterboxd' ? letterboxdUsername : '',
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.ok) {
      const redirectUrl = mode === 'signup' ? '/?onboard=true' : '/'
      router.push(redirectUrl)
      router.refresh()
    } else {
      setError(
        mode === 'signup'
          ? 'Account created but login failed. Try signing in.'
          : authMethod === 'letterboxd'
            ? 'We could not find an account under that username, or the password is incorrect'
            : 'We could not find an account under that email, or the password is incorrect'
      )
    }
  }

  // Shared input classes
  const inputClass = 'w-full bg-[#231F1B] border border-[rgba(201,168,76,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F0E8] placeholder-[#8C8375] focus:outline-none focus:border-[#C9A84C]'

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1
          className="text-3xl font-bold text-center text-[#E8C97A] mb-1"
          style={{ fontFamily: 'Playfair Display, serif' }}
        >
          CineMatch
        </h1>
        <p className="text-center text-xs text-[#8C8375] tracking-widest uppercase mb-8">
          Movie Discovery
        </p>

        <div className="bg-[#1A1714] border border-[rgba(201,168,76,0.15)] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-[#F5F0E8] mb-6 text-center">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>

          {/* ── Option 1: Google ── */}
          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="w-full flex items-center justify-center gap-3 bg-[#231F1B] border border-[rgba(201,168,76,0.2)] rounded-md px-4 py-2.5 text-sm text-[#F5F0E8] hover:border-[#C9A84C] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-[rgba(201,168,76,0.1)]" />
            <span className="text-xs text-[#8C8375]">or</span>
            <div className="flex-1 h-px bg-[rgba(201,168,76,0.1)]" />
          </div>

          {/* ── Method selector (when no method chosen yet) ── */}
          {!authMethod && (
            <div className="space-y-2">
              <button
                onClick={() => setAuthMethod('email')}
                className="w-full flex items-center justify-center gap-2 bg-[#231F1B] border border-[rgba(201,168,76,0.2)] rounded-md px-4 py-2.5 text-sm text-[#F5F0E8] hover:border-[#C9A84C] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
                {mode === 'login' ? 'Sign in with email' : 'Sign up with email'}
              </button>
              <button
                onClick={() => setAuthMethod('letterboxd')}
                className="w-full flex items-center justify-center gap-2 bg-[#231F1B] border border-[rgba(201,168,76,0.2)] rounded-md px-4 py-2.5 text-sm text-[#F5F0E8] hover:border-[#C9A84C] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2"/>
                  <path d="M7 3v18"/>
                  <path d="M3 7.5h4"/>
                  <path d="M3 12h4"/>
                  <path d="M3 16.5h4"/>
                </svg>
                {mode === 'login' ? 'Sign in with Letterboxd' : 'Sign up with Letterboxd'}
              </button>
            </div>
          )}

          {/* ── Email form ── */}
          {authMethod === 'email' && (
            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === 'signup' && (
                <input
                  type="text"
                  placeholder="Name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className={inputClass}
                />
              )}
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className={inputClass}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className={inputClass}
              />
              {mode === 'signup' && (
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  className={inputClass}
                />
              )}

              {error && <p className="text-xs text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#C9A84C] text-[#0D0D0D] font-medium rounded-md py-2.5 text-sm hover:bg-[#E8C97A] transition-colors disabled:opacity-50"
              >
                {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>

              <button
                type="button"
                onClick={() => { setAuthMethod(null); setError('') }}
                className="w-full text-xs text-[#8C8375] hover:text-[#E8C97A] transition-colors py-1"
              >
                ← Other sign-in options
              </button>
            </form>
          )}

          {/* ── Letterboxd form ── */}
          {authMethod === 'letterboxd' && (
            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === 'signup' && (
                <input
                  type="text"
                  placeholder="Name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className={inputClass}
                />
              )}
              <input
                type="text"
                placeholder="Letterboxd username"
                value={letterboxdUsername}
                onChange={e => setLetterboxdUsername(e.target.value)}
                required
                className={inputClass}
              />
              <input
                type="password"
                placeholder="Letterboxd password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className={inputClass}
              />
              {mode === 'signup' && (
                <p className="text-xs text-[#8C8375]">
                  We'll use your Letterboxd credentials to import your watchlist and ratings.
                </p>
              )}

              {error && <p className="text-xs text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#C9A84C] text-[#0D0D0D] font-medium rounded-md py-2.5 text-sm hover:bg-[#E8C97A] transition-colors disabled:opacity-50"
              >
                {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>

              <button
                type="button"
                onClick={() => { setAuthMethod(null); setError('') }}
                className="w-full text-xs text-[#8C8375] hover:text-[#E8C97A] transition-colors py-1"
              >
                ← Other sign-in options
              </button>
            </form>
          )}

          <p className="text-xs text-[#8C8375] text-center mt-4">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); resetFields() }}
              className="text-[#E8C97A] hover:underline"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>

        {/* Continue as guest */}
        <button
          onClick={() => {
            document.cookie = 'guest=true; path=/; max-age=86400'
            router.push('/')
          }}
          className="w-full mt-4 text-center text-xs text-[#8C8375] hover:text-[#E8C97A] transition-colors py-2"
        >
          Continue as guest →
        </button>

        <p className="text-center text-[10px] text-[#5A554D] mt-6">
          CineMatch is not affiliated with or endorsed by Letterboxd.
        </p>
      </div>
    </div>
  )
}