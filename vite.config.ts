import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

export default defineConfig({
	// Ensure deep links like /games/ABCD serve index.html in dev.
	appType: "spa",
	root: "public",
	resolve: {
		alias: { "@shared": path.resolve(process.cwd(), "shared/src") },
	},
	build: {
		outDir: "../dist/public",
		emptyOutDir: true,
	},
	server: {
		port: 3000,
		allowedHosts: true,
		proxy: {
			"/ws": {
				target: "ws://localhost:8000",
				ws: true,
				changeOrigin: true,
			},
		},
	},
});
