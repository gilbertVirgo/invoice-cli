# Invoice CLI

A simple command-line tool to generate professional invoices as PDFs from the terminal.

---

## Quick Start ✅

Install dependencies and run locally:

```bash
npm install
npm start
```

Run with the bundled global command (recommended for convenience):

```bash
# from the project directory
npm link

# then run from any directory
invoice --test
```

Note: `--test` runs with sample invoice data so you don't get prompted.

---

## Usage

Interactive mode (default):

```bash
invoice
# or
npm start
```

Test mode (no prompts, uses `TEST_INVOICE_DATA`):

```bash
invoice --test
# or
npm start -- --test
```

What the tool does:

- Generates an 8-character invoice number
- Sets a due date (30 days from now)
- Calculates totals and produces a PDF: `invoice-<NUMBER>.pdf`
- Optionally records the invoice in a Google Sheet (see below)

---

## Google Sheets integration 📋

When enabled, the CLI appends a row to the configured Google Sheet with these columns:

- **Invoice number**
- **Total**
- **Recipient name**
- **Recipient email**
- **Status** (defaults to **"Awaiting payment"**)
- **Date created** (ISO timestamp when the invoice was created)
- **Date fulfilled** (left empty)

How to enable:

1. Create a Google Service Account in the Google Cloud Console and enable the **Google Sheets API** for the project.
2. Download the service account JSON key.
3. Share your spreadsheet with the service account's **client_email** (from the JSON) with Editor access.
4. Provide credentials to the CLI in one of two ways:
   - Set `GOOGLE_SERVICE_ACCOUNT_FILE=/full/path/to/key.json` in your environment or `.env`, or
   - Set `GOOGLE_SERVICE_ACCOUNT_JSON` to the literal JSON string (useful for CI):

```bash
# macOS / zsh examples
export GOOGLE_SERVICE_ACCOUNT_FILE=/Users/me/keys/service-account.json
# or
export GOOGLE_SERVICE_ACCOUNT_JSON="$(cat /path/to/service-account.json)"
```

5. (Optional) Override the default spreadsheet ID with:

```bash
export GOOGLE_SHEET_ID=1HPUo4nD3mMdpLfvCGyNLGDLlCxMWVWqYBqfe8uEsHTs
```

6. The CLI uses `dotenv` — create a `.env` file in the project root with the variables above if you prefer. You can use the provided `.env.example` as a starting point:

```bash
cp .env.example .env
# then edit .env to add service account details and company details
```

Troubleshooting:

- If you see **"Google Sheets API has not been used in project..."** enable Sheets API in the Google Cloud Console and wait a few minutes.
- If nothing appears in your sheet, ensure you shared the sheet with the service account **client_email** and that the sheet name is `Sheet1` (or change the code to target a different sheet name).

---

## Removing sensitive data from git history (optional)

If you've previously committed COMPANY details (or other secrets) to the repository, moving them into `.env` does not remove them from your git history. To fully remove secrets before pushing to a public repository use a history-rewrite tool such as `git filter-repo` (recommended) or the BFG Repo Cleaner.

Example using `git filter-repo` (install from https://github.com/newren/git-filter-repo):

```bash
# remove a file from history entirely (this rewrites history)
# WARNING: backup first and coordinate with collaborators
git filter-repo --invert-paths --path lib/config.js
```

Example using BFG (easier for simple cases):

```bash
# replace all occurrences of a secret string
# create replacements.txt containing the patterns to replace
bfg --replace-text replacements.txt
# then force-push the cleaned history to your remote
git push --force
```

Caution: rewriting history changes commit SHAs and requires force-pushing; coordinate with collaborators and back up your repository before proceeding.

---

## Configuration & Structure 🔧

- `index.js` — CLI entrypoint (contains the `main` orchestration only)
- `lib/` — helper modules:
  - `lib/config.js` — constants and defaults (STYLE and `TEST_INVOICE_DATA`). **Sensitive** values (company details and `GOOGLE_SHEET_ID`) are expected to be provided via environment variables (`.env`).
  - `lib/generateInvoiceNumber.js`
  - `lib/getDateDue.js`
  - `lib/formatDate.js`
  - `lib/formatCurrency.js`
  - `lib/promptForInvoiceDetails.js`
  - `lib/generatePDF.js`
  - `lib/sheets.js` — appends invoices to Google Sheets when credentials are present
- `templates/invoice.ejs` — HTML template for invoices used by `generatePDF`

Environment vars recognised:

- `GOOGLE_SERVICE_ACCOUNT_FILE` — path to service account JSON file
- `GOOGLE_SERVICE_ACCOUNT_JSON` — stringified JSON of the service account
- `GOOGLE_SHEET_ID` — spreadsheet ID (provide via `.env`)
- `COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_CITY`, `COMPANY_POSTCODE`, `COMPANY_COUNTRY`, `COMPANY_PHONE` — company contact information (provide via `.env`)
- `COMPANY_BANK_NAME`, `COMPANY_BANK_SORTCODE`, `COMPANY_BANK_ACCOUNT_NUMBER`, `COMPANY_BANK_IBAN` — company bank details (provide via `.env`)

Date format used when writing **Date created**: ISO 8601 (UTC), e.g. `2026-01-15T12:34:56.789Z`.

---

## Examples

Run and create an invoice (interactive):

```bash
invoice
```

Run a quick test invoice and record it to the sheet:

```bash
GOOGLE_SERVICE_ACCOUNT_FILE=/path/to/key.json invoice --test
```

---

## Requirements

- Node.js 14+
- npm

## Dependencies

- inquirer — interactive prompts
- ejs — HTML templating
- puppeteer — PDF rendering
- googleapis — Google Sheets API client
- dotenv — load `.env`

---

If you want, I can add a short section with an example `.env` file or add a CLI flag to opt-out of Google Sheets updates. Let me know which you'd prefer.
