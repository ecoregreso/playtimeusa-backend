const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Temporary login check
app.post("/login", (req, res) => {
  const { userCode, pin } = req.body;

  if (userCode === "123456" && pin === "654321") {
    res.json({ success: true, credits: 100 });
  } else {
    res.status(401).json({ success: false, message: "Invalid ticket" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
