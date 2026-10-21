import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { emptyMetrics } from '../../sim/metrics'
import { useApp } from '../../state/store'
import { TopBar } from '../TopBar'

describe('top bar system P99', () => {
  afterEach(() => {
    act(() => useApp.setState({ metrics: emptyMetrics() }))
  })

  test('updates when the simulation reports new P99 metrics', () => {
    render(<TopBar />)

    act(() => {
      useApp.setState({ metrics: { ...emptyMetrics(), completed: 10, latencyP99: 154 } })
    })
    expect(screen.getByText('154ms')).toBeTruthy()

    act(() => {
      useApp.setState({ metrics: { ...emptyMetrics(), completed: 20, latencyP99: 287 } })
    })
    expect(screen.getByText('287ms')).toBeTruthy()
  })
})
