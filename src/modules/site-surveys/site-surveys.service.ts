import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { NotificationsRepository } from '../notifications/notifications.repository';
import type { AuthenticatedUser } from '../../types/auth.types';
import type {
  CreateSiteSurveyDto,
  SiteSurveyPatch,
} from './dto/site-survey.dto';
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

  list(
    user: AuthenticatedUser,
    options: { search?: string; page?: string; pageSize?: string },
  ) {
    return this.surveysRepository.list(user.tenantId, {
      surveyedByUserId: scopeFor(user),
      search: options.search,
      page: options.page,
      pageSize: options.pageSize,
    });
  }

  async getById(user: AuthenticatedUser, id: string) {
    const survey = await this.surveysRepository.findById(
      user.tenantId,
      id,
      scopeFor(user),
    );
    if (!survey) {
      throw new NotFoundException('Site survey not found');
    }
    return survey;
  }

  update(user: AuthenticatedUser, id: string, dto: SiteSurveyPatch) {
    return this.surveysRepository.update(
      user.tenantId,
      id,
      dto,
      scopeFor(user),
    );
  }

  delete(user: AuthenticatedUser, id: string) {
    return this.surveysRepository.delete(user.tenantId, id, scopeFor(user));
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

/**
 * A salesperson sees, edits and deletes only the sheets they submitted —
 * enough to confirm the submission arrived and fix a typo, which is what
 * stops them going back to Telegram. Everyone else on this controller is a
 * manager and acts on all of them. Undefined means unscoped.
 */
const scopeFor = (user: AuthenticatedUser): string | undefined =>
  user.role === 'SALESPERSON' ? user.userId : undefined;
