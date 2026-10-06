import { DomainError } from './domain.error';

/** A site is registered once; a second sheet for the same project name is refused (client, 2026-10-06). */
export class SiteSurveyDuplicateError extends DomainError {
  readonly status = 409;
  readonly problemType = 'site-survey-duplicate';
  readonly title = 'Site survey already registered';

  constructor(projectName: string, surveyDate: string) {
    super(
      `A site survey for "${projectName}" is already registered (dated ${surveyDate}). Open that one and update it instead.`,
    );
  }
}
