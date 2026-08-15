import type { ImageObservation } from "@secondcurrent/domain";
import type { AnalyzeImageInput, VisionProvider } from "./types";

// Keyed by the sha256 of the uploaded image bytes (section 35.2). An unknown
// hash throws rather than falling back to a generic observation, so a real
// Phase 5 bug (e.g. a fixture never seeded for a demo photo) fails loudly
// instead of silently returning a plausible-looking wrong answer.
export class FixtureVisionProvider implements VisionProvider {
  constructor(private readonly observationsBySha256: Readonly<Record<string, ImageObservation>>) {}

  async analyzeImage(input: AnalyzeImageInput): Promise<ImageObservation> {
    const observation = this.observationsBySha256[input.sha256];
    if (!observation) {
      throw new Error(`No fixture vision observation for sha256 ${input.sha256}`);
    }
    return observation;
  }
}
