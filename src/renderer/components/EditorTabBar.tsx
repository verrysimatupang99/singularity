import { useLayout } from '../context/LayoutContext'

function getRelativePath(fullPath: string, root: string | null): string {
  if (!root) return fullPath.split('/').at(-1) || fullPath
  if (fullPath.startsWith(root)) {
    return fullPath.slice(root.length + 1)
  }
  return fullPath.split('/').at(-1) || fullPath
}

export default function EditorTabBar() {
  const { openFiles, activeFile, dirtyFiles, workspaceRoot, setActiveFile, closeFile } = useLayout()

  if (openFiles.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 35,
        backgroundColor: '#161b22',
        borderBottom: '1px solid #21262d',
        overflowX: 'auto',
        flexShrink: 0,
      }}
    >
      {openFiles.map((path) => {
        const name = getRelativePath(path, workspaceRoot)
        const isActive = path === activeFile
        const isDirty = dirtyFiles.has(path)

        return (
          <div
            key={path}
            onClick={() => setActiveFile(path)}
            onAuxClick={(e) => { if (e.button === 1) closeFile(path) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 12px',
              height: '100%',
              fontSize: 13,
              color: isActive ? '#f0f6fc' : '#8b949e',
              backgroundColor: isActive ? '#0d1117' : 'transparent',
              borderBottom: isActive ? '1px solid #58a6ff' : '1px solid transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              minWidth: 0,
            }}
          >
            {isDirty && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#f85149', flexShrink: 0 }} />
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
            <span
              onClick={(e) => { e.stopPropagation(); closeFile(path) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                borderRadius: 4,
                fontSize: 14,
                lineHeight: '18px',
                textAlign: 'center',
                color: '#8b949e',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              ×
            </span>
          </div>
        )
      })}
    </div>
  )
}
