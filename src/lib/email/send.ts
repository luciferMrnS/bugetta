import nodemailer from "nodemailer";
import type { SendMailOptions, Transporter } from "nodemailer";

const SMTP_URL = process.env.SMTP_URL;
const EMAIL_FROM = process.env.EMAIL_FROM ?? "Bugetta <no-reply@bugetta.app>";
const VERIFY_SUBJECT = "Verify your Bugetta email";

// Supabase Auth sends its own emails through whatever SMTP provider you have
// configured in the dashboard; we reuse that same credential set by pointing
// SMTP_URL at it. When SMTP_URL is missing the email is logged to the console
// (development) or dropped (tests) — the seam is otherwise identical.
let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!SMTP_URL) {
    return null;
  }
  transporter ??= nodemailer.createTransport(SMTP_URL);
  return transporter;
}

async function deliver(
  message: SendMailOptions,
): Promise<{ delivered: boolean }> {
  const transport = getTransporter();
  if (!transport) {
    if (process.env.NODE_ENV !== "test") {
      console.log(
        `[email:dev] To: ${String(message.to)} — ${VERIFY_SUBJECT}\n${String(message.text)}`,
      );
    }
    return { delivered: false };
  }
  try {
    await transport.sendMail(message);
    return { delivered: true };
  } catch (err) {
    console.error("[email] send failed", err);
    return { delivered: false };
  }
}

export async function sendVerificationEmail(input: {
  to: string;
  name: string;
  verifyHref: string;
}): Promise<void> {
  await deliver({
    from: EMAIL_FROM,
    to: input.to,
    subject: VERIFY_SUBJECT,
    text: `Hi ${input.name},

Confirm that this email address belongs to you to finish setting up your Bugetta account:

${input.verifyHref}

This link expires in 1 hour. If you didn't create an account, you can safely ignore this email.`,
  });
}