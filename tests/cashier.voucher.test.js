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
    expect(res.body).toEqual({ error: "Invalid fun-coin amount", code: 400 });
  });
});
