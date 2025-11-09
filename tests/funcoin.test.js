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
