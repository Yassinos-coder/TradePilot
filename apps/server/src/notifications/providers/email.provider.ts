import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

import { NotificationDeliveryPayload, NotificationProvider } from '../notification.types';

@Injectable()
export class EmailProvider implements NotificationProvider {
  readonly channel = 'email' as const;
  private readonly logger = new Logger(EmailProvider.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASSWORD');

    if (!host || !port || !user || !pass) {
      this.logger.warn(
        'SMTP is not fully configured; email notifications will be logged and skipped.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      auth: {
        user,
        pass,
      },
      secure: port === 465,
    });
  }

  isEnabled(): boolean {
    return this.transporter !== null;
  }

  async send(payload: NotificationDeliveryPayload): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM');

    if (!payload.email) {
      this.logger.warn(`Skipping email notification for ${payload.userId}: recipient is missing`);
      return;
    }

    if (!this.transporter || !from) {
      this.logger.log(
        `Email notification skipped (provider disabled). user=${payload.userId} event=${payload.event}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from,
      to: payload.email,
      subject: payload.title,
      text: payload.body,
      html: payload.html,
    });
  }
}
