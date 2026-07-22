export type DuplicateRecommendation =
  | 'OK'
  | 'REVIEW_BEFORE_CREATE'
  | 'HIGH_CONFIDENCE_DUPLICATE';

export interface DuplicateMatchSummary {
  customerId: string;
  name: string;
  score: number;
  recommendation: DuplicateRecommendation;
}
