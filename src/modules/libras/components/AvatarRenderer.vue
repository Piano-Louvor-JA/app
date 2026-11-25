<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import type { SignAnimator } from '../sign-animator'

/**
 * AvatarRenderer — F-A.3 (SPEC v2.1.0): avatar 3D com three.js, movido pelo
 * SignAnimator (keyframes do .spack v2). Rig mínimo: torso, cabeça, 2 mãos.
 * Offline — dicionário local, sem rede. Estilo VLibras, arquitetura própria.
 */
const props = defineProps<{ animator: SignAnimator; term?: string }>()

const canvasEl = ref<HTMLCanvasElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let rightHand: THREE.Mesh | null = null
let leftHand: THREE.Mesh | null = null
let head: THREE.Mesh | null = null
let rafId = 0
let elapsed = 0
let lastT = 0

const EXPRESSION_COLORS: Record<string, number> = {
  neutral: 0xd9a066,
  joy: 0x66d98a,
  question: 0x66a0d9,
}
const SKIN = 0xd9a066

function setup() {
  if (!canvasEl.value) return
  renderer = new THREE.WebGLRenderer({ canvas: canvasEl.value, antialias: true, alpha: true })
  renderer.setSize(320, 320, false)
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50)
  camera.position.set(0, 1.4, 3.2)
  camera.lookAt(0, 1.2, 0)

  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.34, 0.9, 16),
    new THREE.MeshStandardMaterial({ color: 0x3a5a8c }),
  )
  torso.position.set(0, 0.6, 0)
  scene.add(torso)

  head = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 24, 16),
    new THREE.MeshStandardMaterial({ color: SKIN }),
  )
  head.position.set(0, 1.25, 0)
  scene.add(head)

  rightHand = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 16, 12),
    new THREE.MeshStandardMaterial({ color: SKIN }),
  )
  leftHand = rightHand.clone()
  scene.add(rightHand, leftHand)

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.4))
  const key = new THREE.DirectionalLight(0xffffff, 1.2)
  key.position.set(1.5, 3, 2)
  scene.add(key)
}

function tick(nowMs: number) {
  const dt = lastT ? (nowMs - lastT) / 1000 : 0
  lastT = nowMs
  if (renderer && scene && camera && rightHand && leftHand && head) {
    const dur = props.animator.duration()
    if (dur > 0) elapsed = (elapsed + dt) % (dur + 0.6)
    const pose = props.animator.sample(Math.min(elapsed, dur))
    if (pose) {
      rightHand.position.set(pose.hands.right.x, pose.hands.right.y, pose.hands.right.z)
      leftHand.position.set(-pose.hands.left.x, pose.hands.left.y, pose.hands.left.z)
      const mat = head.material as THREE.MeshStandardMaterial
      mat.color.setHex(EXPRESSION_COLORS[pose.expression] ?? SKIN)
    }
    renderer.render(scene, camera)
  }
  rafId = requestAnimationFrame(tick)
}

watch(
  () => props.term,
  () => {
    elapsed = 0
    lastT = 0
  },
)

onMounted(() => {
  setup()
  rafId = requestAnimationFrame(tick)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  renderer?.dispose()
  renderer = null
})
</script>

<template>
  <div data-testid="avatar-renderer" role="img" :aria-label="`Avatar intérprete — sinal ${term ?? ''}`">
    <canvas ref="canvasEl" width="320" height="320" data-testid="avatar-canvas" />
  </div>
</template>

<style scoped>
canvas { max-width: 100%; border-radius: 8px; background: var(--card, #111); }
</style>
