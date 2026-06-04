import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const panelSource = readFileSync(
  new URL("../FeishuPanel.tsx", import.meta.url),
  "utf8",
);
const formSource = readFileSync(
  new URL("../FeishuPanelForm.tsx", import.meta.url),
  "utf8",
);
const channelTypesSource = readFileSync(
  new URL("../../../../../types/channel.ts", import.meta.url),
  "utf8",
);

test("registration polling cleanup cancels active server-side session", () => {
  assert.match(panelSource, /cancelFeishuRegistration/);
  assert.match(
    panelSource,
    /channelApi\s*\.\s*cancelFeishuRegistration\(\s*registrationSessionId\s*\)/,
  );
  assert.match(panelSource, /return\s+\(\)\s*=>\s*\{/);
});

test("feishu panel uses the bot message icon", () => {
  assert.match(panelSource, /BotMessageSquare/);
  assert.doesNotMatch(panelSource, /import \{[^}]*\bMessageSquare\b/);
});

test("feishu channel form wires persona preset selection through save payloads", () => {
  assert.match(formSource, /ChannelPersonaSelect/);
  assert.match(formSource, /personaPresetId/);
  assert.match(
    panelSource,
    /const\s+\[personaPresetId,\s*setPersonaPresetId\]/,
  );
  assert.match(panelSource, /initialAgentId === "team"[\s\S]*\? null/);
  assert.match(panelSource, /initialConfig\.persona_preset_id \|\| null/);
  assert.match(panelSource, /channelPersonaPresetId/);
  assert.match(panelSource, /persona_preset_id:\s*channelPersonaPresetId/);
  assert.match(channelTypesSource, /persona_preset_id\?: string \| null/);
});

test("feishu channel form switches from persona to team selection for team agent", () => {
  assert.match(formSource, /ChannelTeamSelect/);
  assert.match(formSource, /agentId\s*===\s*"team"/);
  assert.match(formSource, /teamId/);
  assert.match(panelSource, /const\s+\[teamId,\s*setTeamId\]/);
  assert.match(panelSource, /channelTeamId/);
  assert.match(panelSource, /team_id:\s*channelTeamId/);
  assert.match(panelSource, /setPersonaPresetId\(null\)/);
  assert.match(panelSource, /setTeamId\(null\)/);
  assert.match(channelTypesSource, /team_id\?: string \| null/);
});
