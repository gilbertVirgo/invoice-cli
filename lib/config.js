// Configuration values. Sensitive data such as COMPANY details and SHEET_ID
// should be provided via environment variables (e.g., in a `.env` file).

const COMPANY = {
  name: process.env.COMPANY_NAME || "",
  address: process.env.COMPANY_ADDRESS || "",
  city: process.env.COMPANY_CITY || "",
  postcode: process.env.COMPANY_POSTCODE || "",
  country: process.env.COMPANY_COUNTRY || "",
  phone: process.env.COMPANY_PHONE || "",
  bank: {
    name: process.env.COMPANY_BANK_NAME || "",
    sortCode: process.env.COMPANY_BANK_SORTCODE || "",
    accountNumber: process.env.COMPANY_BANK_ACCOUNT_NUMBER || "",
    iban: process.env.COMPANY_BANK_IBAN || "",
  },
};

const STYLE = {
  SPACING: {
    xxl: 40,
    xl: 32,
    lg: 24,
    md: 18,
    base: 12,
    sm: 10,
    xs: 8,
  },
  FONT: {
    header: 32,
    title: 24,
    section: 16,
    body: 12,
    small: 10,
  },
};

const TEST_INVOICE_DATA = {
  recipientName: "Client Name",
  recipientEmail: "client@example.com",
  items: [
    {
      description: "Service or Product",
      quantity: 1,
      unitPrice: 100,
    },
  ],
};

// Do not include a hard-coded sheet id here. Provide via env var `GOOGLE_SHEET_ID`.
const SHEET_ID = process.env.GOOGLE_SHEET_ID || null;

module.exports = {
  COMPANY,
  STYLE,
  TEST_INVOICE_DATA,
  SHEET_ID,
};
