import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";

export async function setupVite(app: Express, server: Server) {
  // Vite and its config pull in dev-only dependencies (@vitejs/plugin-react,
  // @tailwindcss/vite, etc.) that are not installed in the production image.
  // Load them lazily here so that merely importing this module for
  // serveStatic() in production never resolves them. This function is only
  // called when NODE_ENV=development.
  const { createServer: createViteServer } = await import("vite");
  // Indirect the specifier so esbuild does not statically follow and inline
  // vite.config — inlining would hoist its dev-only plugin imports
  // (@vitejs/plugin-react, @tailwindcss/vite, ...) into the production bundle.
  // In development this module runs from source via tsx, so the relative path
  // resolves correctly; the production bundle never calls setupVite.
  const viteConfigSpecifier = ["..", "..", "vite.config"].join("/");
  const { default: viteConfig } = await import(viteConfigSpecifier);

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
