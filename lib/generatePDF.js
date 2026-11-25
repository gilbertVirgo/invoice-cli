const fs = require("fs");
const os = require("os");
const path = require("path");
const ejs = require("ejs");
const puppeteer = require("puppeteer");

const { COMPANY, STYLE } = require("./config");
const formatCurrency = require("./formatCurrency");
const formatDate = require("./formatDate");

async function generatePDF(invoiceData) {
  const filename = `invoice-${invoiceData.invoiceNumber}.pdf`;
  const outDir = path.join(os.homedir(), "Documents", "Invoices");
  fs.mkdirSync(outDir, { recursive: true });
  const filepath = path.join(outDir, filename);
  const templatePath = path.join(__dirname, "..", "templates", "invoice.ejs");

  const total = invoiceData.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );

  const html = await ejs.renderFile(
    templatePath,
    {
      invoiceData,
      total,
      COMPANY,
      STYLE,
      formatCurrency,
      formatDate,
    },
    { async: true }
  );

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  await page.pdf({
    path: filepath,
    format: "A4",
    printBackground: true,
    margin: {
      top: "12mm",
      right: "12mm",
      bottom: "14mm",
      left: "12mm",
    },
  });

  await browser.close();
  return filepath;
}

module.exports = generatePDF;
