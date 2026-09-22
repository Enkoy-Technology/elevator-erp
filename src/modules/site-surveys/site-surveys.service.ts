import { Injectable, Logger } from '@nestjs/common';

import { NotificationsRepository } from '../notifications/notifications.repository';
import type { AuthenticatedUser } from '../../types/auth.types';
import type { CreateSiteSurveyDto } from './dto/site-survey.dto';
import {
  SiteSurveysRepository,
  type SiteSurveyRecord,
} from './site-surveys.repository';

@Injectable()
export class SiteSurveysService {
  private readonly logger = new Logger(SiteSurveysService.name);

  constructor(
    private readonly surveysRepository: SiteSurveysRepository,
    private readonly notificationsRepository: NotificationsRepository,
  ) {}

  list(user: AuthenticatedUser, options: { page?: string; pageSize?: string }) {
    return this.surveysRepository.list(user.tenantId, {
      // A salesperson sees only their own sheets — enough to confirm the
      // submission arrived, which is what stops them going back to Telegram.
      // Everyone else on this controller is a manager and sees all of them.
      surveyedByUserId: user.role === 'SALESPERSON' ? user.userId : undefined,
      page: options.page,
      pageSize: options.pageSize,
    });
  }

  async create(
    user: AuthenticatedUser,
    dto: CreateSiteSurveyDto,
  ): Promise<SiteSurveyRecord> {
    const survey = await this.surveysRepository.create(
      user.tenantId,
      user.userId,
      dto,
    );
    // The sheet used to arrive as a Telegram message; a manager who has to
    // go and look at a list would simply keep using Telegram. Failing to
    // tell them must never lose the sheet, so this is fire-and-log.
    try {
      const managerIds = await this.surveysRepository.listManagerIds(
        user.tenantId,
      );
      for (const userId of managerIds) {
        await this.notificationsRepository.create(user.tenantId, user.userId, {
          userId,
          type: 'GENERAL',
          title: `New site survey: ${survey.projectName}`,
          body: summarize(survey),
          linkPath: '/surveys',
        });
      }
    } catch (err) {
      this.logger.error(
        `Site survey ${survey.id} saved but the managers were not notified: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return survey;
  }
}

/**
 * The sheet in one line, skipping whatever the salesperson left blank. Who
 * collected it is NOT in here — the notification links to the list, where
 * the Collected by column says so, and that saves a lookup per manager.
 */
const summarize = (survey: SiteSurveyRecord): string =>
  [
    survey.shaftWidthCm && survey.shaftDepthCm
      ? `Shaft ${survey.shaftWidthCm} x ${survey.shaftDepthCm} cm`
      : null,
    survey.floors,
    survey.machineRoom,
    survey.units
      ? `${survey.units} unit${survey.units === 1 ? '' : 's'}`
      : null,
  ]
    .filter(Boolean)
    .join(', ') || `Collected ${survey.surveyDate}`;
