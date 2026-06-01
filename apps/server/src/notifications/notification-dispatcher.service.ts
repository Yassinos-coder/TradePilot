import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { NotificationEventBusService } from './notification-event-bus.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationDispatcherService implements OnModuleInit, OnModuleDestroy {
  private unsubscribe?: () => void;

  constructor(
    private readonly notificationEventBus: NotificationEventBusService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
    this.unsubscribe = this.notificationEventBus.subscribe(async (input) => {
      await this.notificationsService.notify(input);
    });
  }

  onModuleDestroy() {
    this.unsubscribe?.();
  }
}
