const jwt = require('jsonwebtoken');

// This middleware is used by products-service and orders-service
// to protect their routes. They verify the token locally using
// the shared JWT_SECRET (injected via K8s Secret in both services).
//
// Alternative pattern: call auth-service's /verify endpoint instead.
// Local verification is faster but requires the secret to be shared.
// For this project we use local verification — simpler and lower latency.
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  // Expect: Authorization: Bearer <token>
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or malformed' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // attach user payload to request for downstream use
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = verifyToken;