// backend/middleware/authPlayer.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

exports.requirePlayerAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Invalid token format' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'player') {
      return res.status(403).json({ error: 'Only players can access this route' });
    }

    req.user = decoded; // attach player info (id, role, etc.)
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token is invalid or expired' });
  }
};

