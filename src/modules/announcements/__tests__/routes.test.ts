// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

vi.mock('../views/AnnouncementsView.vue', () => ({ default: {} }))

import { ANNOUNCEMENTS_ROUTE } from '../stores/useAnnouncementsStore'
import { announcementsRoutes } from '../routes'

describe('announcementsRoutes', () => {
  it('define a rota dos Avisos dentro de Utilitários', () => {
    expect(announcementsRoutes).toHaveLength(1)
    expect(announcementsRoutes[0]!.path).toBe('utilities/announcements')
    expect(announcementsRoutes[0]!.name).toBe(ANNOUNCEMENTS_ROUTE)
    expect(announcementsRoutes[0]!.meta).toEqual({ navKey: 'utilities' })
  })
})
