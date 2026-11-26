import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AvatarRenderer from '../components/AvatarRenderer.vue'
import { SignAnimator } from '../sign-animator'

// jsdom não tem WebGL — mock three com a API usada pelo componente
vi.mock('three', () => {
  const mkVec = () => ({
    set: vi.fn().mockReturnThis(),
    copy: vi.fn().mockReturnThis(),
    clone: () => mkVec(),
    add: vi.fn().mockReturnThis(),
    sub: vi.fn().mockReturnThis(),
    multiplyScalar: vi.fn().mockReturnThis(),
    normalize: vi.fn().mockReturnThis(),
    length: () => 0.1,
    x: 0, y: 0, z: 0,
  })
  const mkObj = () => ({
    position: mkVec(),
    rotation: { x: 0, y: 0, z: 0 },
    scale: { set: vi.fn(), x: 1, y: 1, z: 1 },
    quaternion: { setFromUnitVectors: vi.fn() },
    material: { color: { setHex: vi.fn() } },
    clone: () => mkObj(),
    add: vi.fn(),
  })
  return {
    WebGLRenderer: class { setPixelRatio = vi.fn(); setSize = vi.fn(); render = vi.fn(); dispose = vi.fn() },
    Scene: class { add = vi.fn() },
    PerspectiveCamera: class { position = mkVec(); lookAt = vi.fn() },
    Mesh: class { constructor() { return mkObj() } },
    Group: class { constructor() { return mkObj() } },
    Vector3: class { constructor() { return mkVec() } },
    SphereGeometry: class {},
    CylinderGeometry: class {},
    CircleGeometry: class {},
    BoxGeometry: class {},
    MeshStandardMaterial: class {},
    HemisphereLight: class {},
    DirectionalLight: class { position = mkVec() },
    MathUtils: { clamp: (v: number, a: number, b: number) => Math.min(Math.max(v, a), b) },
  }
})

const keyframes = [
  { t: 0, hands: { right: { x: 0, y: 0.5, z: 0.2 }, left: { x: 0, y: 0.5, z: 0 } }, expression: 'neutral' },
  { t: 1, hands: { right: { x: 0.8, y: 1.4, z: 0.3 }, left: { x: 0, y: 0.5, z: 0 } }, expression: 'joy' },
]

describe('F-A.3 — AvatarRenderer', () => {
  it('monta canvas com testid avatar-renderer e avatar-canvas', () => {
    const animator = new SignAnimator(keyframes, 1, 0.25)
    const wrapper = mount(AvatarRenderer, { props: { animator, term: 'DEUS' } })
    expect(wrapper.find('[data-testid="avatar-renderer"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="avatar-canvas"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('acessibilidade: role img com aria-label do termo', () => {
    const animator = new SignAnimator(keyframes, 1, 0.25)
    const wrapper = mount(AvatarRenderer, { props: { animator, term: 'AMOR' } })
    expect(wrapper.find('[data-testid="avatar-renderer"]').attributes('aria-label')).toContain('AMOR')
    wrapper.unmount()
  })
})
