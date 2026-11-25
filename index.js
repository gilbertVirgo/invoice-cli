#!/usr/bin/env node

const fs = require("fs");
const dotenv = require("dotenv");
const path = require("path");
const { execSync } = require("child_process");

// Load environment variables from one of several candidate locations:
// 1) path from `INVOICE_ENV_PATH` env var (explicit override)
// 2) current working directory `.env` (so `dotenv` works when running from project)
// 3) package directory `.env` (so `invoice` works when installed globally)
// 4) parent directory of package (covers some install layouts)
function loadEnv() {
  // When running as a global CLI, prefer the package's .env (repo) over the current working directory
  // so storing ~/.invoice-cli/.env or ~/invoice-cli/.env works no matter where `invoice` is executed from.
  const candidates = [];
  if (process.env.INVOICE_ENV_PATH)
    candidates.push(process.env.INVOICE_ENV_PATH);

  // Prefer package locations first
  candidates.push(path.join(__dirname, ".env"));
  candidates.push(path.join(__dirname, "..", ".env"));

  // Also resolve symlinks (npm link creates symlinks) and search upward from the real package directory
  try {
    const realDir = fs.realpathSync(__dirname);
    candidates.push(path.join(realDir, ".env"));
    candidates.push(path.join(realDir, "..", ".env"));

    // Walk upward from realDir to root (limit to 6 levels to avoid long searches)
    let current = realDir;
    for (let i = 0; i < 6; i++) {
      const p = path.join(current, ".env");
      candidates.push(p);
      const parent = path.dirname(current);
      if (!parent || parent === current) break;
      current = parent;
    }
  } catch (err) {
    // ignore realpath errors
  }

  // Then allow a .env in the caller's current working directory
  candidates.push(path.join(process.cwd(), ".env"));

  // De-duplicate while preserving order
  const seen = new Set();
  const uniqCandidates = [];
  for (const c of candidates) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    uniqCandidates.push(c);
  }

  // Try loading .env from the candidates and log attempts for debugging
  for (const p of uniqCandidates) {
    try {
      if (fs.existsSync(p)) {
        const res = dotenv.config({ path: p });
        if (res.error) {
          console.warn(`Failed to load env from ${p}: ${res.error.message}`);
        } else {
          console.log(`Loaded environment from ${p}`);
        }
        return;
      }
    } catch (err) {
      // ignore and continue to next candidate
    }
  }

  // Fallback to default behaviour (cwd)
  dotenv.config();
}

loadEnv();

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
      `\n✅ Invoice generated successfully: ${filepath}\n`,
    );

    // Open the PDF
    try {
      execSync(`open "${filepath}"`, { stdio: "ignore" });
    } catch (error) {
      // Silently fail if open command doesn't work (e.g., on non-macOS systems)
    }

    // Try to append invoice details to Google Sheet and print the sheet link
    const ora = require("ora");
    const spinner = ora("Saving to Google Sheets...").start();
    try {
      const appendInvoiceToSheet = require("./lib/sheets");
      const sheetResult = await appendInvoiceToSheet(invoiceData);
      if (sheetResult) {
        spinner.succeed("Saved to Google Sheets");
        const updatedRange = sheetResult.updatedRange
          ? ` (range ${sheetResult.updatedRange})`
          : "";
        console.log(`📎 Spreadsheet: ${sheetResult.url}${updatedRange}\n`);
      } else {
        // No sheet result - likely missing credentials or missing sheet id in env
        spinner.info("Spreadsheet not updated");
        const { SHEET_ID } = require("./lib/config");
        if (SHEET_ID) {
          console.log(
            `📎 Spreadsheet (not updated - missing credentials): https://docs.google.com/spreadsheets/d/${SHEET_ID}\n`,
          );
        } else {
          console.log(
            `📎 Spreadsheet not updated: no GOOGLE_SHEET_ID configured. Add it to your .env or set env var and retry.\n`,
          );
        }
      }
    } catch (err) {
      spinner.fail("Could not append to spreadsheet");
      console.warn(err.message);
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
