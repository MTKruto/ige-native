import { dirname, fromFileUrl, join } from "@std/path";

function target(): string {
  if (
    (Deno.build.os === "darwin" || Deno.build.os === "linux") &&
    (Deno.build.arch === "aarch64" || Deno.build.arch === "x86_64")
  ) {
    return `${Deno.build.os}-${Deno.build.arch}`;
  }
  throw new Deno.errors.NotSupported(`Cannot build native AES-IGE for ${Deno.build.os}-${Deno.build.arch}.`);
}

const root = dirname(dirname(fromFileUrl(import.meta.url)));
const currentTarget = target();
const outputDirectory = join(root, "artifacts", currentTarget);
const output = join(outputDirectory, Deno.build.os === "darwin" ? "libmtkruto_ige.dylib" : "libmtkruto_ige.so");
const source = join(root, "native", "mtkruto_ige.c");
await Deno.mkdir(outputDirectory, { recursive: true });

const args = [
  "-O3",
  "-DNDEBUG",
  "-std=c11",
  "-fPIC",
  "-fvisibility=hidden",
  "-fstack-protector-strong",
  "-Wall",
  "-Wextra",
  "-Werror",
];
if (Deno.build.os === "darwin") {
  args.push("-dynamiclib", "-Wl,-dead_strip");
} else {
  args.push("-shared", "-Wl,--no-undefined", "-Wl,-z,relro,-z,now");
}
args.push(...(Deno.build.arch === "aarch64" ? ["-march=armv8-a+crypto"] : ["-maes", "-msse2"]));
args.push(source, "-o", output);

const command = new Deno.Command(Deno.env.get("CC") ?? "clang", {
  args,
  stdout: "inherit",
  stderr: "inherit",
});
const status = await command.spawn().status;
if (!status.success) {
  Deno.exit(status.code);
}

console.log(output);
