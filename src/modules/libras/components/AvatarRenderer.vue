<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import type { SignAnimator } from '../sign-animator'

/**
 * AvatarRenderer — F-A.3 (SPEC v2.1.0): avatar 3D com three.js, movido pelo
 * SignAnimator (keyframes do .spack v2). Rig articulado: ombros fixos,
 * braços como pistas (ombro→cotovelo→mão) via IK de 2 segmentos, rosto
 * (olhos+boca), expressão facial discreta. Offline, dicionário local.
 */
const props = defineProps<{ animator: SignAnimator; term?: string }>()

const canvasEl = ref<HTMLCanvasElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let rafId = 0
let elapsed = 0
let lastT = 0

// rig refs (posições em coordenadas de "esqueleto": unidade ≈ 1m)
const SHOULDER_R = new THREE.Vector3(0.30, 1.10, 0)
const SHOULDER_L = new THREE.Vector3(-0.30, 1.10, 0)
const UPPER_ARM = 0.30
const FOREARM = 0.28

const SKIN = 0xd9a066
const SHIRT = 0x3a5a8c
const HAIR = 0x2b2117

interface Arm {
  upper: THREE.Mesh          // cilindro ombro→cotovelo
  fore: THREE.Mesh           // cilindro cotovelo→mão
  hand: THREE.Mesh           // esfera mão
  shoulder: THREE.Vector3    // origem fixa
  handTarget: THREE.Vector3  // alvo = pose
}

let armR: Arm | null = null
let armL: Arm | null = null
let faceGroup: THREE.Group | null = null
let mouth: THREE.Mesh | null = null
let brows: THREE.Mesh | null = null

/** IK 2-bone analítico: devolve posição do cotovelo p/ alcançar target. */
function solveElbow(shoulder: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  const toTarget = target.clone().sub(shoulder)
  const dist = Math.min(toTarget.length(), UPPER_ARM + FOREARM - 1e-4)
  const dir = toTarget.normalize()
  // lei dos cossenos: ângulo no ombro
  const a = UPPER_ARM
  const b = FOREARM
  const c = dist
  const cosA = (a * a + c * c - b * b) / (2 * a * c)
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA))
  // plano de dobra: desce para fora (cotovelo aponta p/ baixo/fora — natural)
  const bend = new THREE.Vector3(-dir.z, 0, dir.x).normalize() // perpendicular no plano frontal
  const elbowDir = dir.clone().multiplyScalar(cosA).add(bend.multiplyScalar(sinA))
  return shoulder.clone().add(elbowDir.multiplyScalar(UPPER_ARM))
}

function orientSegment(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, length: number) {
  const mid = from.clone().add(to).multiplyScalar(0.5)
  mesh.position.copy(mid)
  const d = to.clone().sub(from)
  const len = Math.max(d.length(), 1e-5)
  mesh.scale.set(1, len / length, 1) // cilindro é feito com altura=length
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
}

function makeArm(shoulder: THREE.Vector3, isRight: boolean): Arm {
  const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.05, UPPER_ARM, 12),
    new THREE.MeshStandardMaterial({ color: SHIRT }),
  )
  const fore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048, 0.042, FOREARM, 12),
    new THREE.MeshStandardMaterial({ color: SKIN }),
  )
  const hand = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 20, 14),
    new THREE.MeshStandardMaterial({ color: SKIN }),
  )
  // mão inicial relaxada ao lado do corpo
  const rest = shoulder.clone().add(new THREE.Vector3(isRight ? 0.12 : -0.12, -(UPPER_ARM + FOREARM - 0.1), 0.05))
  hand.position.copy(rest)
  scene?.add(upper, fore, hand)
  return { upper, fore, hand, shoulder: shoulder.clone(), handTarget: rest.clone() }
}

