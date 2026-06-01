import type { AgentInfo } from "../../types";

const TEAM_AGENT_ID = "team";

export function resolveAvailableAgentId(
  currentAgentId: string,
  preferredDefaultAgentId: string | undefined,
  agents: AgentInfo[],
): string {
  const availableIds = new Set(agents.map((agent) => agent.id));

  if (currentAgentId && availableIds.has(currentAgentId)) {
    return currentAgentId;
  }

  if (preferredDefaultAgentId && availableIds.has(preferredDefaultAgentId)) {
    return preferredDefaultAgentId;
  }

  return agents[0]?.id || "";
}

export function resolvePersonaAgentId(
  currentAgentId: string,
  preferredDefaultAgentId: string | undefined,
  agents: AgentInfo[],
): string {
  if (currentAgentId && currentAgentId !== TEAM_AGENT_ID) {
    return resolveAvailableAgentId(
      currentAgentId,
      preferredDefaultAgentId,
      agents,
    );
  }

  const nonTeamAgents = agents.filter((agent) => agent.id !== TEAM_AGENT_ID);
  return resolveAvailableAgentId("", preferredDefaultAgentId, nonTeamAgents);
}
