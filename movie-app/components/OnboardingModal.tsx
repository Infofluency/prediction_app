'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'

type OnboardingProps = {
  hasLetterboxd: boolean
  onSyncLetterboxd: () => void
  onRateManually: () => void
  onClose: () => void
}

export default function OnboardingModal({
  hasLetterboxd,
  onSyncLetterboxd,
  onRateManually,
  onClose,
}: OnboardingProps) {
  const [showLinkLb, setShowLinkLb]       = useState(false)
  const [lbUsername, setLbUsername]         = useState('')
  const [savingUsername, setSavingUsername] = useState(false)
  const [usernameError, setUsernameError]  = useState('')
  const [syncing, setSyncing]              = useState(false)
  const [syncResult, setSyncResult]        = useState<any>(null)
  const [syncError, setSyncError]          = useState('')

  const handleLinkAndSync = async () => {
    if (!lbUsername.trim()) {
      setUsernameError('Please enter a username')
      return
    }

    setSavingUsername(true)
    setUsernameError('')

    try {
      const res = await fetch('/api/user/letterboxd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: lbUsername.trim() }),
      })

      if (!res.ok) {
        setUsernameError('Failed to save username')
        setSavingUsername(false)
        return
      }

      // Now actually trigger the sync
      setSavingUsername(false)
      setSyncing(true)

      const syncRes = await fetch('/api/letterboxd/import', { method: 'POST' })
      const syncData = await syncRes.json()

      if (!syncRes.ok) {
        setSyncError(syncData.error || 'Sync failed')
        setSyncing(false)
      } else {
        setSyncResult(syncData)
        setSyncing(false)
      }
    } catch {
      setUsernameError('Something went wrong')
      setSavingUsername(false)
      setSyncing(false)
    }
  }

  const handleDirectSync = async () => {
    setSyncing(true)
    setSyncError('')

    try {
      const res = await fetch('/api/letterboxd/import', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setSyncError(data.error || 'Sync failed')
      } else {
        setSyncResult(data)
      }
    } catch {
      setSyncError('Network error')
    } finally {
      setSyncing(false)
    }
  }

  // Show sync results
  if (syncResult) {
    return createPortal(
      <div className="fixed inset-0 flex items-center justify-center px-4"
        style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)' }}>
        <div className="bg-[#1A1714] border border-[rgba(201,168,76,0.2)] rounded-lg p-6 w-full max-w-md shadow-2xl">
          <h3 className="text-xl font-bold text-[#E8C97A] text-center mb-4"
            style={{ fontFamily: 'Playfair Display, serif' }}>
            Sync Complete!
          </h3>
          <div className="p-3 rounded bg-[#231F1B] mb-4 space-y-1">
            {syncResult.watchlist?.new > 0 && (
              <p className="text-xs text-[#C5BFB4]">{syncResult.watchlist.new} watchlist films imported</p>
            )}
            {syncResult.ratings?.new > 0 && (
              <p className="text-xs text-[#C5BFB4]">{syncResult.ratings.new} ratings imported</p>
            )}
            {(syncResult.watchlist?.new === 0 && syncResult.ratings?.new === 0) && (
              <p className="text-xs text-[#8C8375]">No data found — make sure your Letterboxd profile is public.</p>
            )}
          </div>
          <button
            onClick={onSyncLetterboxd}
            className="w-full bg-[#C9A84C] text-[#0D0D0D] font-medium rounded-md py-2.5 text-sm hover:bg-[#E8C97A] transition-colors"
          >
            Continue
          </button>
        </div>
      </div>,
      document.body
    )
  }

  // Show syncing spinner
  if (syncing) {
    return createPortal(
      <div className="fixed inset-0 flex items-center justify-center px-4"
        style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)' }}>
        <div className="bg-[#1A1714] border border-[rgba(201,168,76,0.2)] rounded-lg p-6 w-full max-w-md shadow-2xl">
          <h3 className="text-xl font-bold text-[#E8C97A] text-center mb-4"
            style={{ fontFamily: 'Playfair Display, serif' }}>
            Syncing Letterboxd...
          </h3>
          <div className="flex items-center justify-center gap-3 p-4">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-[#C9A84C] animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <span className="text-xs text-[#8C8375]">This may take a couple seconds...</span>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)' }}
    >
      <div className="bg-[#1A1714] border border-[rgba(201,168,76,0.2)] rounded-lg p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-xl font-bold text-[#E8C97A] text-center mb-2"
          style={{ fontFamily: 'Playfair Display, serif' }}>
          Determine Your Movie Taste
        </h3>
        <p className="text-xs text-[#8C8375] text-center mb-6">
          Help us learn what you like so we can recommend films you'll love.
        </p>

        {syncError && (
          <div className="mb-4 p-3 rounded bg-red-900/20 border border-red-800/30">
            <p className="text-xs text-red-400">{syncError}</p>
          </div>
        )}

        {!showLinkLb ? (
          <div className="space-y-3">
            {hasLetterboxd ? (
              <>
                <button
                  onClick={handleDirectSync}
                  className="w-full bg-[#231F1B] border border-[rgba(201,168,76,0.2)] rounded-lg p-4 text-left hover:border-[#C9A84C] transition-colors group"
                >
                  <p className="text-sm font-semibold text-[#F5F0E8] group-hover:text-[#E8C97A] transition-colors mb-1">
                    Sync Letterboxd Now
                  </p>
                  <p className="text-xs text-[#8C8375]">
                    We'll pull your ratings and watchlist from your Letterboxd profile to personalize your experience.
                  </p>
                </button>

                <button
                  onClick={onRateManually}
                  className="w-full bg-[#231F1B] border border-[rgba(201,168,76,0.2)] rounded-lg p-4 text-left hover:border-[#C9A84C] transition-colors group"
                >
                  <p className="text-sm font-semibold text-[#F5F0E8] group-hover:text-[#E8C97A] transition-colors mb-1">
                    Rate Movies Manually
                  </p>
                  <p className="text-xs text-[#8C8375]">
                    Rate 5–10 movies and we'll figure out your taste. The more you rate, the better our recommendations.
                  </p>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onRateManually}
                  className="w-full bg-[#231F1B] border border-[rgba(201,168,76,0.2)] rounded-lg p-4 text-left hover:border-[#C9A84C] transition-colors group"
                >
                  <p className="text-sm font-semibold text-[#F5F0E8] group-hover:text-[#E8C97A] transition-colors mb-1">
                    Rate Movies Manually
                  </p>
                  <p className="text-xs text-[#8C8375]">
                    Rate 5–10 movies and we'll figure out your taste. The more you rate, the better our recommendations.
                  </p>
                </button>

                <button
                  onClick={() => setShowLinkLb(true)}
                  className="w-full bg-[#231F1B] border border-[rgba(201,168,76,0.2)] rounded-lg p-4 text-left hover:border-[#C9A84C] transition-colors group"
                >
                  <p className="text-sm font-semibold text-[#F5F0E8] group-hover:text-[#E8C97A] transition-colors mb-1">
                    Sync from Letterboxd
                  </p>
                  <p className="text-xs text-[#8C8375]">
                    Have a Letterboxd account? We can import your ratings and watchlist to personalize your experience.
                  </p>
                </button>
              </>
            )}

            <p className="text-center text-[10px] text-[#5A554D] mt-4">
              CineMatch is not affiliated with or endorsed by Letterboxd.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-[#8C8375]">
              Enter your Letterboxd username and we'll import your ratings and watchlist.
            </p>

            <input
              type="text"
              value={lbUsername}
              onChange={e => setLbUsername(e.target.value)}
              placeholder="Letterboxd username"
              className="w-full bg-[#231F1B] border border-[rgba(201,168,76,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F0E8] placeholder-[#8C8375] focus:outline-none focus:border-[#C9A84C]"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleLinkAndSync() }}
            />

            {usernameError && <p className="text-xs text-red-400">{usernameError}</p>}

            <button
              onClick={handleLinkAndSync}
              disabled={savingUsername || !lbUsername.trim()}
              className="w-full bg-[#C9A84C] text-[#0D0D0D] font-medium rounded-md py-2.5 text-sm hover:bg-[#E8C97A] transition-colors disabled:opacity-50"
            >
              {savingUsername ? 'Saving...' : 'Sync Now'}
            </button>

            <button
              onClick={() => setShowLinkLb(false)}
              className="w-full text-center text-xs text-[#8C8375] hover:text-[#E8C97A] transition-colors py-1"
            >
              ← Back
            </button>

            <p className="text-center text-[10px] text-[#5A554D]">
              CineMatch is not affiliated with or endorsed by Letterboxd.
            </p>
          </div>
        )}

        {!showLinkLb && (
          <button
            onClick={onClose}
            className="w-full mt-4 text-center text-xs text-[#8C8375] hover:text-[#E8C97A] transition-colors py-1"
          >
            Skip for now
          </button>
        )}
      </div>
    </div>,
    document.body
  )
}