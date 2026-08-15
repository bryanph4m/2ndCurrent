export class ConcurrencyError extends Error {
  readonly entity: string;
  readonly entityId: string;

  constructor(entity: string, entityId: string) {
    super(`${entity} ${entityId} was modified by another request; reload and retry`);
    this.name = "ConcurrencyError";
    this.entity = entity;
    this.entityId = entityId;
  }
}
