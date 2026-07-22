import { Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import type { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsRepository } from './settings.repository';

@Injectable()
export class SettingsService {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  get(user: AuthenticatedUser) {
    return this.settingsRepository.get(user.tenantId);
  }

  update(user: AuthenticatedUser, dto: UpdateSettingsDto) {
    return this.settingsRepository.update(user.tenantId, dto);
  }
}
