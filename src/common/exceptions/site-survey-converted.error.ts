import { DomainError } from './domain.error';

/** A sheet opens one project; converting it again would open a second. */
export class SiteSurveyConvertedError extends DomainError {
  readonly status = 409;
  readonly problemType = 'site-survey-converted';
  readonly title = 'Site survey already converted';

  constructor(projectName: string) {
    super(
      `The survey for "${projectName}" already has its project. Open the project to quote it.`,
    );
  }
}
