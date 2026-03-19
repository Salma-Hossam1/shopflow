const request = require('supertest')
const app = require('../app')

describe('Products Service', () => {
  test('GET /api/products/health returns ok', async () => {
    const res = await request(app)
      .get('/api/products/health')
    
    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.service).toBe('products-service')
  })
})