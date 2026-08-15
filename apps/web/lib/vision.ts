import {
  OpenAIVisionProvider,
  FixtureVisionProvider,
  type VisionProvider,
} from "@secondcurrent/integrations";
import { getObjectStorage } from "./storage";

let visionProvider: VisionProvider | undefined;

// FixtureVisionProvider throws on an unseeded sha256 instead of guessing
// (packages/integrations/src/vision/fixture.ts), so mock mode has nothing
// seeded by default - it only analyzes photos a demo has explicitly seeded.
// VISION_PROVIDER=openai is required to exercise the real pipeline.
export function getVisionProvider(): VisionProvider {
  if (visionProvider) {
    return visionProvider;
  }

  if (process.env.VISION_PROVIDER === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.VISION_MODEL;
    if (!apiKey || !model) {
      throw new Error("OPENAI_API_KEY and VISION_MODEL are required when VISION_PROVIDER=openai");
    }
    visionProvider = new OpenAIVisionProvider({ apiKey, model, storage: getObjectStorage() });
  } else {
    visionProvider = new FixtureVisionProvider({});
  }

  return visionProvider;
}
