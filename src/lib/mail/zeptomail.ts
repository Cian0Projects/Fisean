/**
 * ZeptoMail's send API: one POST per email, authorised by the agent's Send
 * Mail token. The token goes in ZEPTOMAIL_TOKEN exactly as the dashboard
 * copies it, "Zoho-enczapikey" and all; a copy that lost the space after
 * that word is mended here rather than failing with a bare 401.
 */
import { mailFrom, type Mail, type Mailer } from "./index";

export class ZeptoMailer implements Mailer {
  constructor(
    private readonly token: string,
    private readonly host: string,
  ) {}

  static fromEnv(): ZeptoMailer {
    const raw = process.env.ZEPTOMAIL_TOKEN?.trim();
    if (!raw) throw new Error("ZEPTOMAIL_TOKEN must be set to send email through ZeptoMail.");
    const key = raw.replace(/^Zoho-enczapikey\s*/i, "");
    // EU by default: the clubs are in Ireland, and so is their data.
    return new ZeptoMailer(`Zoho-enczapikey ${key}`, process.env.ZEPTOMAIL_HOST ?? "api.zeptomail.eu");
  }

  async send(mail: Mail): Promise<void> {
    const res = await fetch(`https://${this.host}/v1.1/email`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: this.token,
      },
      body: JSON.stringify({
        from: mailFrom(),
        to: [{ email_address: { address: mail.to, ...(mail.toName ? { name: mail.toName } : {}) } }],
        subject: mail.subject,
        textbody: mail.text,
        htmlbody: mail.html,
        // A share email someone cannot stop in one click is one they mark as
        // spam, and enough of those sink the codes' delivery along with it.
        ...(mail.unsubscribeUrl
          ? {
              mime_headers: {
                "List-Unsubscribe": `<${mail.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
        // A sign-in link is single use. Click tracking would rewrite it
        // through Zoho's servers, and a scanner following that would spend it.
        track_clicks: false,
        track_opens: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      throw new Error(`ZeptoMail refused the email (${res.status}): ${detail}`);
    }
  }
}
