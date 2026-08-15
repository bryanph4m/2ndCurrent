export type PutObjectInput = {
  objectKey: string;
  bytes: Buffer;
  mimeType: string;
};

export type StoredObject = {
  objectKey: string;
  sizeBytes: number;
};

export interface ObjectStorage {
  putPrivateObject(input: PutObjectInput): Promise<StoredObject>;
  getPrivateObject(objectKey: string): Promise<Buffer>;
  createSignedReadUrl(objectKey: string, ttlSeconds: number): Promise<string>;
  deleteObject(objectKey: string): Promise<void>;
}
