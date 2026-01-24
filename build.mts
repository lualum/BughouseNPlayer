import { spawn, ChildProcess } from "child_process";
import * as esbuild from "esbuild";
import { existsSync, statSync } from "fs";
import {
   mkdir,
   rm,
   readdir,
   lstat,
   copyFile as fsCopyFile,
   symlink,
   watch as fsWatch,
} from "fs/promises";
import path, { join, relative, dirname, extname } from "path";

const args = process.argv.slice(2);
const watchMode = args.includes("--watch");
const startMode = args.includes("--start");
const prodMode = args.includes("--prod");

const configs: Record<string, esbuild.BuildOptions> = {
   server: {
      entryPoints: ["src/server/index.ts"],
      bundle: true,
      platform: "node",
      outdir: "dist/server",
      external: ["express", "socket.io"],
   },
   public: {
      entryPoints: ["src/public/index.ts"],
      bundle: true,
      platform: "browser",
      outdir: "dist/public",
      loader: {
         ".css": "css",
      },
   },
};

// Apply common settings
Object.values(configs).forEach((config) => {
   Object.assign(config, {
      format: "esm",
      sourcemap: true,
      target: "es2020",
   });
});

const SKIP_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);
const SKIP_FILES = new Set(["tsconfig.json"]);

async function shouldCopyFile(filename: string): Promise<boolean> {
   const ext = extname(filename);
   if (SKIP_EXTENSIONS.has(ext)) return false;
   if (SKIP_FILES.has(filename)) return false;
   return true;
}

async function copyFile(
   src: string,
   dest: string,
   useSymlinks: boolean = false,
) {
   let current;
   try {
      current = statSync(src);
   } catch (err) {
      // Source doesn't exist, skip
      return;
   }

   if (current.isFile()) {
      const filename = path.basename(src);
      if (!(await shouldCopyFile(filename))) {
         return;
      }

      // Ensure parent directory exists
      await mkdir(dirname(dest), { recursive: true });

      if (useSymlinks) {
         // Remove existing file/symlink if it exists
         try {
            await rm(dest, { force: true });
         } catch (err) {
            // Ignore errors
         }
         await symlink(path.resolve(src), dest);
      } else {
         await fsCopyFile(src, dest);
      }
      return;
   }

   let entries;
   try {
      entries = await readdir(src);
   } catch (err) {
      // Directory doesn't exist or can't be read
      return;
   }

   const filesToProcess = [];

   for (const entry of entries) {
      const srcPath = join(src, entry);
      const destPath = join(dest, entry);

      let stats;
      try {
         stats = statSync(srcPath);
      } catch (err) {
         // Entry doesn't exist anymore, skip
         continue;
      }

      if (stats.isDirectory()) {
         await copyFile(srcPath, destPath, useSymlinks);
      } else if (await shouldCopyFile(entry)) {
         filesToProcess.push({ srcPath, destPath });
      }
   }

   // Only create the directory if there are files to process
   if (filesToProcess.length > 0) {
      await mkdir(dest, { recursive: true });
      for (const { srcPath, destPath } of filesToProcess) {
         // Double-check source still exists
         if (!existsSync(srcPath)) continue;

         // Ensure parent directory exists
         await mkdir(dirname(destPath), { recursive: true });

         if (useSymlinks) {
            try {
               await rm(destPath, { force: true });
            } catch (err) {
               // Ignore errors
            }
            await symlink(path.resolve(srcPath), destPath);
         } else {
            await fsCopyFile(srcPath, destPath);
         }
      }
   }
}

async function syncFiles(useSymlinks: boolean = false) {
   // Remove dist contents but keep bundled files
   let distContents: string[];
   try {
      distContents = await readdir("dist");
   } catch (err) {
      distContents = [];
   }

   for (const entry of distContents) {
      const entryPath = join("dist", entry);
      // Skip the bundled output directories
      if (entry === "server" || entry === "public") {
         continue;
      }
      await rm(entryPath, { recursive: true, force: true });
   }

   await copyFile("src", "dist", useSymlinks);
}

async function build() {
   if (existsSync("dist")) {
      await rm("dist", { recursive: true, force: true });
   }

   await Promise.all(Object.values(configs).map((c) => esbuild.build(c)));
   await copyFile("src", "dist", !prodMode);
}

let serverProcess: ChildProcess | null = null;

function startServer() {
   if (serverProcess) serverProcess.kill();
   console.clear();
   serverProcess = spawn("node", ["dist/server/index.js"], {
      stdio: "inherit",
   });
   serverProcess.on("close", (code) => {
      if (code && code !== 0) console.log(`Server exited with code ${code}`);
   });
}

async function watch() {
   let rebuildTimeout: NodeJS.Timeout | null = null;

   const scheduleRebuild = async () => {
      if (rebuildTimeout) clearTimeout(rebuildTimeout);
      rebuildTimeout = setTimeout(async () => {
         console.log("File structure changed, rebuilding...");
         await syncFiles(true);
      }, 100);
   };

   const contexts = await Promise.all([
      esbuild.context(configs.public),
      esbuild.context({
         ...configs.server,
         plugins: [
            {
               name: "restart-server",
               setup: (build) =>
                  build.onEnd(async (result) => {
                     if (result.errors.length === 0) {
                        startServer();
                     }
                  }),
            },
         ],
      }),
   ]);

   await Promise.all(contexts.map((ctx) => ctx.watch()));
   await copyFile("src", "dist", true);

   // Watch for file additions/deletions in src directory
   const watcher = fsWatch("src", { recursive: true });

   (async () => {
      try {
         for await (const event of watcher) {
            const filename = event.filename;
            if (!filename) continue;

            // Skip if it's a file type we bundle
            const ext = extname(filename);
            if (
               SKIP_EXTENSIONS.has(ext) ||
               SKIP_FILES.has(path.basename(filename))
            ) {
               continue;
            }

            // Check if file was added or deleted
            const srcPath = join("src", filename);
            const exists = existsSync(srcPath);

            if (event.eventType === "rename") {
               // File added or deleted
               await scheduleRebuild();
            }
         }
      } catch (err) {
         if ((err as NodeJS.ErrnoException).name !== "AbortError") {
            console.error("File watcher error:", err);
         }
      }
   })();

   startServer();
}

async function start() {
   await build();
   startServer();
}

["SIGINT", "SIGTERM"].forEach((signal) => {
   process.on(signal, () => {
      if (serverProcess) serverProcess.kill();
      process.exit(0);
   });
});

(watchMode ? watch() : startMode ? start() : build()).catch((error) => {
   console.error(error);
   process.exit(1);
});
