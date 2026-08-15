import { assertTransition } from "../services/transitions";

export type OrderState =
  | "DRAFT"
  | "CHECKOUT_CREATED"
  | "PAID"
  | "FULFILLING"
  | "COMPLETED"
  | "EXPIRED"
  | "CANCELED"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "FAILED";

export const ORDER_TRANSITIONS: Record<OrderState, readonly OrderState[]> = {
  DRAFT: ["CHECKOUT_CREATED", "CANCELED", "FAILED"],
  CHECKOUT_CREATED: ["PAID", "EXPIRED", "CANCELED", "FAILED"],
  PAID: ["FULFILLING", "REFUND_PENDING", "FAILED"],
  FULFILLING: ["COMPLETED", "FAILED"],
  REFUND_PENDING: ["REFUNDED", "FAILED"],
  COMPLETED: [],
  EXPIRED: [],
  CANCELED: [],
  REFUNDED: [],
  FAILED: [],
};

export function assertOrderTransition(from: OrderState, to: OrderState): void {
  assertTransition("ServiceOrder", ORDER_TRANSITIONS, from, to);
}
