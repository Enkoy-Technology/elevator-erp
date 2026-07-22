export abstract class DomainError extends Error {
  abstract readonly status: number;
  /** RFC 7807 `type` URI suffix, e.g. "tenant-isolation". */
  abstract readonly problemType: string;
  abstract readonly title: string;

  constructor(detail: string) {
    super(detail);
    this.name = new.target.name;
  }
}
