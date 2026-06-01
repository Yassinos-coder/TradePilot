import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

import { NotificationDeliveryPayload, NotificationProvider } from '../notification.types';

@Injectable()
export class EmailProvider implements NotificationProvider {
  readonly channel = 'email' as const;
  private readonly logger = new Logger(EmailProvider.name);
  private transporter: Transporter | null = null;
  private fromAddress: string | null = null;
  private fromName: string | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASSWORD');
    const from = this.configService.get<string>('SMTP_FROM');
    const fromName = this.configService.get<string>('SMTP_FROM_NAME');

    if (!host || !port || !user || !pass || !from) {
      this.logger.warn(
        'SMTP is not fully configured; email notifications will be logged and skipped.',
      );
      return;
    }

    this.fromAddress = from;
    this.fromName = fromName?.trim() || null;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: {
        user,
        pass,
      },
      pool: true,
    });
  }

  isEnabled(): boolean {
    return this.transporter !== null;
  }

  async send(payload: NotificationDeliveryPayload): Promise<void> {
    if (!payload.email) {
      this.logger.warn(`Skipping email notification for ${payload.userId}: recipient is missing`);
      return;
    }

    if (!this.transporter || !this.fromAddress) {
      this.logger.log(
        `Email notification skipped (provider disabled). user=${payload.userId} event=${payload.event}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.fromName
        ? {
            name: this.fromName,
            address: this.fromAddress,
          }
        : this.fromAddress,
      to: payload.email,
      subject: payload.title,
      text: payload.body,
      html: payload.html,
    });
  }
}
