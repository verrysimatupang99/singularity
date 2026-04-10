import { useState, useEffect } from 'react'

export default function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  useEffect(() => {
    const cleanup1 = (window as any).api?.onUpdaterUpdateAvailable?.(() => setUpdateAvailable(true))
    const cleanup2 = (window as any).api?.onUpdaterUpdateDownloaded?.(() => setUpdateDownloaded(true))
    const cleanup3 = (window as any).api?.onUpdaterDownloadProgress?.((d: any) => setDownloadProgress(d?.percent || 0))
    return () => { cleanup1?.(); cleanup2?.(); cleanup3?.() }
  }, [])

  if (!updateAvailable && !updateDownloaded) return null

  return (
    <div style={{ position: 'fixed', bottom: 8, right: 16, zIndex: 9999, padding: '8px 16px', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: 8, fontSize: 12, color: '#c9d1d9', display: 'flex', alignItems: 'center', gap: 8 }}>
      {updateDownloaded ? (
        <>
          <span>Update ready!</span>
          <button onClick={() => (window as any).api?.updaterInstallNow?.()} style={{ padding: '2px 8px', backgroundColor: '#238636', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Restart & Install</button>
        </>
      ) : (
        <>
          <span>Downloading update... {Math.round(downloadProgress)}%</span>
          <div style={{ width: 80, height: 4, backgroundColor: '#21262d', borderRadius: 2 }}>
            <div style={{ width: `${downloadProgress}%`, height: '100%', backgroundColor: '#58a6ff', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        </>
      )}
    </div>
  )
}
