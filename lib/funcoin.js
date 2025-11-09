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
