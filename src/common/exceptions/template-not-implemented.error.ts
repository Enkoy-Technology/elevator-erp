import { DomainError } from './domain.error';

/**
 * Thrown by DocumentPdfService for a `DocumentTemplate` name that exists in
 * the type union (so Phases 3/4 can already type against it) but has no
 * registered HTML builder yet. 400-class: the caller asked for a document
 * kind the platform doesn't know how to produce today, not a server fault.
 */
export class TemplateNotImplementedError extends DomainError {
  readonly status = 400;
  readonly problemType = 'template-not-implemented';
  readonly title = 'Document template not implemented';

  constructor(templateName: string) {
    super(`No PDF template is registered for "${templateName}" yet.`);
  }
}
