import { describe, expect, it } from 'vitest'

import { communityRequest } from '../community-http'

describe('communityRequest', () => {
  it('adds X-Tenant: piano without discarding request headers', () => {
    const request = communityRequest({ headers: { Authorization: 'Bearer test' } })
    const headers = new Headers(request.headers)

    expect(headers.get('X-Tenant')).toBe('piano')
    expect(headers.get('Authorization')).toBe('Bearer test')
  })
})
