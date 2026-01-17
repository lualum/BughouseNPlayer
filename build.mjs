import { spawn } from "child_process";
import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const commonOptions = {
   bundle: true,
   sourcemap: true,
   minify: !isWatch,
   logLevel: "error", // Changed from "info" to hide [watch] messages
};

let serverProcess = null;

const restartServer = () => {
   if (serverProcess) {
      serverProcess.kill();
   }

   // Clear terminal
   console.clear();

   serverProcess = spawn(
      "node",
      ["--no-deprecation", "server/dist/server.js"],
      {
         stdio: "inherit",
      },
   );
};

// Plugin to restart server after rebuild
const serverRestartPlugin = {
   name: "server-restart",
   setup(build) {
      build.onEnd((result) => {
         if (result.errors.length === 0) {
            restartServer();
         } else {
            console.error("❌ Server Rebuild Failed");
         }
      });
   },
};

const contexts = await Promise.all([
   // Public/client code
   esbuild.context({
      ...commonOptions,
      entryPoints: ["public/*.ts"],
      outdir: "public/dist",
      format: "esm",
      platform: "browser",
   }),
   // Server code
   esbuild.context({
      ...commonOptions,
      entryPoints: ["server/*.ts"],
      outdir: "server/dist",
      format: "esm",
      platform: "node",
      external: ["express", "socket.io"],
      plugins: isWatch ? [serverRestartPlugin] : [],
   }),
   // Shared code
   esbuild.context({
      ...commonOptions,
      entryPoints: ["shared/*.ts"],
      outdir: "shared/dist",
      format: "esm",
      platform: "neutral",
   }),
]);

if (isWatch) {
   await Promise.all(contexts.map((ctx) => ctx.watch()));
   restartServer();

   process.on("SIGINT", () => {
      if (serverProcess) {
         serverProcess.kill();
      }
      process.exit(0);
   });
} else {
   await Promise.all(contexts.map((ctx) => ctx.rebuild()));
   await Promise.all(contexts.map((ctx) => ctx.dispose()));
   console.log("✅ Build complete");
}
