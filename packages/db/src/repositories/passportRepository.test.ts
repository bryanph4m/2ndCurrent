import { describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: { recoveryPassport: { findFirst: vi.fn() } },
}));

vi.mock("../client", () => ({ db: dbMock }));

const { findPublishedPassportBySlug } = await import("./passportRepository");

// Architecture doc section 16.8: the public passport page must never see the
// row id, the item's internal id, the contact id, or a raw provider id - the
// only defense that survives a page-rendering mistake is not selecting them
// from the database at all.
describe("findPublishedPassportBySlug", () => {
  it("selects only public-safe columns", async () => {
    dbMock.recoveryPassport.findFirst.mockResolvedValue({});

    await findPublishedPassportBySlug("item-1-passport");

    const args = dbMock.recoveryPassport.findFirst.mock.calls[0]![0];
    expect(args.select.id).toBeUndefined();
    expect(args.select.itemId).toBeUndefined();
    expect(args.select.publicSlug).toBe(true);
    expect(args.select.title).toBe(true);
  });

  it("only returns a published passport", async () => {
    dbMock.recoveryPassport.findFirst.mockResolvedValue(null);

    await findPublishedPassportBySlug("item-1-passport");

    const args = dbMock.recoveryPassport.findFirst.mock.calls[0]![0];
    expect(args.where).toEqual({ publicSlug: "item-1-passport", publishedAt: { not: null } });
  });
});
