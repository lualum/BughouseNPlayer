#!/usr/bin/env node
import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");
const isDev = isWatch || process.argv.includes("--dev");

const commonOptions = {
   bundle: true,
   sourcemap: true,
   minify: !isDev,
};

const configs = [
   {
      ...commonOptions,
      entryPoints: ["public/*.ts"],
      outdir: "public/dist",
   },
   {
      ...commonOptions,
      entryPoints: ["server/*.ts"],
      outdir: "server/dist",
      platform: "node",
      external: ["express", "socket.io"],
   },
   {
      ...commonOptions,
      entryPoints: ["shared/*.ts"],
      outdir: "shared/dist",
      platform: "node",
   },
];

if (isWatch) {
   const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
   await Promise.all(contexts.map((ctx) => ctx.watch()));
   console.log("Watching for changes...");
} else {
   await Promise.all(configs.map((c) => esbuild.build(c)));
}
