import { useState, useCallback } from 'react'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import { McpServerInfo, McpTool } from '../../types'

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

export function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{
        fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--on-surface-variant)',
        marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em',
        borderBottom: '1px solid var(--surface-container-high)', paddingBottom: 8,
      }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Info row
// ---------------------------------------------------------------------------

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--on-surface-variant)' }}>{label}</span>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--on-surface)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tool card (MCP tool display)
// ---------------------------------------------------------------------------

export function ToolCard({ tool }: { tool: McpTool }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      backgroundColor: 'var(--surface-lowest)', border: '1px solid var(--outline-variant)',
      borderRadius: 6, marginBottom: 6, overflow: 'hidden',
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-container)'}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        {expanded ? <ChevronDown size={12} style={{ opacity: 0.5 }} /> : <ChevronRight size={12} style={{ opacity: 0.5 }} />}
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface)' }}>{tool.name}</span>
      </div>
      {expanded && (
        <div style={{ padding: '0 12px 12px' }}>
          <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 8px' }}>{tool.description}</p>
          {tool.inputSchema?.properties && (
            <details>
              <summary style={{ fontSize: 10, color: 'var(--on-surface-variant)', cursor: 'pointer' }}>Parameters</summary>
              <pre style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--on-surface-variant)', backgroundColor: 'var(--surface-container)', padding: 8, borderRadius: 4, overflow: 'auto', maxHeight: 150 }}>
                {JSON.stringify(tool.inputSchema.properties, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MCP Server Card
// ---------------------------------------------------------------------------

export function McpServerCard({
  server, isLoading, isExpanded,
  onStart, onStop, onRemove, onToggleExpand,
}: {
  server: McpServerInfo
  isLoading: boolean
  isExpanded: boolean
  onStart: () => void
  onStop: () => void
  onRemove: () => void
  onToggleExpand: () => void
}) {
  const statusColor = server.status === 'running' ? 'var(--success)' : server.status === 'error' ? 'var(--error)' : server.status === 'starting' ? 'var(--warning)' : 'var(--on-surface-variant)'

  return (
    <div style={{ backgroundColor: 'var(--surface-container)', border: '1px solid var(--outline-variant)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: statusColor, boxShadow: server.status === 'running' ? '0 0 6px var(--success)' : 'none', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--text-base)' }}>{server.name}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--on-surface-variant)', fontFamily: 'var(--font-mono)' }}>
            {server.config.command} {server.config.args?.join(' ')}
          </div>
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: statusColor, textTransform: 'capitalize', backgroundColor: `${statusColor}15`, padding: '2px 8px', borderRadius: 4, border: `1px solid ${statusColor}30` }}>
          {server.status}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {server.status === 'running' ? (
            <button onClick={onStop} disabled={isLoading} style={{ backgroundColor: 'var(--warning-bg)', border: '1px solid var(--warning)', color: 'var(--warning)', padding: '4px 10px', borderRadius: 4, cursor: isLoading ? 'not-allowed' : 'pointer', fontSize: 'var(--text-xs)' }}>
              {isLoading ? 'Stopping...' : 'Stop'}
            </button>
          ) : (
            <button onClick={onStart} disabled={isLoading || server.status === 'error'} style={{ backgroundColor: isLoading || server.status === 'error' ? 'var(--surface-container-high)' : 'var(--success-bg)', border: `1px solid ${isLoading || server.status === 'error' ? 'var(--outline-variant)' : 'var(--success)'}`, color: isLoading || server.status === 'error' ? 'var(--on-surface-variant)' : 'var(--success)', padding: '4px 10px', borderRadius: 4, cursor: isLoading || server.status === 'error' ? 'not-allowed' : 'pointer', fontSize: 'var(--text-xs)' }}>
              {isLoading ? 'Starting...' : 'Start'}
            </button>
          )}
          {server.status === 'running' && (server.tools?.length ?? 0) > 0 && (
            <button onClick={onToggleExpand} style={{ backgroundColor: 'var(--surface-container-high)', border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 'var(--text-xs)' }}>
              {isExpanded ? 'Hide' : 'Tools'} ({server.tools?.length})
            </button>
          )}
          <button onClick={onRemove} disabled={isLoading} style={{ backgroundColor: 'var(--error-bg, rgba(255,180,171,0.15))', border: '1px solid var(--error)', color: 'var(--error)', padding: '4px 10px', borderRadius: 4, cursor: isLoading ? 'not-allowed' : 'pointer', fontSize: 'var(--text-xs)' }}>
            Remove
          </button>
        </div>
      </div>

      {server.error && <div style={{ marginTop: 8, fontSize: 'var(--text-sm)', color: 'var(--error)', fontFamily: 'var(--font-mono)' }}>{server.error}</div>}

      {isExpanded && server.tools?.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--outline-variant)' }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--on-surface-variant)', marginBottom: 8, fontWeight: 600 }}>Available Tools</div>
          {server.tools.map(tool => <ToolCard key={tool.name} tool={tool} />)}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// API Key Input Row
// ---------------------------------------------------------------------------

export function ApiKeyInput({
  providerName, color, hasKey, maskedKey, input, saving,
  onInputChange, onSave, onDelete, onValidate, validating,
  validationModels,
}: {
  providerName: string; color: string; hasKey: boolean; maskedKey: string;
  input: string; saving: boolean;
  onInputChange: (v: string) => void; onSave: () => void; onDelete: () => void;
  onValidate?: () => void; validating?: boolean;
  validationModels?: string[];
}) {
  const [copied, setCopied] = useState(false)

  const handleCopyKey = useCallback(async () => {
    if (!maskedKey) return
    try { await navigator.clipboard.writeText(maskedKey); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }, [maskedKey])

  return (
    <div style={{ backgroundColor: 'var(--surface-container)', border: '1px solid var(--outline-variant)', borderRadius: 10, padding: 16, marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 16, flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%' }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: hasKey ? 'var(--success)' : 'var(--on-surface-variant)', boxShadow: hasKey ? '0 0 6px var(--success)' : 'none', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', color }}>{providerName}</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--on-surface-variant)', marginTop: 2 }}>
            {hasKey ? 'API Key configured' : 'Not configured'}
          </div>
          {hasKey && maskedKey && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--on-surface-variant)', fontFamily: 'var(--font-mono)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{maskedKey}</span>
              <button onClick={handleCopyKey} className="ghost-btn" style={{ padding: 1, display: 'flex' }}>
                {copied ? <Check size={10} color="var(--success)" /> : <Copy size={10} />}
              </button>
            </div>
          )}
          {validationModels && validationModels.length > 0 && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--on-surface-variant)', marginTop: 4 }}>
              Available models: {validationModels.slice(0, 5).join(', ')}{validationModels.length > 5 ? ` +${validationModels.length - 5}` : ''}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!hasKey ? (
            <>
              <input value={input} onChange={e => onInputChange(e.target.value)} placeholder="Enter API key..." style={{ padding: '6px 10px', backgroundColor: 'var(--surface-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 6, color: 'var(--on-surface)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', width: 200 }} />
              <button onClick={onSave} disabled={saving || !input.trim()} style={{ backgroundColor: 'var(--success)', border: 'none', color: 'var(--on-surface)', padding: '6px 14px', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              {onValidate && (
                <button onClick={onValidate} disabled={validating || !input.trim()} style={{ backgroundColor: validating ? 'var(--surface-container-high)' : 'var(--info-bg)', border: '1px solid var(--info)', color: validating ? 'var(--on-surface-variant)' : 'var(--info)', padding: '6px 14px', borderRadius: 6, cursor: validating ? 'not-allowed' : 'pointer', fontSize: 'var(--text-sm)' }}>
                  {validating ? 'Validating...' : 'Validate'}
                </button>
              )}
            </>
          ) : (
            <button onClick={onDelete} style={{ backgroundColor: 'var(--error-bg, rgba(255,180,171,0.15))', border: '1px solid var(--error)', color: 'var(--error)', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
              Remove Key
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
