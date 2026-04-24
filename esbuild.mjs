import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const config = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  sourcemap: !production,
  sourcesContent: false,
  minify: production,
  logLevel: "info",
};

if (watch) {
  const context = await esbuild.context(config);
  await context.watch();
  console.log("Watching extension sources...");
} else {
  await esbuild.build(config);
}
