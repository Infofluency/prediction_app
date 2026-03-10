'use client'

import * as Switch from '@radix-ui/react-switch'
import * as Slider from '@radix-ui/react-slider'
import { RotateCcw } from 'lucide-react'
import type { Filters, FilterOptions } from '@/app/page'

type Props = {
  filters: Filters
  options: FilterOptions | null
  onChange: (f: Filters) => void
  onReset: () => void
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', es: 'Spanish', de: 'German',
  it: 'Italian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  pt: 'Portuguese', ru: 'Russian', hi: 'Hindi', ar: 'Arabic',
}

export default function FilterPanel({ filters, options, onChange, onReset }: Props) {
  const set = (key: keyof Filters, val: unknown) =>
    onChange({ ...filters, [key]: val })

  const hasActiveFilters =
    filters.genre || filters.language || filters.country || filters.provider ||
    filters.runtimeMin > 0 || filters.runtimeMax < 300 ||
    (options && (
      filters.yearMin > options.yearRange?.min_year ||
      filters.yearMax < options.yearRange?.max_year
    ))

  const providers = options?.providers ?? []
  const genres    = options?.genres ?? []
  const languages = options?.languages ?? []
  const countries = options?.countries ?? []

  return (
    <div className="sticky top-24 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2
          className="text-sm font-semibold tracking-widest uppercase text-[#C9A84C]"
          style={{ letterSpacing: '0.12em' }}
        >
          Filters
        </h2>
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-xs text-[#8C8375] hover:text-[#E8C97A] transition-colors"
          >
            <RotateCcw size={11} />
            Reset
          </button>
        )}
      </div>

      {/* Streaming Service */}
      <FilterSection title="Streaming">
        <select
          value={filters.provider}
          onChange={e => set('provider', e.target.value)}
          className="w-full bg-[#1A1714] border border-[rgba(201,168,76,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F0E8] focus:outline-none focus:border-[#C9A84C] transition-colors"
        >
          <option value="">All services</option>
          {providers.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {filters.provider && (
          <label className="flex items-center gap-3 mt-3 cursor-pointer">
            <Switch.Root
              checked={filters.includeRentBuy}
              onCheckedChange={v => set('includeRentBuy', v)}
            >
              <Switch.Thumb />
            </Switch.Root>
            <span className="text-xs text-[#8C8375] leading-tight">
              Include rent / buy
            </span>
          </label>
        )}
      </FilterSection>

      {/* Genre */}
      <FilterSection title="Genre">
        <select
          value={filters.genre}
          onChange={e => set('genre', e.target.value)}
          className="w-full bg-[#1A1714] border border-[rgba(201,168,76,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F0E8] focus:outline-none focus:border-[#C9A84C] transition-colors"
        >
          <option value="">All genres</option>
          {genres.map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </FilterSection>

      {/* Language */}
      <FilterSection title="Language">
        <select
          value={filters.language}
          onChange={e => set('language', e.target.value)}
          className="w-full bg-[#1A1714] border border-[rgba(201,168,76,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F0E8] focus:outline-none focus:border-[#C9A84C] transition-colors"
        >
          <option value="">All languages</option>
          {languages.map(l => (
            <option key={l} value={l}>
              {LANGUAGE_NAMES[l] ?? l.toUpperCase()}
            </option>
          ))}
        </select>
      </FilterSection>

      {/* Production Country */}
      <FilterSection title="Country">
        <select
          value={filters.country}
          onChange={e => set('country', e.target.value)}
          className="w-full bg-[#1A1714] border border-[rgba(201,168,76,0.2)] rounded-md px-3 py-2 text-sm text-[#F5F0E8] focus:outline-none focus:border-[#C9A84C] transition-colors"
        >
          <option value="">All countries</option>
          {countries.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </FilterSection>

      {/* Runtime */}
      <FilterSection title={`Runtime — ${filters.runtimeMin}–${filters.runtimeMax} min`}>
        <Slider.Root
          min={0}
          max={300}
          step={5}
          value={[filters.runtimeMin, filters.runtimeMax]}
          onValueChange={([min, max]) => onChange({ ...filters, runtimeMin: min, runtimeMax: max })}
          className="mt-2"
        >
          <Slider.Track>
            <Slider.Range />
          </Slider.Track>
          <Slider.Thumb aria-label="Runtime min" />
          <Slider.Thumb aria-label="Runtime max" />
        </Slider.Root>
      </FilterSection>

      {/* Release Year */}
      {options?.yearRange && (
        <FilterSection title={`Release Year — ${filters.yearMin}–${filters.yearMax}`}>
          <Slider.Root
            min={options.yearRange.min_year}
            max={options.yearRange.max_year}
            step={1}
            value={[filters.yearMin, filters.yearMax]}
            onValueChange={([min, max]) => onChange({ ...filters, yearMin: min, yearMax: max })}
            className="mt-2"
          >
            <Slider.Track>
              <Slider.Range />
            </Slider.Track>
            <Slider.Thumb aria-label="Year min" />
            <Slider.Thumb aria-label="Year max" />
          </Slider.Root>
        </FilterSection>
      )}
    </div>
  )
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[rgba(201,168,76,0.1)] pt-5">
      <p className="text-xs font-medium tracking-wider uppercase text-[#8C8375] mb-3">
        {title}
      </p>
      {children}
    </div>
  )
}
