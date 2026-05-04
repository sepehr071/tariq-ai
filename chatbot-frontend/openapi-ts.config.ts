import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: process.env.OPENAPI_INPUT ?? "http://localhost:8000/openapi.json",
  output: {
    path: "src/client",
    format: "prettier",
    lint: "eslint",
  },
  plugins: [
    "@hey-api/client-fetch",
    { name: "@hey-api/sdk", asClass: false },
    "@hey-api/schemas",
    "@hey-api/typescript",
  ],
});
