import test from "node:test";
import assert from "node:assert/strict";
import { getHeroSectionClassName } from "../landingHeroLayout.ts";

test("keeps the landing hero centered and balanced on mobile", () => {
  const className = getHeroSectionClassName();

  assert.equal(className.includes("items-center"), true);
  assert.equal(className.includes("justify-center"), true);
  assert.equal(className.includes("min-h-[100dvh]"), true);
  assert.equal(className.includes("pt-24 pb-16"), false);
  assert.equal(
    className.includes("pt-[calc(5rem+var(--app-safe-area-top,0px))]"),
    true,
  );
  assert.equal(className.includes("pb-20"), true);
});
