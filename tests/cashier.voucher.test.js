process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://example.com";

const request = require("supertest");

jest.mock("../models/Voucher", () => ({
  create: jest.fn(),
  findOne: jest.fn()
}));

jest.mock("../models/Transaction", () => ({
  create: jest.fn()
}));

jest.mock("qrcode", () => ({
  toDataURL: jest.fn()
}));

const app = require("../server");
const Voucher = require("../models/Voucher");
const Transaction = require("../models/Transaction");
const QRCode = require("qrcode");

describe("POST /api/cashier/voucher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    QRCode.toDataURL.mockResolvedValue("data:image/png;base64,abc123");
    Voucher.create.mockResolvedValue({});
    Transaction.create.mockResolvedValue({});
  });

  it("returns voucher data when amount is provided", async () => {
    const response = await request(app)
      .post("/api/cashier/voucher")
      .send({ amount: 100 });

    expect(response.status).toBe(200);
    expect(Voucher.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 100,
        bonus: 50,
        balance: 150
      })
    );
    expect(Transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "deposit",
        amount: 150
      })
    );
    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      expect.stringContaining("http://example.com/login.html")
    );
    expect(response.body).toEqual(
      expect.objectContaining({
        userCode: expect.any(String),
        pin: expect.any(String),
        loginUrl: "http://example.com/login.html",
        qrCode: "data:image/png;base64,abc123"
      })
    );
  });

  it("returns 400 when amount is missing", async () => {
    const response = await request(app).post("/api/cashier/voucher").send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Missing amount" });
    expect(Voucher.create).not.toHaveBeenCalled();
  });
});
