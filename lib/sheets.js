const { google } = require("googleapis");
const { SHEET_ID } = require("./config");

/**
 * Append invoice details to Google Sheet.
 *
 * Credentials: supply either
 * - process.env.GOOGLE_SERVICE_ACCOUNT_JSON (JSON string of service account key), or
 * - process.env.GOOGLE_SERVICE_ACCOUNT_FILE (path to service account JSON file)
 *
 * Spreadsheet ID: will use process.env.GOOGLE_SHEET_ID or the config default.
 */
async function appendInvoiceToSheet(invoiceData, options = {}) {
  const spreadsheetId =
    options.spreadsheetId || process.env.GOOGLE_SHEET_ID || SHEET_ID;

  if (!spreadsheetId) {
    console.warn(
      "No spreadsheet ID provided (GOOGLE_SHEET_ID). Skipping append.",
    );
    return null;
  }
  // Try to read credentials
  let credentials = null;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch (err) {
      console.warn(
        "Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON environment variable",
      );
      credentials = null;
    }
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    try {
      // require will throw if file doesn't exist
      credentials = require(process.env.GOOGLE_SERVICE_ACCOUNT_FILE);
    } catch (err) {
      console.warn("Failed to load GOOGLE_SERVICE_ACCOUNT_FILE:", err.message);
      credentials = null;
    }
  }

  if (!credentials || !credentials.client_email || !credentials.private_key) {
    console.warn(
      "Google Sheets credentials not found or incomplete. Skipping append.",
    );
    return null;
  }

  // Ensure private_key has proper newlines (in case it was stored with escaped newlines)
  credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");

  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  const jwtClient = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    scopes,
  );

  await jwtClient.authorize();

  const sheets = google.sheets({ version: "v4", auth: jwtClient });

  // Small diagnostic step: fetch spreadsheet metadata to confirm access and available sheets
  let meta = null;
  try {
    meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "properties(title),sheets.properties",
    });

    const sheetTitles = (meta.data.sheets || []).map(
      (s) => s.properties && s.properties.title,
    );

    console.log(
      `Google Sheets: accessible. Spreadsheet title: ${
        meta.data.properties.title
      }. Sheets: ${sheetTitles.join(", ")}`,
    );
  } catch (err) {
    console.warn("Could not read spreadsheet metadata:", err.message);
  }

  const total = invoiceData.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );

  // New columns: Status, Date created, Date fulfilled
  const status = "Awaiting payment";
  const dateCreated = new Date().toISOString();
  const dateFulfilled = "";

  const row = [
    invoiceData.invoiceNumber,
    total,
    invoiceData.recipientName || "",
    invoiceData.recipientEmail || "",
    status,
    dateCreated,
    dateFulfilled,
  ];

  // Try to write to the first empty row in column A (so checkboxes or formatting in other columns don't push the append far down)
  try {
    const colRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:A",
    });
    const colValues = colRes.data.values || [];

    // If the header is present in row 1, next available row is length+1
    let nextRow = colValues.length + 1;
    // Ensure we never write to row 1 (header)
    if (nextRow <= 1) nextRow = 2;

    // Determine grid limits for the sheet (row count) and insert a row if we would exceed limits
    const sheetObj =
      ((meta && meta.data && meta.data.sheets) || []).find(
        (s) => s.properties && s.properties.title === "Sheet1",
      ) ||
      (meta && meta.data && meta.data.sheets && meta.data.sheets[0]);

    const rowCount =
      sheetObj &&
      sheetObj.properties &&
      sheetObj.properties.gridProperties &&
      sheetObj.properties.gridProperties.rowCount;

    if (rowCount && nextRow > rowCount) {
      // Insert one row after the header (index 1) to make space
      console.log(
        `Sheet has ${rowCount} rows and nextRow would be ${nextRow}; inserting a row at position 2`,
      );
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              insertDimension: {
                range: {
                  sheetId: sheetObj.properties.sheetId,
                  dimension: "ROWS",
                  startIndex: 1,
                  endIndex: 2,
                },
                inheritFromBefore: false,
              },
            },
          ],
        },
      });

      // After inserting, we'll write to row 2
      nextRow = 2;
    }

    const targetRange = `Sheet1!A${nextRow}:G${nextRow}`;
    console.log(
      `Writing row to ${targetRange} (detected ${colValues.length} non-empty cells in column A)`,
    );

    const putRes = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: targetRange,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    console.log("Sheets update response:", JSON.stringify(putRes.data));

    if (putRes.data && (putRes.data.updatedRows || putRes.data.updatedRange)) {
      return {
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
        updatedRange: putRes.data.updatedRange || putRes.data.updatedRows,
      };
    }

    // Fallback: if update didn't report updates, try append as a fallback
    console.warn("Update did not report changes; falling back to append.");
    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Sheet1!A:G",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
    console.log(
      "Sheets append fallback response:",
      JSON.stringify(appendRes.data),
    );
    return {
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      updatedRange:
        (appendRes.data &&
          appendRes.data.updates &&
          appendRes.data.updates.updatedRange) ||
        appendRes.data.updatedRange,
    };
  } catch (err) {
    console.warn("Sheets write failed:", err.message);
    throw err;
  }
}

/**
 * Fetch existing recipients from Google Sheet.
 * Returns an array of unique recipients with their names and emails.
 */
async function getExistingRecipients(options = {}) {
  const spreadsheetId =
    options.spreadsheetId || process.env.GOOGLE_SHEET_ID || SHEET_ID;

  if (!spreadsheetId) {
    console.warn(
      "No spreadsheet ID provided (GOOGLE_SHEET_ID). Cannot fetch recipients.",
    );
    return [];
  }

  // Try to read credentials
  let credentials = null;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } catch (err) {
      console.warn(
        "Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON environment variable",
      );
      return [];
    }
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    try {
      credentials = require(process.env.GOOGLE_SERVICE_ACCOUNT_FILE);
    } catch (err) {
      console.warn("Failed to load GOOGLE_SERVICE_ACCOUNT_FILE:", err.message);
      return [];
    }
  }

  if (!credentials || !credentials.client_email || !credentials.private_key) {
    console.warn(
      "Google Sheets credentials not found or incomplete. Cannot fetch recipients.",
    );
    return [];
  }

  credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");

  const scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
  const jwtClient = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    scopes,
  );

  try {
    await jwtClient.authorize();

    const sheets = google.sheets({ version: "v4", auth: jwtClient });

    // Fetch recipient names (column C) and emails (column D)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!C2:D", // Skip header row
    });

    const rows = response.data.values || [];

    // Create a map to deduplicate recipients by email
    const recipientMap = new Map();

    for (const row of rows) {
      const name = row[0]?.trim();
      const email = row[1]?.trim();

      if (name && email && !recipientMap.has(email)) {
        recipientMap.set(email, { name, email });
      }
    }

    return Array.from(recipientMap.values());
  } catch (err) {
    console.warn("Failed to fetch recipients:", err.message);
    return [];
  }
}

module.exports = appendInvoiceToSheet;
module.exports.getExistingRecipients = getExistingRecipients;
