import fs from 'fs';
import dotenv from 'dotenv';

// Load .env
const envConfig = dotenv.parse(fs.readFileSync('.env'));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

const authKey = process.env.MSG91_AUTH_KEY;
const templateId = process.env.MSG91_EMAIL_TEMPLATE_ID;
const domain = process.env.MSG91_EMAIL_DOMAIN;
const fromEmail = "noreply@" + domain;

async function send() {
  const payload = {
    recipients: [
      {
        to: [{ email: "support@jsmf.me" }],
        variables: {
          subject: "Test from JSMF Backend!",
          body: `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #2c3e50;">MSG91 is Working! 🎉</h2>
              <p>Hello,</p>
              <p>This is a test email sent dynamically from your backend configuration.</p>
              <p>Your pass-through template <strong>${templateId}</strong> is successfully replacing the variables.</p>
              <br/>
              <p>Best,<br/>JSMF System</p>
            </div>
          `
        }
      }
    ],
    from: { email: fromEmail, name: "JSMF" },
    domain: domain,
    template_id: templateId
  };

  console.log("Sending MSG91 Email...");
  console.log("From:", fromEmail);
  console.log("Domain:", domain);
  console.log("Template ID:", templateId);
  console.log("To: support@jsmf.me");

  const res = await fetch("https://control.msg91.com/api/v5/email/send", {
    method: "POST",
    headers: {
      "authkey": authKey,
      "Content-Type": "application/json",
      "accept": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const body = await res.json();
  console.log("Status:", res.status);
  console.log("Response:", body);
}

send().catch(console.error);
