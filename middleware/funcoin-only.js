module.exports = (req, res, next) => {
  const s = JSON.stringify({ b: req.body, q: req.query, h: req.headers });
  if (/\bUSD\b|\bEUR\b|\bGBP\b|\$/.test(s)) {
    return res.status(400).json({ error: "FIAT_REFERENCES_NOT_ALLOWED" });
  }
  next();
};
