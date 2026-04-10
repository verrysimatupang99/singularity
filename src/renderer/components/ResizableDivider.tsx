import { useState, useCallback, useEffect, useRef } from 'react'

interface ResizableDividerProps {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
  className?: string
}

export default function ResizableDivider({ direction, onResize, className = '' }: ResizableDividerProps) {
  const dragging = useRef(false)
  const lastPos = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    lastPos.current = direction === 'vertical' ? e.clientX : e.clientY
  }, [direction])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const current = direction === 'vertical' ? e.clientX : e.clientY
      const delta = current - lastPos.current
      lastPos.current = current
      onResize(delta)
    }
    const handleMouseUp = () => {
      dragging.current = false
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [direction, onResize])

  return (
    <div
      onMouseDown={handleMouseDown}
      className={className}
      style={{
        flexShrink: 0,
        ...(direction === 'vertical'
          ? { width: 4, cursor: 'col-resize', alignSelf: 'stretch' }
          : { height: 4, cursor: 'row-resize', width: '100%' }),
        background: 'transparent',
        transition: 'background 0.15s',
        zIndex: 10,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(56, 139, 253, 0.3)'
      }}
      onMouseLeave={(e) => {
        if (!dragging.current) e.currentTarget.style.background = 'transparent'
      }}
    />
  )
}
