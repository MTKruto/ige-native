// @ts-check
// @ts-self-types="./napi.d.ts"

import { createRequire } from "node:module";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** @typedef {import("./napi.d.ts").Ige256} Ige256 */
/** @typedef {import("./napi.d.ts").NapiIgeProvider} NapiIgeProvider */
/** @typedef {import("./napi.d.ts").NapiIgeTarget} NapiIgeTarget */
/** @typedef {import("./napi.d.ts").OpenNapiIgeOptions} OpenNapiIgeOptions */

/**
 * @typedef NapiBinding
 * @property {number} abiVersion
 * @property {() => boolean} supported
 * @property {Ige256} ige256Encrypt
 * @property {Ige256} ige256Decrypt
 */

/** @returns {NapiIgeTarget} */
function currentTarget() {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "darwin-aarch64";
  } else if (process.platform === "darwin" && process.arch === "x64") {
    return "darwin-x86_64";
  } else if (process.platform === "linux" && process.arch === "arm64") {
    return "linux-aarch64";
  } else if (process.platform === "linux" && process.arch === "x64") {
    return "linux-x86_64";
  } else if (process.platform === "win32" && process.arch === "x64") {
    return "windows-x86_64";
  }
  throw new Error(`Native AES-IGE is not available for ${process.platform}-${process.arch}.`);
}

/** @param {NapiIgeTarget} target */
function defaultAddonUrl(target) {
  const url = new URL(`./artifacts/${target}/mtkruto_ige.node`, import.meta.url);
  if (url.protocol !== "file:") {
    throw new TypeError(
      "Automatic native-addon discovery requires a local package. Pass a local addonPath explicitly.",
    );
  }
  return url;
}

/**
 * Opens the Node-API AES-IGE provider.
 *
 * @param {OpenNapiIgeOptions} [options]
 * @returns {NapiIgeProvider}
 */
export function openNapiIge(options = {}) {
  const target = currentTarget();
  const addonPath = options.addonPath ?? defaultAddonUrl(target);
  const requirePath = addonPath instanceof URL ? fileURLToPath(addonPath) : resolve(addonPath);
  const require = createRequire(requirePath);
  const binding = /** @type {NapiBinding} */ (require(requirePath));

  if (binding.abiVersion !== 1) {
    throw new Error(`Unsupported native AES-IGE ABI version ${binding.abiVersion}.`);
  }
  if (!binding.supported()) {
    throw new Error("This CPU does not provide the required hardware AES instructions.");
  }
  return {
    target,
    addonPath,
    ige256Encrypt: binding.ige256Encrypt,
    ige256Decrypt: binding.ige256Decrypt,
  };
}

/** @type {NapiIgeProvider | undefined} */
let defaultProvider;

/** @returns {NapiIgeProvider} */
function getDefaultProvider() {
  return defaultProvider ??= openNapiIge();
}

/**
 * @param {Uint8Array} data
 * @param {Uint8Array} key
 * @param {Uint8Array} iv
 * @returns {Uint8Array<ArrayBuffer>}
 */
export function ige256Encrypt(data, key, iv) {
  return getDefaultProvider().ige256Encrypt(data, key, iv);
}

/**
 * @param {Uint8Array} data
 * @param {Uint8Array} key
 * @param {Uint8Array} iv
 * @returns {Uint8Array<ArrayBuffer>}
 */
export function ige256Decrypt(data, key, iv) {
  return getDefaultProvider().ige256Decrypt(data, key, iv);
}
