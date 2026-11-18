// Gera .vercel/output (Build Output API v3): front estático + API como uma função Node.
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const out = ".vercel/output";
rmSync(out, { recursive: true, force: true });

// Front (web/dist já gerado por "npm run build --prefix web")
cpSync("web/dist", `${out}/static`, { recursive: true });

// API
const fn = `${out}/functions/api.func`;
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: ["server/src/vercel.ts"],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  external: ["pg-native"],
  // Dependências CommonJS (express, pg) usam require dentro do bundle ESM.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
writeFileSync(
  `${fn}/.vc-config.json`,
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false }, null, 2),
);

writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/api/(.*)", dest: "/api?__path=$1" },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);
console.log("Build Output gerado em", out);
