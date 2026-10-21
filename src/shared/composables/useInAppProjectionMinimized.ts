import { ref, type Ref } from 'vue'

// Overlay e controle flutuante vivem no mesmo renderer; cada módulo tem seu estado.
const minimizedByScope = new Map<string, Ref<boolean>>()

export function useInAppProjectionMinimized(scope: string): Ref<boolean> {
  let minimized = minimizedByScope.get(scope)
  if (!minimized) {
    minimized = ref(false)
    minimizedByScope.set(scope, minimized)
  }
  return minimized
}
