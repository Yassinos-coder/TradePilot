import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'node:events';

import { NotificationDispatchInput } from './notification.types';

const NOTIFICATION_DISPATCH_EVENT = 'notification.dispatch';

@Injectable()
export class NotificationEventBusService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationEventBusService.name);
  private readonly emitter = new EventEmitter();

  emit(input: NotificationDispatchInput) {
    this.emitter.emit(NOTIFICATION_DISPATCH_EVENT, input);
  }

  subscribe(listener: (input: NotificationDispatchInput) => Promise<void> | void) {
    const wrapped = (input: NotificationDispatchInput) => {
      Promise.resolve(listener(input)).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Notification listener failed: ${message}`);
      });
    };

    this.emitter.on(NOTIFICATION_DISPATCH_EVENT, wrapped);

    return () => {
      this.emitter.off(NOTIFICATION_DISPATCH_EVENT, wrapped);
    };
  }

  onModuleDestroy() {
    this.emitter.removeAllListeners(NOTIFICATION_DISPATCH_EVENT);
  }
}
