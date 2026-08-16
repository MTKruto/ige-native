export type Ige256 = (data: Uint8Array, key: Uint8Array, iv: Uint8Array) => Uint8Array<ArrayBuffer>;

export type NapiIgeTarget =
  | "darwin-aarch64"
  | "darwin-x86_64"
  | "linux-aarch64"
  | "linux-x86_64"
  | "windows-x86_64";

export interface OpenNapiIgeOptions {
  addonPath?: string | URL;
}

export interface NapiIgeProvider {
  readonly target: NapiIgeTarget;
  readonly addonPath: string | URL;
  readonly ige256Encrypt: Ige256;
  readonly ige256Decrypt: Ige256;
}

export function openNapiIge(options?: OpenNapiIgeOptions): NapiIgeProvider;
export const ige256Encrypt: Ige256;
export const ige256Decrypt: Ige256;
