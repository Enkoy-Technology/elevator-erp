import { Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import type { CreateNotificationDto } from './dto/notification.dto';
import { NotificationsRepository } from './notifications.repository';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepository: NotificationsRepository,
  ) {}

  list(
    user: AuthenticatedUser,
    options: {
      unreadOnly?: boolean;
      page?: string;
      pageSize?: string;
    },
  ) {
    return this.notificationsRepository.listForUser(
      user.tenantId,
      user.userId,
      options,
    );
  }

  create(user: AuthenticatedUser, dto: CreateNotificationDto) {
    return this.notificationsRepository.create(
      user.tenantId,
      user.userId,
      dto,
    );
  }

  markRead(user: AuthenticatedUser, id: string) {
    return this.notificationsRepository.markRead(
      user.tenantId,
      user.userId,
      id,
    );
  }

  async markAllRead(user: AuthenticatedUser) {
    const updated = await this.notificationsRepository.markAllRead(
      user.tenantId,
      user.userId,
    );
    return { updated };
  }
}
