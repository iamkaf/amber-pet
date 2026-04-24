import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const fileName = `${packageJson.name}-${packageJson.version}.vsix`;
const temporaryVsixPath = join(rootDir, fileName);
const outputDir = join(rootDir, "dist");
const outputPath = join(outputDir, fileName);

rmSync(temporaryVsixPath, { force: true });
mkdirSync(outputDir, { recursive: true });
rmSync(outputPath, { force: true });

execFileSync("vsce", ["package", "--no-dependencies", "--out", fileName], {
  cwd: rootDir,
  stdio: "inherit",
});

renameSync(temporaryVsixPath, outputPath);

console.log(`VSIX written to ${relative(rootDir, outputPath)}`);
