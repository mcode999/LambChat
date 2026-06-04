import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SKILL_LIST_LIMIT,
  resolveSkillListParams,
  resolveSkillListState,
} from "../useSkills.ts";

test("resolveSkillListParams requests one page by default", () => {
  assert.deepEqual(resolveSkillListParams(undefined, undefined), {
    limit: 20,
  });
});

test("resolveSkillListParams gives explicit fetch params priority", () => {
  assert.deepEqual(
    resolveSkillListParams({ skip: 20, limit: 20 }, { limit: 50 }),
    { skip: 20, limit: 20 },
  );
});

test("resolveSkillListState replaces skills in normal paged mode", () => {
  const result = resolveSkillListState({
    currentSkills: [{ name: "first", enabled: true }],
    incomingSkills: [{ name: "second", enabled: true }],
    params: { skip: DEFAULT_SKILL_LIST_LIMIT, limit: DEFAULT_SKILL_LIST_LIMIT },
    appendPages: false,
  });

  assert.deepEqual(
    result.map((skill) => skill.name),
    ["second"],
  );
});

test("resolveSkillListState appends later pages without duplicating skills", () => {
  const result = resolveSkillListState({
    currentSkills: [
      { name: "alpha", enabled: true },
      { name: "bravo", enabled: true },
    ],
    incomingSkills: [
      { name: "bravo", enabled: false },
      { name: "charlie", enabled: true },
    ],
    params: { skip: DEFAULT_SKILL_LIST_LIMIT, limit: DEFAULT_SKILL_LIST_LIMIT },
    appendPages: true,
  });

  assert.deepEqual(
    result.map((skill) => [skill.name, skill.enabled]),
    [
      ["alpha", true],
      ["bravo", false],
      ["charlie", true],
    ],
  );
});
