import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../ChannelPersonaSelect.tsx", import.meta.url),
  "utf8",
);

test("channel persona selector supports search-backed paginated loading", () => {
  assert.match(source, /searchQuery/);
  assert.match(source, /debouncedSearch/);
  assert.match(source, /personaPresetApi\s*\.\s*list\(\{/);
  assert.match(source, /q:\s*debouncedSearch\.trim\(\) \|\| undefined/);
  assert.match(source, /skip:\s*nextSkip/);
  assert.match(source, /limit:\s*PAGE_LIMIT/);
  assert.match(source, /handleScroll/);
  assert.match(source, /scrollHeight - scrollTop - clientHeight < 80/);
});

test("channel persona selector exposes a clear option", () => {
  assert.match(source, /channel\.clearPersona/);
  assert.match(source, /onChange\(null\)/);
});

test("channel persona selector renders preset icons in trigger and options", () => {
  assert.match(source, /PersonaAvatarIcon/);
  assert.match(source, /PersonaAvatarImage/);
  assert.match(source, /isPersonaImageAvatar/);
  assert.match(source, /PersonaPresetIcon/);
  assert.match(source, /setImageFailed/);
  assert.match(source, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(source, /selected && <PersonaPresetIcon preset=\{selected\}/);
  assert.match(source, /<PersonaPresetIcon preset=\{preset\}/);
});
