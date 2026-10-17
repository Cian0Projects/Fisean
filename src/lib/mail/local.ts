/**
 * The development outbox. Every email is written to MAIL_OUTBOX (default
 * ./data/outbox) as an .html file you can open in a browser, and its plain
 * text is printed to the terminal, so a sign-in code is right there in the
 * `npm run dev` output.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Mail, Mailer } from "./index";

export class LocalOutbox implements Mailer {
  // Ignored by the bundler's file tracing: the outbox is written at run time
  // and has nothing to do with what gets deployed.
  private readonly dir = resolve(/*turbopackIgnore: true*/ process.env.MAIL_OUTBOX ?? "./data/outbox");

  async send(mail: Mail): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, "")}-${mail.to.replace(/[^a-z0-9@._]/gi, "_")}.html`;
    await writeFile(join(this.dir, name), mail.html);
    console.log(`\n[mail] to ${mail.to}: ${mail.subject}\n${mail.text}\n[mail] saved ${join(this.dir, name)}\n`);
  }
}
