import { useState, useCallback } from 'react'
import { Folder, FolderOpen, FileText, Code2, FileJson, FileCode, File, ExternalLink } from 'lucide-react'

interface FileTreeProps {
  rootPath: string
  onFileOpen: (path: string) => void
  activeFile: string | null
}

interface FileEntry {
  name: string
  path: string
  type: 'dir' | 'file'
  size: number
  ext: string
}

function FileIcon({ name, ext }: { name: string; ext: string }) {
  const colorMap: Record<string, string> = {
    ts: '#3178c6', tsx: '#3178c6', js: '#f0db4f', jsx: '#f0db4f',
    py: '#3572A5', json: '#cbcb41', md: '#8b949e',
    html: '#e34c26', css: '#563d7c', yml: '#cb171e', yaml: '#cb171e',
    toml: '#9c4122', sh: '#4eaa25',
  }
  const color = colorMap[ext] || '#8b949e'

  if (ext === 'json') return <FileJson size={14} color={color} />
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) return <FileCode size={14} color={color} />
  if (['py', 'sh'].includes(ext)) return <Code2 size={14} color={color} />
  return <File size={14} color={color} />
}

function TreeNode({ entry, depth, onFileOpen, activeFile }: {
  entry: FileEntry
  depth: number
  onFileOpen: (path: string) => void
  activeFile: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[] | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [hovered, setHovered] = useState(false)

  const handleToggle = useCallback(async () => {
    if (entry.type === 'file') {
      onFileOpen(entry.path)
      return
    }
    if (!loaded) {
      const kids = await window.api.fsReadDir(entry.path)
      setChildren(kids)
      setLoaded(true)
    }
    setExpanded((prev) => !prev)
  }, [entry, loaded, onFileOpen])

  const handleOpenInNewWindow = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    await window.api.openNewWindow({ route: '#/editor' })
  }, [])

  const isActive = activeFile === entry.path

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        onClick={handleToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          paddingLeft: depth * 16 + 8,
          cursor: 'pointer',
          fontSize: 13,
          backgroundColor: isActive ? 'rgba(56, 139, 253, 0.15)' : 'transparent',
          color: isActive ? '#58a6ff' : '#c9d1d9',
          borderRight: isActive ? '2px solid #58a6ff' : '2px solid transparent',
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        {entry.type === 'dir' ? (
          expanded ? <FolderOpen size={14} color="#58a6ff" /> : <Folder size={14} color="#8b949e" />
        ) : (
          <FileIcon name={entry.name} ext={entry.ext} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {entry.name}
        </span>
        {hovered && entry.type === 'file' && (
          <button
            onClick={handleOpenInNewWindow}
            title="Open in New Window"
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#8b949e',
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              opacity: 0.7,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#58a6ff' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.color = '#8b949e' }}
          >
            <ExternalLink size={12} />
          </button>
        )}
      </div>
      {entry.type === 'dir' && expanded && children && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              onFileOpen={onFileOpen}
              activeFile={activeFile}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FileTree({ rootPath, onFileOpen, activeFile }: FileTreeProps) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  const loadRoot = useCallback(async () => {
    const kids = await window.api.fsReadDir(rootPath)
    setEntries(kids)
    setLoaded(true)
  }, [rootPath])

  if (!loaded) {
    loadRoot()
    return <div style={{ padding: 16, color: '#8b949e', fontSize: 13 }}>Loading...</div>
  }

  return (
    <div style={{ overflow: 'auto', height: '100%' }}>
      {entries.map((entry) => (
        <TreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          onFileOpen={onFileOpen}
          activeFile={activeFile}
        />
      ))}
    </div>
  )
}
