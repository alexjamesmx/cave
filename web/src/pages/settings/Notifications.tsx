import { DeviceNotifications, NotificationChannels } from "../../ui/NotificationSettings.tsx";

/** Settings → Notifications: this device's Web Push, and the channels. */
export function SettingsNotifications() {
  return (
    <>
      <DeviceNotifications />
      <NotificationChannels />
    </>
  );
}
