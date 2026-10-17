/**
 * Sending email.
 *
 * Two drivers behind one call, the same shape as storage. In production it is
 * ZeptoMail, Zoho's transactional service, on its EU data centre: a send-only
 * token that cannot read any inbox, pay as you go, and one HTTPS request per
 * email, so no SDK and no SMTP library. Locally it is an outbox folder and the
 * terminal, so a laptop with no token still signs in: the code is printed.
 *
 * With ZEPTOMAIL_TOKEN set the default is to send for real; MAIL_DRIVER=local
 * forces the outbox, for working on the app without emailing anyone.
 */

export type Mail = {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  html: string;
  /** Adds List-Unsubscribe, which Gmail and Yahoo expect on anything that is not a code. */
  unsubscribeUrl?: string;
};

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export type MailDriver = "zeptomail" | "local";

export function mailDriver(): MailDriver {
  const set = process.env.MAIL_DRIVER;
  if (set === "zeptomail" || set === "local") return set;
  if (set) throw new Error(`MAIL_DRIVER must be "zeptomail" or "local", not "${set}".`);
  return process.env.ZEPTOMAIL_TOKEN ? "zeptomail" : "local";
}

export function mailFrom(): { address: string; name: string } {
  return { address: process.env.MAIL_FROM ?? "no-reply@ardawnsport.ie", name: "Ardawn" };
}

let cached: Mailer | null = null;

async function mailer(): Promise<Mailer> {
  if (cached) return cached;
  if (mailDriver() === "zeptomail") {
    const { ZeptoMailer } = await import("./zeptomail");
    cached = ZeptoMailer.fromEnv();
  } else {
    const { LocalOutbox } = await import("./local");
    cached = new LocalOutbox();
  }
  return cached;
}

export async function sendMail(mail: Mail): Promise<void> {
  // The demo squad's addresses end in .test, a domain reserved never to
  // exist. Sending to them would only bounce and dent the domain's standing
  // with ZeptoMail, so they go to the outbox even when the real driver is on.
  if (/\.(test|invalid)$/i.test(mail.to)) {
    const { LocalOutbox } = await import("./local");
    return new LocalOutbox().send(mail);
  }
  await (await mailer()).send(mail);
}
