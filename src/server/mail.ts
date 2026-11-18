import net from "node:net";
import tls from "node:tls";
import { all, newId, run } from "./db";
import { t } from "@/lib/i18n";

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

export function queueEmail(recipient: string, template: "verify" | "reset" | "notice", locale: string, vars: Record<string, string>): string {
  const id = newId();
  const language = locale === "af" || locale === "tn" ? locale : "en";
  run(
    "INSERT INTO email_outbox (id, recipient, subject, body, locale, status, attempts, created_at) VALUES (?, ?, ?, ?, ?, 'queued', 0, ?)",
    id,
    recipient,
    fill(t(language, `email.${template}.subject`), vars),
    fill(t(language, `email.${template}.body`), vars),
    language,
    new Date().toISOString(),
  );
  return id;
}

export async function deliverOutbox(): Promise<{ delivered: number; mode: string }> {
  if (!process.env.SMTP_HOST) return { delivered: 0, mode: "queued" };
  const rows = all<{ id: string; recipient: string; subject: string; body: string }>(
    "SELECT id, recipient, subject, body FROM email_outbox WHERE status = 'queued' AND attempts < 5 ORDER BY created_at LIMIT 20",
  );
  let delivered = 0;
  for (const row of rows) {
    try {
      await sendSmtp({ to: row.recipient, subject: row.subject, body: row.body });
      run("UPDATE email_outbox SET status = 'sent', sent_at = ?, attempts = attempts + 1, last_error = NULL WHERE id = ?", new Date().toISOString(), row.id);
      delivered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "SMTP send failed";
      run("UPDATE email_outbox SET attempts = attempts + 1, last_error = ?, status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'queued' END WHERE id = ?", message.slice(0, 300), row.id);
    }
  }
  return { delivered, mode: "smtp" };
}

function headerValue(value: string): string {
  return value.replace(/[\r\n]/g, " ").slice(0, 200);
}

function mailbox(value: string): string {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (!match) throw new Error("SMTP address is missing");
  return match[0];
}

class SmtpTalk {
  private buffer = "";
  private lines: string[] = [];
  private waiters: Array<(line: string) => void> = [];
  private readonly onData: (chunk: Buffer) => void;

  constructor(private socket: net.Socket) {
    this.onData = (chunk) => {
      this.buffer += chunk.toString("utf8");
      let end = this.buffer.indexOf("\n");
      while (end >= 0) {
        const line = this.buffer.slice(0, end).replace(/\r$/, "");
        this.buffer = this.buffer.slice(end + 1);
        if (line.length < 4 || line[3] !== "-") {
          const waiter = this.waiters.shift();
          if (waiter) waiter(line);
          else this.lines.push(line);
        }
        end = this.buffer.indexOf("\n");
      }
    };
    socket.on("data", this.onData);
  }

  detach(): void {
    this.socket.off("data", this.onData);
  }

  write(line: string): void {
    this.socket.write(`${line}\r\n`);
  }

  read(): Promise<string> {
    const queued = this.lines.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SMTP timed out")), 15000);
      this.waiters.push((line) => {
        clearTimeout(timer);
        resolve(line);
      });
    });
  }

  async expect(code: string): Promise<void> {
    const line = await this.read();
    if (!line.startsWith(code)) throw new Error(`SMTP ${line}`);
  }
}

async function sendSmtp(message: { to: string; subject: string; body: string }): Promise<void> {
  const to = mailbox(message.to);
  const host = process.env.SMTP_HOST || "";
  const port = Number(process.env.SMTP_PORT || 587);
  const from = mailbox(process.env.SMTP_FROM || "desk@rustenburg.today");
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "";
  let socket: net.Socket = port === 465 ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
  socket.setTimeout(15000);
  await new Promise<void>((resolve, reject) => {
    socket.once(port === 465 ? "secureConnect" : "connect", () => resolve());
    socket.once("error", reject);
  });
  let talk = new SmtpTalk(socket);
  try {
    await talk.expect("220");
    talk.write("EHLO rustenburg.today");
    await talk.expect("250");
    if (port === 587) {
      talk.write("STARTTLS");
      await talk.expect("220");
      talk.detach();
      const secure = tls.connect({ socket, servername: host });
      await new Promise<void>((resolve, reject) => {
        secure.once("secureConnect", () => resolve());
        secure.once("error", reject);
      });
      socket = secure;
      talk = new SmtpTalk(secure);
      talk.write("EHLO rustenburg.today");
      await talk.expect("250");
    }
    if (user) {
      talk.write("AUTH LOGIN");
      await talk.expect("334");
      talk.write(Buffer.from(user).toString("base64"));
      await talk.expect("334");
      talk.write(Buffer.from(pass).toString("base64"));
      await talk.expect("235");
    }
    talk.write(`MAIL FROM:<${from}>`);
    await talk.expect("250");
    talk.write(`RCPT TO:<${to}>`);
    await talk.expect("250");
    talk.write("DATA");
    await talk.expect("354");
    const body = message.body.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    socket.write(`Subject: ${headerValue(message.subject)}\r\nTo: ${to}\r\nFrom: ${from}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n.\r\n`);
    await talk.expect("250");
    talk.write("QUIT");
  } finally {
    socket.end();
  }
}
