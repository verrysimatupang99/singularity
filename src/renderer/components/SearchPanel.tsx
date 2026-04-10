import { useState, useEffect, useCallback } from 'react'
import { Search, CaseSensitive, FileText } from 'lucide-react'
import { useLayout } from '../context/LayoutContext'

interface SearchResult {
  file: string
  line: number
  content: string
}

export default function SearchPanel() {
  const { workspaceRoot, openFile, setActiveFile } = useLayout()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [filePattern, setFilePattern] = useState('')
  const [searching, setSearching] = useState(false)

  // Group results by file
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.file]) acc[r.file] = []
    acc[r.file].push(r)
    return acc
  }, {})

  const doSearch = useCallback(async () => {
    if (!query || !workspaceRoot) return
    setSearching(true)
    try {
      const r = await window.api.fsSearch(query, workspaceRoot, {
        caseSensitive,
        useRegex,
        filePattern: filePattern || undefined,
      })
      setResults(r)
    } catch {
      setResults([])
    }
    setSearching(false)
  }, [query, workspaceRoot, caseSensitive, useRegex, filePattern])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(doSearch, 300)
    return () => clearTimeout(timer)
  }, [doSearch])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0d1117' }}>
      {/* Search input */}
      <div style={{ padding: '8px 8px 4px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          backgroundColor: '#161b22', border: '1px solid #30363d',
          borderRadius: 6, padding: '4px 8px',
        }}>
          <Search size={14} color="#8b949e" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in files..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: '#c9d1d9', fontSize: 13, padding: '2px 4px',
            }}
          />
          {searching && <span style={{ fontSize: 11, color: '#8b949e' }}>...</span>}
        </div>

        {/* Options row */}
        <div style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 12, color: '#8b949e', alignItems: 'center' }}>
          <button
            onClick={() => setCaseSensitive(!caseSensitive)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: caseSensitive ? '#58a6ff' : '#8b949e',
              display: 'flex', alignItems: 'center', gap: 2,
            }}
            title="Match Case"
          >
            <CaseSensitive size={13} /> Aa
          </button>
          <button
            onClick={() => setUseRegex(!useRegex)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: useRegex ? '#58a6ff' : '#8b949e',
              display: 'flex', alignItems: 'center', gap: 2,
            }}
            title="Use Regex"
          >
            .*
          </button>
          <div style={{ flex: 1 }} />
          <input
            value={filePattern}
            onChange={(e) => setFilePattern(e.target.value)}
            placeholder="*.ts"
            style={{
              width: 60, background: '#161b22', border: '1px solid #30363d',
              borderRadius: 4, color: '#c9d1d9', fontSize: 11, padding: '2px 6px',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
        {!workspaceRoot && (
          <div style={{ padding: 16, color: '#8b949e', fontSize: 12, textAlign: 'center' }}>
            Open a workspace folder to search
          </div>
        )}
        {workspaceRoot && !query && (
          <div style={{ padding: 16, color: '#8b949e', fontSize: 12, textAlign: 'center' }}>
            Type to search
          </div>
        )}
        {query && results.length === 0 && !searching && (
          <div style={{ padding: 16, color: '#8b949e', fontSize: 12, textAlign: 'center' }}>
            No results found
          </div>
        )}
        {results.length > 0 && (
          <div style={{ fontSize: 11, color: '#8b949e', padding: '4px 0' }}>
            {results.length} results in {Object.keys(grouped).length} files
          </div>
        )}
        {Object.entries(grouped).map(([file, fileResults]) => (
          <div key={file}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', fontSize: 12, color: '#58a6ff',
              cursor: 'pointer',
            }}>
              <FileText size={12} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.split('/').at(-1)}
              </span>
              <span style={{ color: '#8b949e', fontSize: 10 }}>({fileResults.length})</span>
            </div>
            {fileResults.map((r, i) => (
              <div
                key={i}
                onClick={() => { openFile(file); setActiveFile(file) }}
                style={{
                  padding: '2px 8px 2px 28px',
                  fontSize: 12,
                  color: '#c9d1d9',
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 8,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <span style={{ color: '#8b949e', minWidth: 24, textAlign: 'right' }}>{r.line}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.content}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
