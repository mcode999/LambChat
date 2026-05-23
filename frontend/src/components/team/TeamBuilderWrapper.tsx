import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Pencil, ArrowLeft } from "lucide-react";
import { teamApi } from "../../services/api/team";
import { TeamBuilder } from "./TeamBuilder";
import type { Team } from "../../types/team";

type View = "list" | "editor";

export function TeamBuilderWrapper() {
  const [view, setView] = useState<View>("list");
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);

  const loadTeams = useCallback(async () => {
    try {
      setLoading(true);
      const res = await teamApi.list(0, 100);
      setTeams(res.teams);
    } catch (e) {
      console.error("Failed to load teams:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const handleCreateNew = () => {
    setEditingTeamId(null);
    setView("editor");
  };

  const handleEditTeam = (teamId: string) => {
    setEditingTeamId(teamId);
    setView("editor");
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!window.confirm("Are you sure you want to delete this team?")) return;
    try {
      await teamApi.delete(teamId);
      setTeams((prev) => prev.filter((t) => t.id !== teamId));
    } catch (e) {
      console.error("Failed to delete team:", e);
    }
  };

  const handleSave = (_team: Team) => {
    loadTeams();
  };

  const handleClose = () => {
    setView("list");
    setEditingTeamId(null);
    loadTeams();
  };

  if (view === "editor") {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 p-2 border-b border-border">
          <button
            onClick={handleClose}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft size={16} />
            Back to teams
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <TeamBuilder
            teamId={editingTeamId}
            onSave={handleSave}
            onClose={handleClose}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Team Builder</h2>
        <button
          onClick={handleCreateNew}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          <Plus size={16} />
          Create New Team
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Loading teams...
          </div>
        ) : teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <p>No teams yet.</p>
            <button
              onClick={handleCreateNew}
              className="text-primary underline text-sm"
            >
              Create your first team
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {teams.map((team) => (
              <li
                key={team.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{team.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {team.members.length} member
                    {team.members.length !== 1 ? "s" : ""}
                    {team.description ? ` — ${team.description}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleEditTeam(team.id)}
                    className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
                    title="Edit team"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteTeam(team.id)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title="Delete team"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
