# MTKruto Native IGE

Hardware-accelerated AES-256-IGE providers for MTKruto's `setIge256Encrypt` and `setIge256Decrypt` hooks.

The TypeScript API is synchronous and preserves MTKruto's current contract: every call returns a fresh buffer and leaves
the data, key, and IV unchanged. One FFI call processes the complete payload.

## Supported targets

- macOS ARM64 (ARMv8 Crypto Extensions)
- macOS x86-64 (AES-NI)
- Linux ARM64 (ARMv8 Crypto Extensions)
- Linux x86-64 (AES-NI)

The initial provider targets Deno. It requires FFI permission and does not support browsers, Node.js, or Bun yet. The C
ABI is runtime-neutral so other bindings can be added later.

## Build

Install Deno and Clang, then run:

```sh
deno task build
```

The library is written to `artifacts/<os>-<architecture>/`.

## Use with MTKruto

```ts
import { openNativeIge } from "@mtkruto/ige-native";
import { setIge256Decrypt, setIge256Encrypt } from "@mtkruto/mtkruto";

const nativeIge = openNativeIge();
setIge256Encrypt(nativeIge.ige256Encrypt);
setIge256Decrypt(nativeIge.ige256Decrypt);

// Keep nativeIge open while any MTKruto client can use the installed functions.
```

Run the application with path-scoped FFI permission when possible:

```sh
deno run --allow-ffi=/absolute/path/to/artifacts app.ts
```

`openNativeIge({ libraryPath })` can load a custom build. It validates the native ABI and CPU features before returning
a provider. Calling a provider after `close()` throws.

Automatic artifact discovery works from a local checkout or locally installed package. Remote JSR modules must pass a
local `libraryPath`; the package does not download or materialize binaries automatically.

## Verify and benchmark

```sh
deno task test
deno task bench
deno task check
```

Tests compare native encryption and decryption with `@roj/tgcrypto` from 16 bytes through 1 MiB, including
non-zero-offset views and input immutability.

On an Apple ARM64 development machine, the included 1 MiB benchmark measured about 0.92 ms per native call versus 14.4
ms for the current WASM implementation (approximately 15.6x faster). Results depend on the CPU and build environment.

## Security

Deno treats native FFI as a powerful permission. This package never requests permission, downloads a binary, or compiles
code at runtime. Build or obtain the native library separately and grant access explicitly.

## License

LGPL-3.0-or-later.
