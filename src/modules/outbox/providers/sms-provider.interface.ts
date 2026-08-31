/**
 * One adapter, one interface — the SMS provider is still being chosen (see
 * task-1-brief.md), so nothing above this line may know which one it is.
 * The real adapter (Task 3) is just another class implementing this.
 */
export interface SmsProvider {
  readonly name: string;
  send(to: string, body: string): Promise<{ providerMessageId: string }>;
}
