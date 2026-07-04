export type NotificationPayload = {
  title: string;
  content: string;
};

export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  console.log("[Notification] notifyOwner (self-hosted stub):", payload.title);
  return false;
}
