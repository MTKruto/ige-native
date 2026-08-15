import { ige256Decrypt as wasmDecrypt, ige256Encrypt as wasmEncrypt, init as initWasm } from "@roj/tgcrypto";
import { openNativeIge } from "../mod.ts";

await initWasm();

const size = 1024 * 1024;
const data = new Uint8Array(size);
for (let i = 0; i < data.byteLength; ++i) {
  data[i] = (i * 31 + (i >>> 8) * 17) & 0xFF;
}
const key = Uint8Array.from({ length: 32 }, (_, i) => i * 7 + 3);
const iv = Uint8Array.from({ length: 32 }, (_, i) => i * 11 + 5);
const encrypted = wasmEncrypt(data, key, iv);
const native = openNativeIge();

Deno.bench({
  name: "WASM decrypt",
  group: "AES-256-IGE decrypt 1 MiB",
  baseline: true,
  fn() {
    wasmDecrypt(encrypted, key, iv);
  },
});

Deno.bench({
  name: "native decrypt",
  group: "AES-256-IGE decrypt 1 MiB",
  fn() {
    native.ige256Decrypt(encrypted, key, iv);
  },
});

Deno.bench({
  name: "WASM encrypt",
  group: "AES-256-IGE encrypt 1 MiB",
  baseline: true,
  fn() {
    wasmEncrypt(data, key, iv);
  },
});

Deno.bench({
  name: "native encrypt",
  group: "AES-256-IGE encrypt 1 MiB",
  fn() {
    native.ige256Encrypt(data, key, iv);
  },
});
