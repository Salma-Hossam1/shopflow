const request = require('supertest')
const app = require('../app')

describe('Orders Service', () => {
  test('GET /api/orders/health returns ok', async () => {
    const res = await request(app)
      .get('/api/orders/health')
    
    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.service).toBe('orders-service')
  })
})