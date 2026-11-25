const inquirer = require("inquirer");
const ora = require("ora");
const { getExistingRecipients } = require("./sheets");

async function promptForInvoiceDetails() {
  // Fetch existing recipients from Google Sheet
  let existingRecipients = [];
  const spinner = ora("Loading existing recipients...").start();
  try {
    existingRecipients = await getExistingRecipients();
    if (existingRecipients.length > 0) {
      spinner.succeed(
        `Found ${existingRecipients.length} existing recipient${existingRecipients.length === 1 ? "" : "s"}`,
      );
    } else {
      spinner.info("No existing recipients found");
    }
  } catch (err) {
    spinner.fail("Could not fetch existing recipients");
    console.warn(err.message);
  }

  let basicInfo = {};

  // If we have existing recipients, offer to select one
  if (existingRecipients.length > 0) {
    const recipientChoice = await inquirer.prompt([
      {
        type: "list",
        name: "option",
        message: "Recipient:",
        choices: [
          { name: "Select existing recipient", value: "existing" },
          { name: "Enter new recipient", value: "new" },
        ],
      },
    ]);

    if (recipientChoice.option === "existing") {
      const selection = await inquirer.prompt([
        {
          type: "list",
          name: "recipient",
          message: "Select recipient:",
          choices: existingRecipients.map((r) => ({
            name: `${r.name} (${r.email})`,
            value: r,
          })),
        },
      ]);

      basicInfo = {
        recipientName: selection.recipient.name,
        recipientEmail: selection.recipient.email,
      };
    } else {
      // Prompt for new recipient
      const questions = [
        {
          type: "input",
          name: "recipientName",
          message: "Recipient name:",
          validate: (input) =>
            input.trim().length > 0 || "Name cannot be empty",
        },
        {
          type: "input",
          name: "recipientEmail",
          message: "Recipient email:",
          validate: (input) => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return (
              emailRegex.test(input) || "Please enter a valid email address"
            );
          },
        },
      ];

      basicInfo = await inquirer.prompt(questions);
    }
  } else {
    // No existing recipients, just prompt for new
    const questions = [
      {
        type: "input",
        name: "recipientName",
        message: "Recipient name:",
        validate: (input) => input.trim().length > 0 || "Name cannot be empty",
      },
      {
        type: "input",
        name: "recipientEmail",
        message: "Recipient email:",
        validate: (input) => {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(input) || "Please enter a valid email address";
        },
      },
    ];

    basicInfo = await inquirer.prompt(questions);
  }

  // Collect line items
  const items = [];
  let addMore = true;

  while (addMore) {
    // Ask for billing type
    const billingType = await inquirer.prompt([
      {
        type: "list",
        name: "type",
        message: "Billing type:",
        choices: [
          { name: "Hours worked (time-based)", value: "hours" },
          { name: "Unit price (quantity-based)", value: "units" },
        ],
        default: "hours",
      },
    ]);

    const descriptionQuestion = {
      type: "input",
      name: "description",
      message: "Item description:",
      validate: (input) =>
        input.trim().length > 0 || "Description cannot be empty",
    };

    let itemQuestions = [];

    if (billingType.type === "hours") {
      // Hours worked billing (default)
      itemQuestions = [
        descriptionQuestion,
        {
          type: "number",
          name: "quantity",
          message: "Hours worked:",
          validate: (input) => {
            const num = parseFloat(input);
            return num > 0 || "Hours must be greater than 0";
          },
        },
        {
          type: "number",
          name: "unitPrice",
          message: "Hourly rate (£):",
          default: 40,
          validate: (input) => {
            const num = parseFloat(input);
            return num >= 0 || "Rate must be 0 or greater";
          },
        },
      ];
    } else {
      // Unit price billing
      itemQuestions = [
        descriptionQuestion,
        {
          type: "number",
          name: "quantity",
          message: "Quantity:",
          validate: (input) => {
            const num = parseFloat(input);
            return num > 0 || "Quantity must be greater than 0";
          },
        },
        {
          type: "number",
          name: "unitPrice",
          message: "Unit price (£):",
          validate: (input) => {
            const num = parseFloat(input);
            return num >= 0 || "Price must be 0 or greater";
          },
        },
      ];
    }

    const item = await inquirer.prompt(itemQuestions);
    items.push({
      description: item.description,
      quantity: parseFloat(item.quantity),
      unitPrice: parseFloat(item.unitPrice),
      billingType: billingType.type,
    });

    const continueQuestion = await inquirer.prompt([
      {
        type: "confirm",
        name: "addAnother",
        message: "Add another item?",
        default: false,
      },
    ]);

    addMore = continueQuestion.addAnother;
  }

  return {
    ...basicInfo,
    items,
  };
}

module.exports = promptForInvoiceDetails;
