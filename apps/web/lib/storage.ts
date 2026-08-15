import {
  MemoryObjectStorage,
  S3ObjectStorage,
  type ObjectStorage,
} from "@secondcurrent/integrations";
import { getServerEnvironment, requireServerEnvironmentValue } from "./env";

let objectStorage: ObjectStorage | undefined;

export function getObjectStorage(): ObjectStorage {
  if (!objectStorage) {
    const environment = getServerEnvironment();
    objectStorage =
      environment.OBJECT_STORAGE_MODE === "s3"
        ? new S3ObjectStorage({
            endpoint: requireServerEnvironmentValue("S3_ENDPOINT"),
            region: requireServerEnvironmentValue("S3_REGION"),
            bucket: requireServerEnvironmentValue("S3_BUCKET"),
            accessKeyId: requireServerEnvironmentValue("S3_ACCESS_KEY_ID"),
            secretAccessKey: requireServerEnvironmentValue("S3_SECRET_ACCESS_KEY"),
            forcePathStyle: environment.S3_FORCE_PATH_STYLE === "true",
          })
        : new MemoryObjectStorage();
  }
  return objectStorage;
}
