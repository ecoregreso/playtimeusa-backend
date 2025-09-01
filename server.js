const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const path = require('path');

const app = express();

// Use Render port or fallback to 3000 locally
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: '*' })); // Replace '*' with your frontend domain in production
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // for form submissions
app.use(express.static(path.join(__dirname, 'public')));

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helper function to generate 6-digit codes
function generate6Digit() {
  return Math.floor(100000 + Math.random() * 900000);
}

// Home page (voucher form)
app.get('/', (req, res) => {
  res.render('index');
});

// Voucher page
app.post('/cashier/voucher', async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) return res.send('Amount must be greater than 0');

  const userCode = generate6Digit();
  const pin = generate6Digit();
  const bonus = Math.floor(amount * 0.1);

  // Generate QR code as base64
  const qrCode = await QRCode.toDataURL(`${userCode}-${pin}`);

  res.render('voucher', {
    userCode,
    pin,
    amount,
    bonus,
    qrCode
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

