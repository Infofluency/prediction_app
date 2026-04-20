'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

type ImportResult = {
  success: boolean
  watchlist: { total: number; matched: number; new: number }
  ratings:   { total: number; matched: number; new: number }
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const [step, setStep]             = useState<'checking' | 'needUsername' | 'ready' | 'importing' | 'done'>('checking')
  const [lbUsername, setLbUsername]   = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [result, setResult]          = useState<ImportResult | null>(null)
  const [error, setError]            = useState('')
  const [isResync, setIsResync]      = useState(false)

  // Check if user has a letterboxd username and has imported before
  useEffect(() => {
    fetch('/api/letterboxd/import')
      .then(r => r.json())
      .then(data => {
        if (data.hasLetterboxd) {
          setIsResync(data.imported)
          setStep('ready')
        } else {
          setStep('needUsername')
        }
      })
      .catch(() => setStep('needUsername'))
  }, [])

  const handleSaveUsername = async () => {
    if (!lbUsername.trim()) {
      setUsernameError('Please enter a username')
      return
    }

    setUsernameError('')
    const res = await fetch('/api/user/letterboxd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: lbUsername.trim() }),
    })

    if (!res.ok) {
      setUsernameError('Failed to save username')
      return
    }

    setStep('ready')
  }

  const handleImport = async () => {
    setStep('importing')
    setError('')
    setResult(null)

    try {
      const res = await fetch('/api/letterboxd/import', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Import failed')
        setStep('ready')
      } else {
        setResult(data)
        setStep('done')
      }
    } catch {
      setError('Network error — please try again')
      setStep('ready')
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.75)' }}
    >
      <div className="bg-[#1A1714] border border-[rgba(201,168,76,0.2)] rounded-lg p-6 w-full max-w-md shadow-2xl">

        {/* Loading state */}
        {step === 'checking' && (
          <div className="flex items-center justify-center py-8">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* Need username step */}
        {step === 'needUsername' && (
          <>
            <h3 className="text-lg font-semibold text-[#F5F0E8] mb-2">
              Link Your Letterboxd
            </h3>
            <p className="text-xs text-[#8C8375] mb-4">
              Enter your Letterboxd username and we'll import your ratings and watchlist.
            </p>

            <input
              type="text"
              value={lbUsername}
              onChange={e => setLbUsername(e.target.value)}
              placeholder="Letterboxd username"
              className="w-full bg-[#231F1B] border border-[rgba(201,168,76,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F0E8] placeholder-[#8C8375] focus:outline-none focus:border-[#C9A84C] mb-3"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSaveUsername() }}
            />

            {usernameError && <p className="text-xs text-red-400 mb-3">{usernameError}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleSaveUsername}
                disabled={!lbUsername.trim()}
                className="flex-1 bg-[#C9A84C] text-[#0D0D0D] font-medium rounded-md py-2 text-sm hover:bg-[#E8C97A] transition-colors disabled:opacity-50"
              >
                Connect & Sync
              </button>
              <button
                onClick={onClose}
                className="flex-1 border border-[rgba(201,168,76,0.2)] rounded-md py-2 text-sm text-[#8C8375] hover:text-[#E8C97A] hover:border-[rgba(201,168,76,0.4)] transition-colors"
              >
                Cancel
              </button>
            </div>

            <p className="text-center text-[10px] text-[#5A554D] mt-4">
              CineMatch is not affiliated with or endorsed by Letterboxd.
            </p>
          </>
        )}

        {/* Ready to import */}
        {step === 'ready' && (
          <>
            <h3 className="text-lg font-semibold text-[#F5F0E8] mb-2">
              {isResync ? 'Re-sync Letterboxd' : 'Import Letterboxd Data'}
            </h3>
            <p className="text-xs text-[#8C8375] mb-6">
              {isResync
                ? "We'll check for any new ratings or watchlist additions since your last sync. This may take a couple seconds."
                : "We'll pull your ratings and watchlist from your public Letterboxd profile and sync them to CineMatch. This may take a couple seconds."
              }
            </p>

            {error && (
              <div className="mb-4 p-3 rounded bg-red-900/20 border border-red-800/30">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleImport}
                className="flex-1 bg-[#C9A84C] text-[#0D0D0D] font-medium rounded-md py-2 text-sm hover:bg-[#E8C97A] transition-colors"
              >
                {isResync ? 'Sync Now' : 'Import Now'}
              </button>
              <button
                onClick={onClose}
                className="flex-1 border border-[rgba(201,168,76,0.2)] rounded-md py-2 text-sm text-[#8C8375] hover:text-[#E8C97A] hover:border-[rgba(201,168,76,0.4)] transition-colors"
              >
                Cancel
              </button>
            </div>

            <p className="text-center text-[10px] text-[#5A554D] mt-4">
              CineMatch is not affiliated with or endorsed by Letterboxd.
            </p>
          </>
        )}

        {/* Importing */}
        {step === 'importing' && (
          <>
            <h3 className="text-lg font-semibold text-[#F5F0E8] mb-4">
              {isResync ? 'Syncing...' : 'Importing...'}
            </h3>
            <div className="flex items-center gap-3 p-3 rounded bg-[#231F1B]">
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <span className="text-xs text-[#8C8375]">
                {isResync ? 'Syncing your Letterboxd data...' : 'Importing your Letterboxd data...'}
              </span>
            </div>
          </>
        )}

        {/* Done */}
        {step === 'done' && result && (
          <>
            <h3 className="text-lg font-semibold text-[#F5F0E8] mb-4">
              {isResync ? 'Sync complete!' : 'Import complete!'}
            </h3>

            <div className="mb-4 p-3 rounded bg-[#231F1B] space-y-2">
              {(result.watchlist.new > 0 || result.ratings.new > 0) ? (
                <div className="text-xs text-[#C5BFB4] space-y-1">
                  {result.watchlist.new > 0 && (
                    <p>{result.watchlist.new} new watchlist {result.watchlist.new === 1 ? 'film' : 'films'} added</p>
                  )}
                  {result.ratings.new > 0 && (
                    <p>{result.ratings.new} new {result.ratings.new === 1 ? 'rating' : 'ratings'} added</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[#8C8375]">Already up to date — no new films or ratings found.</p>
              )}
            </div>

            <button
              onClick={onClose}
              className="w-full border border-[rgba(201,168,76,0.2)] rounded-md py-2 text-sm text-[#8C8375] hover:text-[#E8C97A] hover:border-[rgba(201,168,76,0.4)] transition-colors"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

export default function LetterboxdImport({ onImportComplete }: { onImportComplete?: () => void }) {
  const [showModal, setShowModal] = useState(false)
  const [hasImported, setHasImported] = useState(false)
  const [hasLetterboxd, setHasLetterboxd] = useState(false)

  const refreshStatus = () => {
    fetch('/api/letterboxd/import')
      .then(r => r.json())
      .then(data => {
        setHasImported(data.imported)
        setHasLetterboxd(data.hasLetterboxd)
      })
      .catch(() => {})
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  const handleClose = () => {
    setShowModal(false)
    refreshStatus()
    onImportComplete?.()
  }

  // Only show "Re-sync" if they actually have data AND a linked username
  const buttonText = hasImported && hasLetterboxd
    ? 'Re-sync Letterboxd'
    : 'Import Letterboxd'

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="text-xs px-2 py-1 border border-[rgba(201,168,76,0.2)] rounded text-[#8C8375] hover:text-[#E8C97A] hover:border-[rgba(201,168,76,0.4)] transition-colors"
      >
        {buttonText}
      </button>

      {showModal && <ImportModal onClose={handleClose} />}
    </>
  )
}