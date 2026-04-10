import { useState, useCallback } from 'react'

interface OnboardingWizardProps {
  onComplete: () => void
  onSkip: () => void
}

export default function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const [step, setStep] = useState(0)
  const [provider, setProvider] = useState('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'pass'|'fail'|null>(null)
  const [workspacePath, setWorkspacePath] = useState<string | null>(null)

  const providers = [
    { id: 'anthropic', name: 'Anthropic Claude', keyPrefix: 'sk-ant-' },
    { id: 'openai', name: 'OpenAI GPT', keyPrefix: 'sk-' },
    { id: 'gemini', name: 'Google Gemini', keyPrefix: 'AIza' },
    { id: 'openrouter', name: 'OpenRouter', keyPrefix: 'sk-or-' },
    { id: 'copilot', name: 'GitHub Copilot', keyPrefix: null },
  ]

  const testApiKey = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    try {
      await window.api.authSetApiKey(provider, apiKey)
      // Try a minimal request to verify
      await window.api.chatSend(provider, 'gpt-4o', [{ id: 'test', role: 'user' as const, content: 'Say hi', timestamp: Date.now() }])
      setTestResult('pass')
    } catch {
      setTestResult('fail')
    }
    setTesting(false)
  }, [provider, apiKey])

  const handleFinish = useCallback(async () => {
    if (apiKey) {
      await window.api.authSetApiKey(provider, apiKey)
    }
    // Mark onboarding complete
    try { await window.api.storageMarkOnboardingComplete() } catch {}
    onComplete()
  }, [provider, apiKey, onComplete])

  const handleOpenFolder = useCallback(async () => {
    const path = await window.api.fsPickFolder()
    if (path) setWorkspacePath(path)
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, backgroundColor: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 520, width: '90%', backgroundColor: '#161b22', borderRadius: 16, border: '1px solid #21262d', padding: 32 }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, justifyContent: 'center' }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: i <= step ? '#58a6ff' : '#30363d' }} />)}
        </div>

        {step === 0 && (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 28, margin: '0 0 12px', color: '#f0f6fc' }}>Singularity</h1>
            <p style={{ color: '#8b949e', fontSize: 15, marginBottom: 32 }}>AI-powered IDE that works with any model. Let&apos;s get you set up in 2 minutes.</p>
            <button onClick={() => setStep(1)} style={{ padding: '10px 32px', backgroundColor: '#238636', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>Get Started</button>
            <div><button onClick={() => { window.api.storageMarkOnboardingComplete().catch(()=>{}); onSkip() }} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 13, marginTop: 12 }}>Skip Setup</button></div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 18, margin: '0 0 16px', color: '#f0f6fc' }}>Choose your AI provider</h2>
            {providers.map(p => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', backgroundColor: provider === p.id ? 'rgba(88,166,255,0.1)' : 'transparent', marginBottom: 4 }}>
                <input type="radio" name="provider" checked={provider === p.id} onChange={() => { setProvider(p.id); setApiKey(''); setTestResult(null) }} />
                <span style={{ fontSize: 14, color: '#c9d1d9' }}>{p.name}</span>
                {p.keyPrefix && <span style={{ fontSize: 11, color: '#484f58', marginLeft: 'auto' }}>({p.keyPrefix}...)</span>}
              </label>
            ))}
            {provider !== 'copilot' && (
              <div style={{ marginTop: 12 }}>
                <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={`Enter ${providers.find(p=>p.id===provider)?.name} API key`} style={{ width: '100%', padding: '8px 12px', backgroundColor: '#0d1117', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={testApiKey} disabled={testing || !apiKey} style={{ padding: '6px 16px', backgroundColor: '#1f6feb', color: '#fff', border: 'none', borderRadius: 6, cursor: testing ? 'wait' : 'pointer', fontSize: 12 }}>{testing ? 'Testing...' : 'Test Key'}</button>
                  {testResult === 'pass' && <span style={{ color: '#3fb950', fontSize: 12 }}>Key valid</span>}
                  {testResult === 'fail' && <span style={{ color: '#f85149', fontSize: 12 }}>Key invalid</span>}
                </div>
              </div>
            )}
            {provider === 'copilot' && (
              <button style={{ marginTop: 12, padding: '6px 16px', backgroundColor: '#1f6feb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Connect via Browser</button>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 18, margin: '0 0 16px', color: '#f0f6fc' }}>Open your project folder</h2>
            <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 16 }}>The AI can read, write, and navigate your files.</p>
            <button onClick={handleOpenFolder} style={{ padding: '8px 24px', backgroundColor: '#238636', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Browse for Folder</button>
            {workspacePath && <p style={{ color: '#3fb950', fontSize: 12, marginTop: 8 }}>{workspacePath}</p>}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          {step > 0 && <button onClick={() => setStep(step-1)} style={{ padding: '6px 16px', backgroundColor: 'transparent', color: '#8b949e', border: '1px solid #30363d', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Back</button>}
          <div style={{ flex: 1 }} />
          {step === 2 && <button onClick={handleFinish} style={{ padding: '6px 24px', backgroundColor: '#238636', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Finish</button>}
          {step < 2 && step > 0 && <button onClick={() => setStep(step+1)} style={{ padding: '6px 16px', backgroundColor: '#1f6feb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Continue</button>}
          <button onClick={() => { window.api.storageMarkOnboardingComplete().catch(()=>{}); onSkip() }} style={{ padding: '6px 16px', backgroundColor: 'transparent', color: '#8b949e', border: 'none', cursor: 'pointer', fontSize: 13 }}>Skip</button>
        </div>
      </div>
    </div>
  )
}
