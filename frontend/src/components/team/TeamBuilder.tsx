import { useState, useEffect, useCallback } from "react";
import { Save, Copy, Trash2 } from "lucide-react";
import { teamApi } from "../../services/api/team";
import { personaPresetApi } from "../../services/api/personaPreset";
import type { PersonaPreset } from "../../types";
import type { Team, TeamMember } from "../../types/team";
import { RoleSquare } from "./RoleSquare";
import { TeamRoster } from "./TeamRoster";

interface TeamBuilderProps {
  teamId?: string | null;
  onSave?: (team: Team) => void;
  onClose?: () => void;
}

function generateMemberId(): string {
  return `m-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function TeamBuilder({ teamId, onSave, onClose }: TeamBuilderProps) {
  const [presets, setPresets] = useState<PersonaPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [teamInstructions, setTeamInstructions] = useState("");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [defaultMemberId, setDefaultMemberId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [existingTeamId, setExistingTeamId] = useState<string | null>(null);

  useEffect(() => {
    personaPresetApi
      .list({ limit: 100 })
      .then((res) => {
        setPresets(res.presets);
        setPresetsLoading(false);
      })
      .catch(() => {
        setPresetsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (teamId) {
      teamApi.get(teamId).then((team) => {
        setExistingTeamId(team.id);
        setTeamName(team.name);
        setTeamDescription(team.description);
        setTeamInstructions(team.team_instructions);
        setMembers(team.members);
        setDefaultMemberId(team.default_member_id ?? null);
      });
    }
  }, [teamId]);

  const handleAddRole = useCallback(
    (preset: PersonaPreset) => {
      const newMember: TeamMember = {
        member_id: generateMemberId(),
        persona_preset_id: preset.id,
        role_name: preset.name,
        role_avatar: preset.avatar,
        role_tags: preset.tags,
        role_instructions: "",
        position: members.length,
        enabled: true,
      };
      setMembers((prev) => [...prev, newMember]);
      if (!defaultMemberId) setDefaultMemberId(newMember.member_id);
    },
    [members.length, defaultMemberId],
  );

  const handleRemoveMember = useCallback((memberId: string) => {
    setMembers((prev) => prev.filter((m) => m.member_id !== memberId));
    setDefaultMemberId((prev) => (prev === memberId ? null : prev));
  }, []);

  const handleInstructionsChange = useCallback(
    (memberId: string, text: string) => {
      setMembers((prev) =>
        prev.map((m) =>
          m.member_id === memberId ? { ...m, role_instructions: text } : m,
        ),
      );
    },
    [],
  );

  const handleToggleEnabled = useCallback((memberId: string) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.member_id === memberId ? { ...m, enabled: !m.enabled } : m,
      ),
    );
  }, []);

  const handleSave = async () => {
    if (!teamName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: teamName,
        description: teamDescription,
        team_instructions: teamInstructions,
        default_member_id: defaultMemberId,
        members: members.map((m, idx) => ({
          persona_preset_id: m.persona_preset_id,
          role_instructions: m.role_instructions,
          position: idx,
          enabled: m.enabled,
        })),
      };
      const team = existingTeamId
        ? await teamApi.update(existingTeamId, payload)
        : await teamApi.create(payload);
      setExistingTeamId(team.id);
      onSave?.(team);
    } catch (e) {
      console.error("Failed to save team:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleClone = async () => {
    if (!existingTeamId) return;
    try {
      const cloned = await teamApi.clone(existingTeamId);
      setExistingTeamId(cloned.id);
      setTeamName(cloned.name);
      setMembers(cloned.members);
      setDefaultMemberId(cloned.default_member_id ?? null);
    } catch (e) {
      console.error("Failed to clone team:", e);
    }
  };

  const handleDelete = async () => {
    if (!existingTeamId) return;
    if (!window.confirm("Are you sure you want to delete this team?")) return;
    try {
      await teamApi.delete(existingTeamId);
      onClose?.();
    } catch (e) {
      console.error("Failed to delete team:", e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <input
          type="text"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="Team name..."
          className="text-lg font-semibold bg-transparent border-none outline-none flex-1"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !teamName.trim()}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            <Save className="h-4 w-4 inline mr-1" />
            {saving ? "Saving..." : "Save"}
          </button>
          {existingTeamId && (
            <>
              <button
                onClick={handleClone}
                className="p-1.5 rounded-lg hover:bg-accent"
                title="Clone team"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                onClick={handleDelete}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                title="Delete team"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Description + Instructions */}
      <div className="p-4 border-b border-border space-y-2">
        <input
          type="text"
          value={teamDescription}
          onChange={(e) => setTeamDescription(e.target.value)}
          placeholder="Team description..."
          className="w-full text-sm bg-transparent border-none outline-none"
        />
        <textarea
          value={teamInstructions}
          onChange={(e) => setTeamInstructions(e.target.value)}
          placeholder="Team-wide instructions (applied to all members)..."
          className="w-full text-xs p-2 rounded-lg bg-muted resize-none"
          rows={2}
        />
      </div>

      {/* Two-pane layout */}
      <div className="flex-1 flex min-h-0">
        <div className="w-1/2 border-r border-border">
          <RoleSquare
            presets={presets}
            loading={presetsLoading}
            onAddRole={handleAddRole}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>
        <div className="w-1/2 overflow-y-auto">
          <TeamRoster
            members={members}
            defaultMemberId={defaultMemberId}
            onRemoveMember={handleRemoveMember}
            onSetDefault={setDefaultMemberId}
            onToggleEnabled={handleToggleEnabled}
            onInstructionsChange={handleInstructionsChange}
          />
        </div>
      </div>
    </div>
  );
}
