import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ige256Decrypt, ige256Encrypt, openNapiIge } from "../napi/napi.js";

function bytes(length, seed) {
  const storage = new Uint8Array(length + 9);
  const view = storage.subarray(5, 5 + length);
  for (let i = 0; i < view.byteLength; ++i) {
    view[i] = (seed + i * 29 + (i >>> 8) * 17) & 0xFF;
  }
  return view;
}

function decodeHex(value) {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

test("Node-API addon metadata and loader", () => {
  const provider = openNapiIge();
  const expectedOs = process.platform === "win32" ? "windows" : process.platform;
  const expectedArch = process.arch === "arm64" ? "aarch64" : "x86_64";
  const expectedTarget = `${expectedOs}-${expectedArch}`;
  assert.equal(provider.target, expectedTarget);
  assert.equal(provider.addonPath instanceof URL, true);

  const require = createRequire(import.meta.url);
  const binding = require(fileURLToPath(provider.addonPath));
  assert.equal(binding.abiVersion, 1);
  assert.equal(binding.supported(), true);
  assert.equal(typeof binding.ige256Encrypt, "function");
  assert.equal(typeof binding.ige256Decrypt, "function");

  const customProvider = openNapiIge({ addonPath: fileURLToPath(provider.addonPath) });
  assert.equal(customProvider.target, provider.target);
});

test("Node-API AES-256-IGE matches the fixed vector", () => {
  const plaintext = Uint8Array.from({ length: 32 }, (_, i) => i);
  const key = Uint8Array.from({ length: 32 }, (_, i) => i);
  const iv = Uint8Array.from({ length: 32 }, (_, i) => i + 32);
  const ciphertext = decodeHex("42e66e1a756cccf5b27acc47523ad074ee39bf54e3db37bbdf415df6b400fca9");
  assert.deepEqual(ige256Encrypt(plaintext, key, iv), ciphertext);
  assert.deepEqual(ige256Decrypt(ciphertext, key, iv), plaintext);
});

test("Node-API AES-256-IGE handles offset views without mutating inputs", () => {
  const provider = openNapiIge();
  for (const length of [16, 32, 64, 1024, 1024 * 1024]) {
    for (const useBuffer of [false, true]) {
      const source = bytes(length, length & 0xFF);
      const data = useBuffer ? Buffer.from(source) : source;
      const key = useBuffer ? Buffer.from(bytes(32, 0x33)) : bytes(32, 0x33);
      const iv = useBuffer ? Buffer.from(bytes(32, 0x77)) : bytes(32, 0x77);
      const originalData = data.slice();
      const originalKey = key.slice();
      const originalIv = iv.slice();

      const encrypted = provider.ige256Encrypt(data, key, iv);
      assert.equal(encrypted.constructor, Uint8Array);
      assert.notEqual(encrypted.buffer, data.buffer);
      assert.deepEqual(
        provider.ige256Decrypt(encrypted, key, iv),
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      );
      assert.deepEqual(data, originalData);
      assert.deepEqual(key, originalKey);
      assert.deepEqual(iv, originalIv);
    }
  }
});

test("Node-API AES-256-IGE validates inputs", () => {
  const key = new Uint8Array(32);
  const iv = new Uint8Array(32);
  assert.throws(() => ige256Encrypt(), TypeError);
  assert.throws(() => ige256Encrypt([], key, iv), TypeError);
  assert.throws(() => ige256Encrypt(new DataView(new ArrayBuffer(16)), key, iv), TypeError);
  assert.throws(() => ige256Encrypt(new Uint8ClampedArray(16), key, iv), TypeError);
  assert.throws(() => ige256Encrypt(new Uint8Array(), key, iv), RangeError);
  assert.throws(() => ige256Encrypt(new Uint8Array(15), key, iv), RangeError);
  assert.throws(() => ige256Encrypt(new Uint8Array(16), new Uint8Array(31), iv), RangeError);
  assert.throws(() => ige256Decrypt(new Uint8Array(16), key, new Uint8Array(31)), RangeError);

  const shared = new Uint8Array(new SharedArrayBuffer(32));
  assert.throws(() => ige256Encrypt(shared, key, iv), TypeError);

  const detached = new Uint8Array(16);
  structuredClone(detached, { transfer: [detached.buffer] });
  assert.throws(() => ige256Encrypt(detached, key, iv), TypeError);

  const getterView = new Uint8Array(16);
  Object.defineProperty(getterView, "buffer", {
    get() {
      throw new Error("The public buffer getter must not be invoked.");
    },
  });
  assert.doesNotThrow(() => ige256Encrypt(getterView, key, iv));

  const invalidatedData = new Uint8Array(16);
  const originalHasInstance = Object.getOwnPropertyDescriptor(SharedArrayBuffer, Symbol.hasInstance);
  let sharedArrayBufferProbe = 0;
  Object.defineProperty(SharedArrayBuffer, Symbol.hasInstance, {
    configurable: true,
    value(value) {
      if (++sharedArrayBufferProbe === 2) {
        structuredClone(invalidatedData, { transfer: [invalidatedData.buffer] });
      }
      return Function.prototype[Symbol.hasInstance].call(this, value);
    },
  });
  try {
    assert.throws(() => ige256Encrypt(invalidatedData, key, iv), TypeError);
    assert.equal(invalidatedData.byteLength, 0);
  } finally {
    if (originalHasInstance === undefined) {
      delete SharedArrayBuffer[Symbol.hasInstance];
    } else {
      Object.defineProperty(SharedArrayBuffer, Symbol.hasInstance, originalHasInstance);
    }
  }
});
