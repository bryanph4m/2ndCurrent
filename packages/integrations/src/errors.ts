export class WebhookVerificationError extends Error {
  readonly provider: string;

  constructor(provider: string, reason: string) {
    super(`Webhook verification failed for ${provider}: ${reason}`);
    this.name = "WebhookVerificationError";
    this.provider = provider;
  }
}
