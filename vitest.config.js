import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Stated rather than left to the default. The seam must stay pure, and a
    // runner with no DOM is what makes reaching for one fail loudly instead of
    // quietly working in tests and nowhere else.
    environment: "node",
  },
});
