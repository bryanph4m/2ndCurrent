import type { ImageObservation } from "@secondcurrent/domain";

export type AnalyzeImageInput = {
  objectKey: string;
  sha256: string;
  imageRole: ImageObservation["imageRole"];
  sellerDescription?: string;
};

export interface VisionProvider {
  analyzeImage(input: AnalyzeImageInput): Promise<ImageObservation>;
}

export type { ImageObservation };
