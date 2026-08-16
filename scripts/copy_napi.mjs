import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

function target() {
  if (process.platform === "darwin" && process.arch === "arm64") return "darwin-aarch64";
  if (process.platform === "darwin" && process.arch === "x64") return "darwin-x86_64";
  if (process.platform === "linux" && process.arch === "arm64") return "linux-aarch64";
  if (process.platform === "linux" && process.arch === "x64") return "linux-x86_64";
  if (process.platform === "win32" && process.arch === "x64") return "windows-x86_64";
  throw new Error(`Cannot build the Node-API AES-IGE addon for ${process.platform}-${process.arch}.`);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "native", "build", "Release", "mtkruto_ige.node");
const outputDirectory = join(root, "napi", "artifacts", target());
const output = join(outputDirectory, "mtkruto_ige.node");

mkdirSync(outputDirectory, { recursive: true });
copyFileSync(source, output);
console.log(output);
