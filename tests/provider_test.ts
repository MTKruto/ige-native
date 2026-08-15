import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  ige256Decrypt as referenceDecrypt,
  ige256Encrypt as referenceEncrypt,
  init as initReference,
} from "@roj/tgcrypto";
import { openNativeIge } from "../mod.ts";

function bytes(length: number, seed: number): Uint8Array<ArrayBuffer> {
  const storage = new Uint8Array(length + 9);
  const view = storage.subarray(5, 5 + length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < view.byteLength; ++i) {
    view[i] = (seed + i * 29 + (i >>> 8) * 17) & 0xFF;
  }
  return view;
}

function decodeHex(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

Deno.test("native AES-256-IGE matches the reference implementation", async (t) => {
  await initReference();
  const provider = openNativeIge();

  try {
    await t.step("fixed vector", () => {
      const plaintext = Uint8Array.from({ length: 32 }, (_, i) => i);
      const key = Uint8Array.from({ length: 32 }, (_, i) => i);
      const iv = Uint8Array.from({ length: 32 }, (_, i) => i + 32);
      const ciphertext = decodeHex("42e66e1a756cccf5b27acc47523ad074ee39bf54e3db37bbdf415df6b400fca9");
      assertEquals(provider.ige256Encrypt(plaintext, key, iv), ciphertext);
      assertEquals(provider.ige256Decrypt(ciphertext, key, iv), plaintext);
    });

    for (const length of [16, 32, 64, 1024, 1024 * 1024]) {
      await t.step(`${length} bytes`, () => {
        const data = bytes(length, length & 0xFF);
        const key = bytes(32, 0x33);
        const iv = bytes(32, 0x77);
        const originalData = data.slice();
        const originalKey = key.slice();
        const originalIv = iv.slice();

        const expectedEncrypted = referenceEncrypt(data, key, iv);
        const encrypted = provider.ige256Encrypt(data, key, iv);
        assertEquals(encrypted, expectedEncrypted);
        assert(encrypted.buffer !== data.buffer);
        assertEquals(provider.ige256Decrypt(encrypted, key, iv), data);
        assertEquals(referenceDecrypt(encrypted, key, iv), data);
        assertEquals(data, originalData);
        assertEquals(key, originalKey);
        assertEquals(iv, originalIv);
      });
    }

    await t.step("invalid inputs", () => {
      const key = new Uint8Array(32);
      const iv = new Uint8Array(32);
      assertThrows(() => provider.ige256Encrypt(new Uint8Array(), key, iv), RangeError);
      assertThrows(() => provider.ige256Encrypt(new Uint8Array(15), key, iv), RangeError);
      assertThrows(() => provider.ige256Encrypt(new Uint8Array(16), new Uint8Array(31), iv), RangeError);
      assertThrows(() => provider.ige256Decrypt(new Uint8Array(16), key, new Uint8Array(31)), RangeError);
    });
  } finally {
    provider.close();
  }

  assert(provider.closed);
  assertThrows(() => provider.ige256Encrypt(new Uint8Array(16), new Uint8Array(32), new Uint8Array(32)));
});
