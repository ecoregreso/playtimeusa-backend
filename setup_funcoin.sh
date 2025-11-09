set -euo pipefail

mkdir -p lib middleware routes models tests

# If app.js is missing, create a minimal one
if [ ! -f app.js ]; then
  cat > app.js <<'JS'
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.use(rateLimit({ windowMs: 60_000, max: 120 }));
app.use(cors({ origin: (_o, cb) => cb(null, true), credentials: true }));

app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/', (_req, res) => res.json({ status: 'ok' }));

// mount cashier routes if present
try { app.use('/api/cashier', require('./routes/cashier')); } catch {}

module.exports = app;
JS
fi

# If server.js is missing, create it
if [ ! -f server.js ]; then
  cat > server.js <<'JS'
const app = require('./app');
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () => console.log(`listening on http://${HOST}:${PORT}`));
}
module.exports = app;
JS
fi

# 1) Fun-Coin helpers
cat > lib/funcoin.js <<'JS'
const DENOMS = Object.freeze([100, 50, 10, 5, 1]); // 1 FC, 0.50, 0.10, 0.05, 0.01
const MAX = 9_000_000_000_00; // 9B FC in cents

function assertIntCents(c) {
  if (!Number.isInteger(c) || c < 0 || c > MAX) throw new Error("INVALID_FUNCOIN_CENTS");
  return c;
}

function parseFC(input) {
  if (input && Number.isInteger(input.funCents)) return assertIntCents(input.funCents);
  if (input && typeof input.fc === "string") return parseFCString(input.fc);
  throw new Error("INVALID_FUNCOIN_INPUT");
}

function parseFCString(s) {
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(s)) throw new Error("INVALID_FUNCOIN_STRING");
  const [w, f = ""] = s.split(".");
  const cents = Number(w) * 100 + Number((f + "00").slice(0, 2));
  return assertIntCents(cents);
}

function formatFC(cents) {
  assertIntCents(cents);
  const n = cents / 100;
  return `FC ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function add(a, b) {
  const x = assertIntCents(a) + assertIntCents(b);
  if (x > MAX) throw new Error("FUNCOIN_OVERFLOW");
  return x;
}
function sub(a, b) {
  const x = assertIntCents(a) - assertIntCents(b);
  if (x < 0) throw new Error("FUNCOIN_UNDERFLOW");
  return x;
}

// Greedy change with optional inventory
function makeChange(cents, inventory) {
  let remaining = assertIntCents(cents);
  const out = { total: remaining, coins: {} };
  for (const d of DENOMS) {
    if (remaining === 0) break;
    const need = Math.floor(remaining / d);
    const allow = inventory ? Math.max(0, Math.min(need, inventory[d] || 0)) : need;
    if (allow > 0) {
      out.coins[d] = allow;
      remaining -= allow * d;
    }
  }
  if (remaining !== 0) throw new Error("INSUFFICIENT_DENOMS_OR_INVENTORY");
  return out;
}

const isCentAligned = (c) => Number.isInteger(c) && c >= 0 && c <= MAX;
function isAllowedDenomination(c) { try { makeChange(c); return true; } catch { return false; } }

module.exports = {
  DENOMS, parseFC, parseFCString, formatFC, add, sub, makeChange, isCentAligned, isAllowedDenomination,
};
JS

# 2) Guardrail middleware
cat > middleware/funcoin-only.js <<'JS'
module.exports = (req, res, next) => {
  const s = JSON.stringify({ b: req.body, q: req.query, h: req.headers });
  if (/\bUSD\b|\bEUR\b|\bGBP\b|\$/.test(s)) {
    return res.status(400).json({ error: "FIAT_REFERENCES_NOT_ALLOWED" });
  }
  next();
};
JS

# 3) Wire middleware into app.js (insert after express.json if not already)
if ! grep -q "middleware/funcoin-only" app.js; then
  awk '
    BEGIN { inserted=0 }
    /express\.json\(\)/ && inserted==0 {
      print; print "const funcoinOnly = require('\''./middleware/funcoin-only'\'');";
      print "app.use(funcoinOnly);";
      inserted=1; next
    }
    { print }
  ' app.js > app.js.tmp && mv app.js.tmp app.js
fi

# 4) Voucher model with amountFunCents
cat > models/Voucher.js <<'JS'
const mongoose = require("mongoose");

const VoucherSchema = new mongoose.Schema(
  { amountFunCents: { type: Number, required: true, min: 0 } },
  { timestamps: true }
);

module.exports = mongoose.model("Voucher", VoucherSchema);
JS

# 5) Cashier route
cat > routes/cashier.js <<'JS'
const express = require("express");
const Voucher = require("../models/Voucher");
const { parseFC, formatFC, makeChange } = require("../lib/funcoin");

const router = express.Router();

router.post("/voucher", async (req, res) => {
  try {
    const amountFunCents = parseFC(req.body);
    const doc = await Voucher.create({ amountFunCents });
    const coins = makeChange(amountFunCents);
    return res.status(200).json({
      id: doc._id,
      amountFunCents,
      amountFormatted: formatFC(amountFunCents),
      coins: coins.coins
    });
  } catch {
    return res.status(400).json({ error: "Invalid fun-coin amount" });
  }
});

module.exports = router;
JS

# 6) Tests
cat > tests/funcoin.test.js <<'JS'
const { parseFCString, formatFC, makeChange } = require("../lib/funcoin");

test("parse formats", () => {
  expect(parseFCString("0")).toBe(0);
  expect(parseFCString("0.01")).toBe(1);
  expect(parseFCString("10.00")).toBe(1000);
  expect(() => parseFCString("1.234")).toThrow();
  expect(() => parseFCString("-1")).toThrow();
});

test("format", () => {
  expect(formatFC(123456)).toBe("FC 1,234.56");
});

test("makeChange greedy", () => {
  expect(makeChange(187).coins).toEqual({ 100:1, 50:1, 10:3, 5:1, 1:2 });
});
JS

# 7) Adjust voucher test if present
if [ -f tests/cashier.voucher.test.js ]; then
  cat > tests/cashier.voucher.test.js <<'JS'
const request = require("supertest");
const app = require("../app");
const Voucher = require("../models/Voucher");

jest.spyOn(Voucher, "create").mockImplementation(async (data) => ({ _id: "v1", ...data }));

describe("POST /api/cashier/voucher", () => {
  it("returns voucher data when amount is provided", async () => {
    const res = await request(app).post("/api/cashier/voucher").send({ fc: "100.00" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("amountFunCents", 10000);
    expect(Voucher.create).toHaveBeenCalledWith(expect.objectContaining({ amountFunCents: 10000 }));
  });

  it("returns 400 when amount is missing", async () => {
    const res = await request(app).post("/api/cashier/voucher").send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid fun-coin amount" });
  });
});
JS
fi

echo "Fun-Coin wiring complete. Run: npm test"
