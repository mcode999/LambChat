import { useState, useEffect, useCallback } from "react";
import { Copy, MessageSquareText, Save, Trash2, Users } from "lucide-react";
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
          member_id: m.member_id,
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
    <div className="flex h-full min-h-0 flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-[var(--theme-text-secondary)]" />
          <span className="text-sm font-semibold text-[var(--theme-text)]">
            {existingTeamId ? "Edit Team" : "New Team"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !teamName.trim()}
            className="btn-primary h-8 text-xs disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? "Saving..." : "Save"}
          </button>
          {existingTeamId && (
            <>
              <button
                onClick={handleClone}
                className="btn-secondary h-8 px-2.5 text-xs"
                title="Clone team"
              >
                <Copy size={14} />
              </button>
              <button
                onClick={handleDelete}
                className="btn-secondary h-8 px-2.5 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                title="Delete team"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Form area */}
      <div className="border-b border-[var(--theme-border)] px-4 py-3 sm:px-5">
        <div className="team-editor-summary">
          <label className="ppe-field">
            <span className="ppe-label text-[0.6875rem] uppercase tracking-wider">
              Team name
            </span>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="My team..."
              className="ppe-input text-base font-semibold"
            />
          </label>
          <label className="ppe-field">
            <span className="ppe-label text-[0.6875rem] uppercase tracking-wider">
              Description
            </span>
            <input
              type="text"
              value={teamDescription}
              onChange={(e) => setTeamDescription(e.target.value)}
              placeholder="What this team does..."
              className="ppe-input"
            />
          </label>
        </div>
        <label className="ppe-field mt-3">
          <span className="ppe-label text-[0.6875rem] uppercase tracking-wider">
            <MessageSquareText size={12} className="ppe-label-icon" />
            Team-wide instructions
          </span>
          <textarea
            value={teamInstructions}
            onChange={(e) => setTeamInstructions(e.target.value)}
            placeholder="Shared instructions applied to every member..."
            className="ppe-textarea min-h-[3.5rem]"
            rows={2}
          />
        </label>
      </div>

      {/* Two-pane layout */}
      <div className="flex-1 overflow-hidden">
        <div className="team-builder-layout h-full">
          <section className="team-builder-pane">
            <RoleSquare
              presets={presets}
              loading={presetsLoading}
              onAddRole={handleAddRole}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </section>
          <section className="team-builder-pane">
            <TeamRoster
              members={members}
              defaultMemberId={defaultMemberId}
              onRemoveMember={handleRemoveMember}
              onSetDefault={setDefaultMemberId}
              onToggleEnabled={handleToggleEnabled}
              onInstructionsChange={handleInstructionsChange}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
