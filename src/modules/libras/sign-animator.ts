/**
 * sign-animator — F-A.1 (SPEC-libras v2.1.0)
 * Núcleo do intérprete avatar 3D: interpolação de keyframes de pose.
 * Puro (sem three.js/DOM) — testável e portável para repo próprio.
 * Sinal = sequência de poses; animator concatena sinais com transição suave.
 */

export interface Vec3 { x: number; y: number; z: number }
export interface Pose {
  t: number
  hands: { right: Vec3; left: Vec3 }
  expression: string
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) }
}

/** Interpola duas poses. Posições = linear; expressão = discreta (troca no meio). */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    t: lerp(a.t, b.t, t),
    hands: {
      right: lerpVec3(a.hands.right, b.hands.right, t),
      left: lerpVec3(a.hands.left, b.hands.left, t),
    },
    expression: t < 0.5 ? a.expression : b.expression,
  }
}

type OneSign = Pose[]

export class SignAnimator {
  private timeline: Pose[] = []
  private startT = 0
  private total = 0

  /**
   * @param signs sinais (cada um = lista de keyframes)
   * @param secondsPerKeyframe duração de cada keyframe
   * @param transitionSecs transição entre sinais consecutivos (interpolação
   *   da última pose do anterior p/ a primeira do próximo)
   */
  constructor(
    signs: OneSign[] | Pose[],
    private secondsPerKeyframe: number,
    private transitionSecs = 0.25,
  ) {
    // Se veio uma única lista plana, trata como 1 sinal
    const isFlat = signs.length > 0 && (signs as unknown[])[0] != null && !Array.isArray((signs as unknown[])[0])
    const list = isFlat ? [signs as Pose[]] : (signs as OneSign[])
    for (let i = 0; i < list.length; i++) {
      const sign = list[i]
      if (sign.length === 0) continue
      if (i > 0) {
        const prev = this.timeline[this.timeline.length - 1]
        // transição: N amostras entre prev e sign[0]
        const steps = Math.max(1, Math.round(this.transitionSecs / 0.05))
        for (let s = 1; s <= steps; s++) {
          this.timeline.push({ ...lerpPose(prev, sign[0], s / steps), t: this.total })
          this.total += this.transitionSecs / steps
        }
      }
      let first = true
      for (const pose of sign) {
        // keyframe dura secondsPerKeyframe, mas a pose final não avança o total
        // (dura até o próximo evento; o fim = t da última pose)
        if (first) {
          this.timeline.push({ ...pose, t: this.total })
        } else {
          this.total += this.secondsPerKeyframe
          this.timeline.push({ ...pose, t: this.total })
        }
        first = false
      }
    }
    // transição final implícita: nenhum extra
  }

  start(nowSec: number): void {
    this.startT = nowSec
  }

  duration(): number {
    return this.total
  }

  /** Pose no tempo relativo (0..duration). Clamp nas extremidades. */
  sample(timeSec: number): Pose | null {
    if (this.timeline.length === 0) return null
    if (timeSec <= 0) return this.timeline[0]
    if (timeSec >= this.total) return this.timeline[this.timeline.length - 1]
    // busca binária do segmento
    let lo = 0
    let hi = this.timeline.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (this.timeline[mid].t <= timeSec) lo = mid
      else hi = mid
    }
    const a = this.timeline[lo]
    const b = this.timeline[hi]
    const span = b.t - a.t || 1
    return lerpPose(a, b, (timeSec - a.t) / span)
  }
}
