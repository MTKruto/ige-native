import { dirname, fromFileUrl, join } from "@std/path";

function target(): string {
  if (
    ((Deno.build.os === "darwin" || Deno.build.os === "linux") &&
      (Deno.build.arch === "aarch64" || Deno.build.arch === "x86_64")) ||
    (Deno.build.os === "windows" && Deno.build.arch === "x86_64")
  ) {
    return `${Deno.build.os}-${Deno.build.arch}`;
  }
  throw new Deno.errors.NotSupported(`Cannot build native AES-IGE for ${Deno.build.os}-${Deno.build.arch}.`);
}

const root = dirname(dirname(fromFileUrl(import.meta.url)));
const currentTarget = target();
const outputDirectory = join(root, "artifacts", currentTarget);
const filename = Deno.build.os === "darwin"
  ? "libmtkruto_ige.dylib"
  : Deno.build.os === "windows"
  ? "mtkruto_ige.dll"
  : "libmtkruto_ige.so";
const output = join(outputDirectory, filename);
const source = join(root, "native", "mtkruto_ige.c");
await Deno.mkdir(outputDirectory, { recursive: true });

const args = [
  "-O3",
  "-DNDEBUG",
  "-std=c11",
  "-fstack-protector-strong",
];
if (Deno.build.os !== "windows") {
  args.push("-fPIC", "-fvisibility=hidden");
}
args.push("-Wall", "-Wextra", "-Werror");
if (Deno.build.os === "darwin") {
  args.push(
    "-dynamiclib",
    "-mmacosx-version-min=11.0",
    "-Wl,-install_name,@rpath/libmtkruto_ige.dylib",
    "-Wl,-dead_strip",
  );
} else if (Deno.build.os === "linux") {
  args.push("-shared", "-Wl,--no-undefined", "-Wl,-z,relro,-z,now");
} else {
  args.push("-shared", "-Wl,/Brepro");
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
