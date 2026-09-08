import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Stated rather than left to the default. The seam must stay pure, and a
    // runner with no DOM is what makes reaching for one fail loudly instead of
    // quietly working in tests and nowhere else.
    environment: "node",

    // Tests live in `tests/`, and saying so is the whole reason this line
    // exists: vitest's default glob is the entire tree, which in a checkout
    // that has agent worktrees under `.claude/` means running dozens of stale
    // copies of this suite and reporting their failures as this one's.
    include: ["tests/**/*.test.js"],
  },
});
