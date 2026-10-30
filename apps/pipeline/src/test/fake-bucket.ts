import { type ObjectStore } from "../documents/object-store.js";

/** An R2 bucket in memory (REQ-TEST-003). */
export class FakeBucket implements ObjectStore {
  readonly objects = new Map<
    string,
    { bytes: Uint8Array; contentType: string | undefined; license: string | undefined }
  >();
  puts = 0;

  head(key: string): Promise<unknown | null> {
    return Promise.resolve(this.objects.get(key) ?? null);
  }

  put(
    key: string,
    value: Uint8Array,
    options?: { httpMetadata?: { contentType: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown> {
    this.puts += 1;
    this.objects.set(key, {
      bytes: value,
      contentType: options?.httpMetadata?.contentType,
      license: options?.customMetadata?.["license"],
    });
    return Promise.resolve({});
  }
}
