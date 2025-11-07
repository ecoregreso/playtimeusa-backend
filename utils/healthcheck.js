const http = require("http");

const target = {
  hostname: "127.0.0.1",
  port: process.env.PORT || 3000,
  path: "/",
  method: "GET",
  timeout: 3000
};

const req = http.request(target, (res) => {
  if (res.statusCode && res.statusCode < 400) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

req.on("error", () => process.exit(1));
req.on("timeout", () => {
  req.destroy();
  process.exit(1);
});

req.end();
