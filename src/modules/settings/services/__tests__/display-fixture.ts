import type { SystemDisplay } from '../../types/projection'

// Explicit simulated hardware for tests only.
export const TEST_DISPLAYS: SystemDisplay[] = [
  {
    id: 1,
    bounds: { x: 0, y: 0, width: 2560, height: 1080 },
    workArea: { x: 0, y: 0, width: 2560, height: 1040 },
    scaleFactor: 1,
    isPrimary: true,
  },
  {
    id: 2,
    bounds: { x: -2560, y: 0, width: 2560, height: 1080 },
    workArea: { x: -2560, y: 0, width: 2560, height: 1080 },
    scaleFactor: 1,
    isPrimary: false,
  },
  {
    id: 3,
    bounds: { x: 2560, y: 0, width: 1920, height: 1080 },
    workArea: { x: 2560, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
    isPrimary: false,
  },
]
