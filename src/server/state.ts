import { history, usage } from "./conversations";
import { listTasks } from "./tasks";
import { listMemories } from "./memories";
import { channelStatus } from "./ilink";
import { modelConfigured } from "./config";
import { qqStatus } from "./qq";
import { telegramStatus } from "./telegram";
import { preferences } from "./preferences";
import { listAgentDevices } from "./agent-devices";

export async function appState(userId: string) {
  const [
    conversation,
    tasks,
    memories,
    quota,
    channel,
    qq,
    telegram,
    chatPreferences,
    agentDevices,
  ] = await Promise.all([
    history(userId),
    listTasks(userId),
    listMemories(userId),
    usage(userId),
    channelStatus(userId),
    qqStatus(userId),
    telegramStatus(userId),
    preferences(userId),
    listAgentDevices(userId),
  ]);
  return {
    ...conversation,
    quota,
    modelReady: modelConfigured(),
    qq,
    telegram,
    preferences: chatPreferences,
    agentDevices,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      notes: t.notes,
      completed: t.completed,
      dueAt: t.dueAt?.toISOString() ?? null,
      version: t.version,
    })),
    memories: memories.map((m) => ({
      id: m.id,
      content: m.content,
      version: m.version,
    })),
    channel: {
      enabled: channel.enabled,
      connection: channel.connection
        ? {
            ...channel.connection,
            connectedAt: channel.connection.connectedAt.toISOString(),
          }
        : null,
    },
  };
}
export type AppState = Awaited<ReturnType<typeof appState>>;
