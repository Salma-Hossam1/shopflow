const express = require('express')
const cors = require('cors')
const authRoutes = require('./routes/auth')

const app = express()

app.use(cors())
app.use(express.json())

app.get('/api/auth/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service' })
})

app.use('/api/auth', authRoutes)

app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal server error' })
})

module.exports = app   // ← export so tests can import it 
 
 
