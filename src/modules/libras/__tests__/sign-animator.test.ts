import { describe, it, expect } from 'vitest'
import { SignAnimator, lerpPose, type Pose } from '../sign-animator'

const poseA: Pose = { t: 0, hands: { right: { x: 0, y: 0, z: 0 }, left: { x: 0, y: 0, z: 0 } }, expression: 'neutral' }
const poseB: Pose = { t: 1, hands: { right: { x: 1, y: 2, z: 0 }, left: { x: 0, y: 0, z: 0 } }, expression: 'neutral' }
const poseC: Pose = { t: 2, hands: { right: { x: 0, y: 0, z: 3 }, left: { x: 0, y: 0, z: 0 } }, expression: 'question' }

describe('F-A.1 — lerpPose', () => {
  it('interpolação linear em t=0.5 entre A e B', () => {
    const mid = lerpPose(poseA, poseB, 0.5)
    expect(mid.hands.right.x).toBeCloseTo(0.5)
    expect(mid.hands.right.y).toBeCloseTo(1)
  })
  it('t=0 → pose A; t=1 → pose B', () => {
    expect(lerpPose(poseA, poseB, 0)).toEqual(poseA)
    expect(lerpPose(poseA, poseB, 1)).toEqual(poseB)
  })
  it('expression muda no meio do caminho (discrete)', () => {
    expect(lerpPose(poseB, poseC, 0.4).expression).toBe('neutral')
    expect(lerpPose(poseB, poseC, 0.6).expression).toBe('question')
  })
})

describe('F-A.1 — SignAnimator', () => {
  it('single sinal: avanço de tempo percorre keyframes', () => {
    const a = new SignAnimator([poseA, poseB, poseC], 1 /*seg entre keyframes*/)
    a.start(0)
    expect(a.sample(0.5).hands.right.x).toBeCloseTo(0.5)
    expect(a.sample(1.5).hands.right.z).toBeCloseTo(1.5)
    expect(a.duration()).toBe(2)
  })
  it('end of timeline → clampa na última pose', () => {
    const a = new SignAnimator([poseA, poseB], 1)
    a.start(0)
    expect(a.sample(99).hands.right.x).toBeCloseTo(1)
  })
  it('concatena sinais: gap de transição entre eles suaviza', () => {
    const a = new SignAnimator([[poseA, poseB], [poseC]], 1, 0.3 /*transição*/)
    a.start(0)
    // sinal1: 0→1s; transição 0.3s; sinal2: 1.3→1.3s
    expect(a.duration()).toBeCloseTo(1.3, 5)
    expect(a.sample(1.3).hands.right.z).toBeCloseTo(3)
  })
  it('lista vazia → duration 0 e sample retorna null', () => {
    const a = new SignAnimator([], 1)
    expect(a.duration()).toBe(0)
    expect(a.sample(1)).toBeNull()
  })
})
