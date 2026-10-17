/**
 * The words of every email Ardawn sends, as plain text and as HTML.
 *
 * Both, because a mail client that will not show HTML, or a reader who has
 * turned it off, should still get a working code and working links. The HTML
 * is deliberately plain: one column, system fonts, inline styles, no images.
 * Email clients strip most of what a web page relies on, and an email that
 * looks like a newsletter is one people learn to skip.
 *
 * Pure, so the tests can check the wording, including that no dash slips
 * into anything a player reads.
 */
import { formatCode } from "../auth/email-code";
import type { DigestLine } from "../notify/digest";
import { digestSubject } from "../notify/digest";
import type { SignInPurpose } from "../db/schema";

export type Rendered = { subject: string; text: string; html: string };

function escape(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function frame(body: string, footer: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f2ee;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1d1b">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-top:3px solid #1d1d1b;padding:28px">
<div style="font-size:20px;font-weight:700;letter-spacing:0.02em;margin-bottom:20px">Ardawn</div>
${body}
</div>
<div style="max-width:480px;margin:12px auto 0;font-size:12px;line-height:1.5;color:#6b6a66">${footer}</div>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${escape(href)}" style="display:inline-block;background:#1d1d1b;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:2px">${escape(label)}</a>`;
}

const LEAD: Record<SignInPurpose, (team: string | null) => string> = {
  "sign-in": () => "Here is your code to sign in to Ardawn.",
  join: (team) => `Here is your code to join ${team ?? "your panel"} on Ardawn.`,
  start: (team) => `Here is your code to finish setting up ${team ?? "your club"} on Ardawn.`,
  "change-email": () => "Here is your code to make this your email on Ardawn.",
};

export function signInMail(input: {
  purpose: SignInPurpose;
  code: string;
  link: string;
  teamName?: string | null;
}): Rendered {
  const code = formatCode(input.code);
  const lead = LEAD[input.purpose](input.teamName ?? null);
  const action = input.purpose === "sign-in" ? "Sign in" : "Continue";

  const text = [
    lead,
    "",
    `    ${code}`,
    "",
    "Type it into Ardawn, or open this link on the same device:",
    input.link,
    "",
    "It works once, for 15 minutes.",
    "If you did not ask for it, ignore this email. Nobody can get in without the code.",
  ].join("\n");

  const html = frame(
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${escape(lead)}</p>
<div style="font-size:32px;font-weight:700;letter-spacing:0.15em;font-variant-numeric:tabular-nums;margin:8px 0 20px">${escape(code)}</div>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#45443f">Type it into Ardawn, or open the link on the same device.</p>
<p style="margin:0 0 4px">${button(input.link, action)}</p>`,
    "It works once, for 15 minutes. If you did not ask for it, ignore this email. Nobody can get in without the code.",
  );

  // The code leads the subject, so it can be read off a phone's notification
  // without opening the mail app and losing your place in Ardawn.
  return { subject: `${code} is your Ardawn code`, text, html };
}

export function digestMail(input: {
  name: string;
  teamName: string;
  lines: DigestLine[];
  /** Absolute; the lines' hrefs are paths on the site. */
  appUrl: string;
  unsubscribeUrl: string;
  settingsUrl: string;
}): Rendered {
  const first = input.name.split(/\s+/)[0] || input.name;
  const lead = `Hi ${first}, here is what is new for ${input.teamName}.`;
  const lines = input.lines.map((l) => ({ text: l.text, url: input.appUrl + l.href }));

  const text = [
    lead,
    "",
    ...lines.flatMap((l) => [l.text, l.url, ""]),
    "You get these because shares on Ardawn are emailed to you.",
    `Stop them: ${input.unsubscribeUrl}`,
  ].join("\n");

  const html = frame(
    `<p style="margin:0 0 20px;font-size:15px;line-height:1.5">${escape(lead)}</p>
${lines
  .map(
    (l) =>
      `<p style="margin:0 0 14px;font-size:15px;line-height:1.4"><a href="${escape(l.url)}" style="color:#1d1d1b;font-weight:600">${escape(l.text)}</a></p>`,
  )
  .join("\n")}`,
    `You get these because shares on Ardawn are emailed to you. <a href="${escape(input.unsubscribeUrl)}" style="color:#6b6a66">Stop these emails</a> or <a href="${escape(input.settingsUrl)}" style="color:#6b6a66">change your settings</a>.`,
  );

  return { subject: digestSubject(input.lines), text, html };
}
