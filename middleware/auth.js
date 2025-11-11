const jwt = require('jsonwebtoken');

function requireAuth(roles = []) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!t) return res.status(401).json({ error: 'unauthorized', code: 401 });
    try {
      const p = jwt.verify(t, process.env.JWT_SECRET);
      if (roles.length && !roles.includes(p.role)) return res.status(403).json({ error: 'forbidden', code: 403 });
      req.user = p;
      next();
    } catch {
      return res.status(401).json({ error: 'unauthorized', code: 401 });
    }
  };
}

module.exports = { requireAuth };
