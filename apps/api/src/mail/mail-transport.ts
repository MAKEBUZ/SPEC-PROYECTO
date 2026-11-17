export interface MailMessage { recipient: string; subject: string; text: string }
export interface MailTransport { send(message: MailMessage): Promise<void> }

// Captures synthetic messages in memory. No SMTP, SES or network fallback.
export class CaptureMailTransport implements MailTransport {
  readonly messages: Readonly<MailMessage>[] = [];
  async send(message: MailMessage): Promise<void> {
    this.messages.push(Object.freeze({ ...message }));
  }
}