function setup() {
  if (!canvasEl.value) return
  renderer = new THREE.WebGLRenderer({ canvas: canvasEl.value, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(320, 320, false)
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50)
  camera.position.set(0, 1.25, 2.6)
  camera.lookAt(0, 1.05, 0)

  // tronco (torso arredondado: cápsula aproximada com cilindro + esfera base)
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.22, 0.62, 20),
    new THREE.MeshStandardMaterial({ color: SHIRT, roughness: 0.85 }),
  )
  torso.position.set(0, 0.75, 0)
  scene.add(torso)
  const hips = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0x2c3e5c }),
  )
  hips.position.set(0, 0.46, 0)
  scene.add(hips)

  // pescoço + cabeça + rosto
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.06, 0.09, 10),
    new THREE.MeshStandardMaterial({ color: SKIN }),
  )
  neck.position.set(0, 1.13, 0)
  scene.add(neck)

  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 28, 20),
    new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 }),
  )
  headMesh.position.set(0, 1.30, 0)
  scene.add(headMesh)

  const hairMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.142, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: HAIR, roughness: 1 }),
  )
  hairMesh.position.set(0, 1.30, 0)
  scene.add(hairMesh)

  faceGroup = new THREE.Group()
  faceGroup.position.set(0, 1.30, 0.105)
  const eyeGeo = new THREE.SphereGeometry(0.014, 12, 8)
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b })
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.045, 0.03, 0.09)
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.045, 0.03, 0.09)
  mouth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.026, 0.008, 12),
    new THREE.MeshStandardMaterial({ color: 0x8a4a3a }),
  )
  mouth.rotation.x = Math.PI / 2
  mouth.position.set(0, -0.045, 0.11)
  mouth.scale.set(1, 1, 1.8)
  brows = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.008, 0.01),
    new THREE.MeshStandardMaterial({ color: HAIR }),
  )
  brows.position.set(0, 0.065, 0.09)
  faceGroup.add(eyeR, eyeL, mouth, brows)
  scene.add(faceGroup)

  // braços
  armR = makeArm(SHOULDER_R, true)
  armL = makeArm(SHOULDER_L, false)

  // luz: key suave + fill + rim
  const key = new THREE.DirectionalLight(0xfff2e0, 1.6)
  key.position.set(1.2, 2.5, 2)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xbcd4ff, 0.5)
  fill.position.set(-1.5, 1, 1.5)
  scene.add(fill)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 0.7))

  // chão suave (sombra falsa)
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 32),
    new THREE.MeshStandardMaterial({ color: 0x15181f, roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = 0.0
  scene.add(ground)
}

function applyPoseToArm(arm: Arm, x: number, y: number, z: number, mirror: boolean) {
  // plano de sinalização do SPEC: x lateral, y altura 0..2, z profundidade
  // mapeia: y/2 → altura real (0..1.2), clamp em raio alcançável
  const target = new THREE.Vector3(
    (mirror ? -1 : 1) * THREE.MathUtils.clamp(x, -0.45, 0.45),
    THREE.MathUtils.clamp(y * 0.62, 0.35, 1.35),
    THREE.MathUtils.clamp(z * 0.5, -0.15, 0.35),
  )
  arm.handTarget.copy(target)
  const elbow = solveElbow(arm.shoulder, target)
  orientSegment(arm.upper, arm.shoulder, elbow, UPPER_ARM)
  orientSegment(arm.fore, elbow, target, FOREARM)
  arm.hand.position.copy(target)
}

const EXPRESSIONS: Record<string, { mouthScaleY: number; browY: number; browTilt: number }> = {
  neutral: { mouthScaleY: 1, browY: 0.065, browTilt: 0 },
  joy: { mouthScaleY: 2.6, browY: 0.075, browTilt: -0.12 },
  question: { mouthScaleY: 0.6, browY: 0.085, browTilt: 0.18 },
  sad: { mouthScaleY: 0.7, browY: 0.05, browTilt: 0.22 },
}

function applyExpression(expr: string) {
  if (!mouth || !brows) return
  const e = EXPRESSIONS[expr] ?? EXPRESSIONS.neutral!
  mouth.scale.set(1, 1, e.mouthScaleY)
  mouth.position.y = -0.045 - (e.mouthScaleY > 1 ? 0.012 : 0)
  brows.position.y = e.browY
  brows.rotation.z = e.browTilt
}

function tick(nowMs: number) {
  const dt = lastT ? (nowMs - lastT) / 1000 : 0
  lastT = nowMs
  if (renderer && scene && camera && armR && armL) {
    const dur = props.animator.duration()
    if (dur > 0) elapsed = (elapsed + dt) % (dur + 0.8)
    const pose = props.animator.sample(Math.min(elapsed, dur))
    if (pose) {
      applyPoseToArm(armR, pose.hands.right.x, pose.hands.right.y, pose.hands.right.z, false)
      applyPoseToArm(armL, pose.hands.left.x, pose.hands.left.y, pose.hands.left.z, true)
      applyExpression(pose.expression)
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
