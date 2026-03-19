const request = require('supertest')
const app = require('../app')

describe('Auth Service', () => {
  test('GET /api/auth/health returns ok', async () => {
    const res = await request(app)
      .get('/api/auth/health')
    
    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.service).toBe('auth-service')
  })
})