#!/usr/bin/env node

// Load environment variables from .env (if present)
require("dotenv").config();

const path = require("path");
const { execSync } = require("child_process");

const { TEST_INVOICE_DATA } = require("./lib/config");
const generateInvoiceNumber = require("./lib/generateInvoiceNumber");
const getDateDue = require("./lib/getDateDue");

const promptForInvoiceDetails = require("./lib/promptForInvoiceDetails");
const generatePDF = require("./lib/generatePDF");

async function main() {
  console.log("\n📄 Invoice Generator\n");

  // Check for --test flag
  const isTestMode = process.argv.includes("--test");

  try {
    let invoiceData;

    if (isTestMode) {
      console.log("🧪 Running in test mode...\n");
      invoiceData = TEST_INVOICE_DATA;
    } else {
      invoiceData = await promptForInvoiceDetails();
    }

    // Generate invoice number and date
    invoiceData.invoiceNumber = generateInvoiceNumber();
    invoiceData.dateDue = getDateDue();

    // Generate PDF
    const filepath = await generatePDF(invoiceData);

    console.log(
      `\n✅ Invoice generated successfully: ${path.basename(filepath)}\n`
    );

    // Open the PDF
    try {
      execSync(`open "${filepath}"`, { stdio: "ignore" });
    } catch (error) {
      // Silently fail if open command doesn't work (e.g., on non-macOS systems)
    }

    // Try to append invoice details to Google Sheet and print the sheet link
    try {
      const appendInvoiceToSheet = require("./lib/sheets");
      const sheetResult = await appendInvoiceToSheet(invoiceData);
      if (sheetResult) {
        const updatedRange = sheetResult.updatedRange
          ? ` (range ${sheetResult.updatedRange})`
          : "";
        console.log(
          `\n📎 Appended to spreadsheet: ${sheetResult.url}${updatedRange}\n`
        );
      } else {
        // No sheet result - likely missing credentials or missing sheet id in env
        const { SHEET_ID } = require("./lib/config");
        if (SHEET_ID) {
          console.log(
            `\n📎 Spreadsheet (not updated - missing credentials): https://docs.google.com/spreadsheets/d/${SHEET_ID}\n`
          );
        } else {
          console.log(
            `\n📎 Spreadsheet not updated: no GOOGLE_SHEET_ID configured. Add it to your .env or set env var and retry.\n`
          );
        }
      }
    } catch (err) {
      console.warn("Could not append to spreadsheet:", err.message);
    }
  } catch (error) {
    if (error.isTtyError) {
      console.error("Prompt couldn't be rendered in the current environment");
    } else {
      console.error("Error:", error.message);
    }
    process.exit(1);
  }
}

main();
