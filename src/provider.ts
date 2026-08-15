const SYMBOLS = {
  mtkruto_ige_abi_version: {
    parameters: [],
    result: "u32",
  },
  mtkruto_ige256_supported: {
    parameters: [],
    result: "i32",
  },
  mtkruto_ige256_encrypt: {
    parameters: ["buffer", "buffer", "u32", "buffer", "buffer"],
    result: "i32",
  },
  mtkruto_ige256_decrypt: {
    parameters: ["buffer", "buffer", "u32", "buffer", "buffer"],
    result: "i32",
  },
} as const satisfies Deno.ForeignLibraryInterface;

export type Ige256 = (data: Uint8Array, key: Uint8Array, iv: Uint8Array) => Uint8Array<ArrayBuffer>;
export type NativeIgeTarget = "darwin-aarch64" | "darwin-x86_64" | "linux-aarch64" | "linux-x86_64";

export interface OpenNativeIgeOptions {
  libraryPath?: string | URL;
}

export interface NativeIgeProvider {
  readonly target: NativeIgeTarget;
  readonly libraryPath: string | URL;
  readonly closed: boolean;
  readonly ige256Encrypt: Ige256;
  readonly ige256Decrypt: Ige256;
  close(): void;
  [Symbol.dispose](): void;
}

function currentTarget(): NativeIgeTarget {
  if (Deno.build.os === "darwin" && Deno.build.arch === "aarch64") {
    return "darwin-aarch64";
  } else if (Deno.build.os === "darwin" && Deno.build.arch === "x86_64") {
    return "darwin-x86_64";
  } else if (Deno.build.os === "linux" && Deno.build.arch === "aarch64") {
    return "linux-aarch64";
  } else if (Deno.build.os === "linux" && Deno.build.arch === "x86_64") {
    return "linux-x86_64";
  } else {
    throw new Deno.errors.NotSupported(`Native AES-IGE is not available for ${Deno.build.os}-${Deno.build.arch}.`);
  }
}

function defaultLibraryUrl(target: NativeIgeTarget): URL {
  const filename = target.startsWith("darwin-") ? "libmtkruto_ige.dylib" : "libmtkruto_ige.so";
  const url = new URL(`../artifacts/${target}/${filename}`, import.meta.url);
  if (url.protocol !== "file:") {
    throw new TypeError(
      "Automatic native-library discovery requires a local package. Pass a local libraryPath explicitly.",
    );
  }
  return url;
}

function validate(data: Uint8Array, key: Uint8Array, iv: Uint8Array): void {
  if (data.byteLength === 0 || data.byteLength % 16 !== 0) {
    throw new RangeError("Data must be non-empty and divisible by 16 bytes.");
  }
  if (data.byteLength > 0xFFFF_FFFF) {
    throw new RangeError("Data cannot exceed 4 GiB.");
  }
  if (key.byteLength !== 32) {
    throw new RangeError("Key must be 32 bytes.");
  }
  if (iv.byteLength !== 32) {
    throw new RangeError("IV must be 32 bytes.");
  }
}

export function openNativeIge(options: OpenNativeIgeOptions = {}): NativeIgeProvider {
  const target = currentTarget();
  const libraryPath = options.libraryPath ?? defaultLibraryUrl(target);
  const library = Deno.dlopen(libraryPath, SYMBOLS);
  const abiVersion = library.symbols.mtkruto_ige_abi_version();
  if (abiVersion !== 1) {
    library.close();
    throw new Error(`Unsupported native AES-IGE ABI version ${abiVersion}.`);
  }
  if (library.symbols.mtkruto_ige256_supported() !== 1) {
    library.close();
    throw new Deno.errors.NotSupported("This CPU does not provide the required hardware AES instructions.");
  }

  let closed = false;
  const transform = (encrypt: boolean, data: Uint8Array, key: Uint8Array, iv: Uint8Array) => {
    if (closed) {
      throw new Error("The native AES-IGE provider is closed.");
    }
    validate(data, key, iv);

    const output = new Uint8Array(data.byteLength);
    const status = encrypt
      ? library.symbols.mtkruto_ige256_encrypt(data, output, data.byteLength, key, iv)
      : library.symbols.mtkruto_ige256_decrypt(data, output, data.byteLength, key, iv);
    if (status !== 0) {
      throw new Error(`Native AES-IGE failed with status ${status}.`);
    }
    return output;
  };

  const provider: NativeIgeProvider = {
    target,
    libraryPath,
    get closed() {
      return closed;
    },
    ige256Encrypt: (data, key, iv) => transform(true, data, key, iv),
    ige256Decrypt: (data, key, iv) => transform(false, data, key, iv),
    close() {
      if (!closed) {
        closed = true;
        library.close();
      }
    },
    [Symbol.dispose]() {
      this.close();
    },
  };
  return provider;
}
