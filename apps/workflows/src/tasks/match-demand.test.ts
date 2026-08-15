import { beforeEach, describe, expect, it, vi } from "vitest";

const { matchDemandMock } = vi.hoisted(() => ({ matchDemandMock: vi.fn() }));

vi.mock("@secondcurrent/db", () => ({ matchDemand: matchDemandMock }));
vi.mock("@renderinc/sdk/workflows", () => ({
  task: vi.fn((_options: unknown, handler: unknown) => handler),
}));

const { matchDemandById } = await import("./match-demand");

describe("match-demand task", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reloads and matches a demand by its stored id", async () => {
    matchDemandMock.mockResolvedValue({ matchId: "match_1" });

    await expect(matchDemandById("demand_1")).resolves.toEqual({ matchId: "match_1" });
    expect(matchDemandMock).toHaveBeenCalledWith("demand_1");
  });
});
