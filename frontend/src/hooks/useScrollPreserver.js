import { useRef, useLayoutEffect, useCallback, useEffect } from 'react'

/**
 * useScrollPreserver
 *
 * Preserves the exact scrollTop position of a scrollable DOM container
 * across asynchronous data updates, re-renders, and background polling.
 *
 * Features:
 * 1. Automatic scrollTop snapshotting and layout-phase restoration.
 * 2. User interaction tracking (mouse hover / active scroll) to detect if user is reading.
 * 3. Window-level or element-level scroll locking.
 */
export function useScrollPreserver(dataDependency) {
  const containerRef = useRef(null)
  const savedScrollTop = useRef(0)
  const isInteractingRef = useRef(false)
  const interactionTimeoutRef = useRef(null)

  // Track user active scroll or interaction
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      savedScrollTop.current = containerRef.current.scrollTop
      isInteractingRef.current = true

      if (interactionTimeoutRef.current) {
        clearTimeout(interactionTimeoutRef.current)
      }
      interactionTimeoutRef.current = setTimeout(() => {
        isInteractingRef.current = false
      }, 2500)
    }
  }, [])

  const handleMouseEnter = useCallback(() => {
    isInteractingRef.current = true
  }, [])

  const handleMouseLeave = useCallback(() => {
    isInteractingRef.current = false
  }, [])

  // Capture position before re-render / data change
  const snapshotScroll = useCallback(() => {
    if (containerRef.current) {
      savedScrollTop.current = containerRef.current.scrollTop
    }
  }, [])

  // Restore scroll in layout phase before browser paint
  useLayoutEffect(() => {
    if (containerRef.current && savedScrollTop.current > 0) {
      containerRef.current.scrollTop = savedScrollTop.current
    }
  }, [dataDependency])

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (interactionTimeoutRef.current) {
        clearTimeout(interactionTimeoutRef.current)
      }
    }
  }, [])

  return {
    containerRef,
    snapshotScroll,
    handleScroll,
    handleMouseEnter,
    handleMouseLeave,
    isInteractingRef,
    savedScrollTop,
  }
}
