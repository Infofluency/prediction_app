'use client'

import { useState } from 'react'
import * as Switch from '@radix-ui/react-switch'
import * as Slider from '@radix-ui/react-slider'
import { RotateCcw, ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import type { Filters, FilterOptions } from '@/app/page'

type Props = {
  filters:          Filters
  options:          FilterOptions | null
  onChange:         (f: Filters) => void
  onReset:          () => void
  isLoggedIn:       boolean
  showHideWatched?: boolean  // default true — pass false on My Next Watch page
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', es: 'Spanish', de: 'German',
  it: 'Italian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  pt: 'Portuguese', ru: 'Russian', hi: 'Hindi', ar: 'Arabic',
  nl: 'Dutch', sv: 'Swedish', da: 'Danish', no: 'Norwegian',
  fi: 'Finnish', pl: 'Polish', tr: 'Turkish', cs: 'Czech',
  th: 'Thai', id: 'Indonesian', ro: 'Romanian', hu: 'Hungarian',
}

function Dropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (vals: string[]) => void
}) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')

  const filtered = search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options

  const toggle = (val: string) =>
    onChange(selected.includes(val)
      ? selected.filter(s => s !== val)
      : [...selected, val])

  return (
    <div className="border-t border-[rgba(201,168,76,0.1)] pt-4 pb-1">
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-xs font-medium tracking-wider uppercase text-[#8C8375] hover:text-[#E8C97A] transition-colors mb-2"
      >
        <span>{label}{selected.length > 0 ? ` (${selected.length})` : ''}</span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {/* Selected chips (always visible) */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selected.map(val => (
            <button
              key={val}
              onClick={() => toggle(val)}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[rgba(201,168,76,0.15)] text-[#E8C97A] border border-[rgba(201,168,76,0.3)] hover:bg-[rgba(201,168,76,0.25)] transition-colors"
            >
              {val} <X size={9} />
            </button>
          ))}
        </div>
      )}

      {/* Dropdown body */}
      {open && (
        <div className="bg-[#1A1714] border border-[rgba(201,168,76,0.15)] rounded-md overflow-hidden mb-2">
          {/* Search */}
          <div className="relative border-b border-[rgba(201,168,76,0.1)]">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8C8375]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full bg-transparent pl-7 pr-3 py-2 text-xs text-[#F5F0E8] placeholder-[#8C8375] focus:outline-none"
              autoFocus
            />
          </div>

          {/* Options */}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-xs text-[#8C8375] px-3 py-2">No results</p>
            )}
            {filtered.map(opt => {
              const isSelected = selected.includes(opt)
              return (
                <button
                  key={opt}
                  onClick={() => toggle(opt)}
                  className={`w-full text-left text-xs px-3 py-2 flex items-center gap-2 transition-colors ${
                    isSelected
                      ? 'bg-[rgba(201,168,76,0.12)] text-[#E8C97A]'
                      : 'text-[#C5BFB4] hover:bg-[#231F1B]'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center ${
                    isSelected
                      ? 'bg-[#C9A84C] border-[#C9A84C]'
                      : 'border-[rgba(201,168,76,0.3)]'
                  }`}>
                    {isSelected && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function FilterPanel({
  filters,
  options,
  onChange,
  onReset,
  isLoggedIn,
  showHideWatched = true,
}: Props) {
  const safeFilters = {
    ...filters,
    genres:        filters.genres        ?? [],
    languages:     filters.languages     ?? [],
    countries:     filters.countries     ?? [],
    providers:     filters.providers     ?? [],
    popularityMin: filters.popularityMin ?? 0,
  }

  const set = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    onChange({ ...safeFilters, [key]: val })

  const hasActiveFilters =
    safeFilters.genres.length > 0 ||
    safeFilters.languages.length > 0 ||
    safeFilters.countries.length > 0 ||
    safeFilters.providers.length > 0 ||
    safeFilters.runtimeMin > 0 ||
    safeFilters.runtimeMax < 300 ||
    safeFilters.popularityMin > 0 ||
    safeFilters.hideWatched ||
    safeFilters.watchlistOnly ||
    (options && (
      safeFilters.yearMin > options.yearRange?.min_year ||
      safeFilters.yearMax < options.yearRange?.max_year
    ))

  const providers     = options?.providers ?? []
  const genres        = options?.genres    ?? []
  const langOptions   = (options?.languages ?? []).map(l => LANGUAGE_NAMES[l] ?? l.toUpperCase())
  const countries     = options?.countries ?? []

  const langCodeMap = Object.fromEntries(
    (options?.languages ?? []).map(l => [LANGUAGE_NAMES[l] ?? l.toUpperCase(), l])
  )
  const selectedLangNames = safeFilters.languages.map(l => LANGUAGE_NAMES[l] ?? l.toUpperCase())

  return (
    <div className="sticky top-24 flex flex-col" style={{ maxHeight: 'calc(100vh - 7rem)' }}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 flex-shrink-0">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-[#C9A84C]">
          Filters
        </h2>
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-xs text-[#8C8375] hover:text-[#E8C97A] transition-colors"
          >
            <RotateCcw size={11} /> Reset
          </button>
        )}
      </div>

      {/* Scrollable filter body */}
      <div className="overflow-y-auto flex-1 pr-1">

        {/* Streaming */}
        <Dropdown
          label="Streaming"
          options={providers}
          selected={safeFilters.providers}
          onChange={vals => set('providers', vals)}
        />

        {safeFilters.providers.length > 0 && (
          <div className="pb-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <Switch.Root
                checked={safeFilters.includeRentBuy}
                onCheckedChange={v => set('includeRentBuy', v)}
              >
                <Switch.Thumb />
              </Switch.Root>
              <span className="text-xs text-[#8C8375]">Include rent / buy</span>
            </label>
          </div>
        )}

        {/* Genre */}
        <Dropdown
          label="Genre"
          options={genres}
          selected={safeFilters.genres}
          onChange={vals => set('genres', vals)}
        />

        {/* Language */}
        <Dropdown
          label="Language"
          options={langOptions}
          selected={selectedLangNames}
          onChange={names => set('languages', names.map(n => langCodeMap[n] ?? n))}
        />

        {/* Country */}
        <Dropdown
          label="Country"
          options={countries}
          selected={safeFilters.countries}
          onChange={vals => set('countries', vals)}
        />

        {/* Runtime slider */}
        <div className="border-t border-[rgba(201,168,76,0.1)] pt-4 pb-4">
          <p className="text-xs font-medium tracking-wider uppercase text-[#8C8375] mb-4">
            Runtime — {safeFilters.runtimeMin}–{safeFilters.runtimeMax} min
          </p>
          <Slider.Root
            min={0}
            max={300}
            step={5}
            value={[safeFilters.runtimeMin, safeFilters.runtimeMax]}
            onValueChange={([min, max]) => onChange({ ...safeFilters, runtimeMin: min, runtimeMax: max })}
            className="relative flex items-center w-full h-5 touch-none select-none"
          >
            <Slider.Track className="relative flex-grow rounded-full h-[3px] bg-[#231F1B]">
              <Slider.Range className="absolute h-full rounded-full bg-[#C9A84C]" />
            </Slider.Track>
            <Slider.Thumb
              className="block w-4 h-4 bg-[#C9A84C] rounded-full cursor-pointer hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[rgba(201,168,76,0.4)] transition-transform"
              aria-label="Runtime min"
            />
            <Slider.Thumb
              className="block w-4 h-4 bg-[#C9A84C] rounded-full cursor-pointer hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[rgba(201,168,76,0.4)] transition-transform"
              aria-label="Runtime max"
            />
          </Slider.Root>
          <div className="flex justify-between text-xs text-[#8C8375] mt-2">
            <span>0 min</span>
            <span>300 min</span>
          </div>
        </div>

        {/* Release year slider */}
        {options?.yearRange && (
          <div className="border-t border-[rgba(201,168,76,0.1)] pt-4 pb-4">
            <p className="text-xs font-medium tracking-wider uppercase text-[#8C8375] mb-4">
              Release Year — {safeFilters.yearMin}–{safeFilters.yearMax}
            </p>
            <Slider.Root
              min={options.yearRange.min_year}
              max={options.yearRange.max_year}
              step={1}
              value={[safeFilters.yearMin, safeFilters.yearMax]}
              onValueChange={([min, max]) => onChange({ ...safeFilters, yearMin: min, yearMax: max })}
              className="relative flex items-center w-full h-5 touch-none select-none"
            >
              <Slider.Track className="relative flex-grow rounded-full h-[3px] bg-[#231F1B]">
                <Slider.Range className="absolute h-full rounded-full bg-[#C9A84C]" />
              </Slider.Track>
              <Slider.Thumb
                className="block w-4 h-4 bg-[#C9A84C] rounded-full cursor-pointer hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[rgba(201,168,76,0.4)] transition-transform"
                aria-label="Year min"
              />
              <Slider.Thumb
                className="block w-4 h-4 bg-[#C9A84C] rounded-full cursor-pointer hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[rgba(201,168,76,0.4)] transition-transform"
                aria-label="Year max"
              />
            </Slider.Root>
            <div className="flex justify-between text-xs text-[#8C8375] mt-2">
              <span>{options.yearRange.min_year}</span>
              <span>{options.yearRange.max_year}</span>
            </div>
          </div>
        )}

        {/* Popularity slider */}
        <div className="border-t border-[rgba(201,168,76,0.1)] pt-4 pb-4">
          <p className="text-xs font-medium tracking-wider uppercase text-[#8C8375] mb-1">
            Minimum Popularity
          </p>
          <p className="text-xs text-[#8C8375] mb-4">
            {safeFilters.popularityMin === 0
              ? 'All movies'
              : `Top ${100 - safeFilters.popularityMin}% most popular`}
          </p>
          <Slider.Root
            min={0}
            max={99}
            step={1}
            value={[safeFilters.popularityMin ?? 0]}
            onValueChange={([val]) => onChange({ ...safeFilters, popularityMin: val })}
            className="relative flex items-center w-full h-5 touch-none select-none"
          >
            <Slider.Track className="relative flex-grow rounded-full h-[3px] bg-[#231F1B]">
              <Slider.Range className="absolute h-full rounded-full bg-[#C9A84C]" />
            </Slider.Track>
            <Slider.Thumb
              className="block w-4 h-4 bg-[#C9A84C] rounded-full cursor-pointer hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[rgba(201,168,76,0.4)] transition-transform"
              aria-label="Minimum popularity"
            />
          </Slider.Root>
          <div className="flex justify-between text-xs text-[#8C8375] mt-2">
            <span>All</span>
            <span>Top 1%</span>
          </div>
        </div>

        {/* ── My Library filters (only for logged-in users) ── */}
        {isLoggedIn && (
          <div className="border-t border-[rgba(201,168,76,0.1)] pt-4 pb-4">
            <p className="text-xs font-medium tracking-wider uppercase text-[#8C8375] mb-4">
              My Library
            </p>
            <div className="space-y-3">

              {/* Hide films I've seen — hidden on My Next Watch page */}
              {showHideWatched && (
                <label className="flex items-center gap-3 cursor-pointer group">
                  <span
                    className={`w-4 h-4 rounded-sm border flex-shrink-0 flex items-center justify-center transition-colors ${
                      safeFilters.hideWatched
                        ? 'bg-[#C9A84C] border-[#C9A84C]'
                        : 'border-[rgba(201,168,76,0.3)] group-hover:border-[rgba(201,168,76,0.5)]'
                    }`}
                    onClick={() => set('hideWatched', !safeFilters.hideWatched)}
                  >
                    {safeFilters.hideWatched && (
                      <svg width="10" height="10" viewBox="0 0 8 8" fill="none">
                        <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                  <span
                    className="text-xs text-[#8C8375] group-hover:text-[#C5BFB4] transition-colors"
                    onClick={() => set('hideWatched', !safeFilters.hideWatched)}
                  >
                    Hide films I've seen
                  </span>
                </label>
              )}

              <label className="flex items-center gap-3 cursor-pointer group">
                <span
                  className={`w-4 h-4 rounded-sm border flex-shrink-0 flex items-center justify-center transition-colors ${
                    safeFilters.watchlistOnly
                      ? 'bg-[#C9A84C] border-[#C9A84C]'
                      : 'border-[rgba(201,168,76,0.3)] group-hover:border-[rgba(201,168,76,0.5)]'
                  }`}
                  onClick={() => set('watchlistOnly', !safeFilters.watchlistOnly)}
                >
                  {safeFilters.watchlistOnly && (
                    <svg width="10" height="10" viewBox="0 0 8 8" fill="none">
                      <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span
                  className="text-xs text-[#8C8375] group-hover:text-[#C5BFB4] transition-colors"
                  onClick={() => set('watchlistOnly', !safeFilters.watchlistOnly)}
                >
                  Watchlist only
                </span>
              </label>

            </div>
          </div>
        )}

      </div>
    </div>
  )
}