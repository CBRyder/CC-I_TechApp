import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CLOCK_IN_REMINDER_ID = 'clock-in-reminder';

// Local (on-device) scheduled notification — no push token, no server
// involvement, works entirely offline. Reschedules are idempotent: this
// always cancels any existing one first.
export async function scheduleClockInReminder(hour, minute) {
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  await cancelClockInReminder();
  await Notifications.scheduleNotificationAsync({
    identifier: CLOCK_IN_REMINDER_ID,
    content: {
      title: 'CC-I Tech App',
      body: "Don't forget to clock in for today.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
  return true;
}

export async function cancelClockInReminder() {
  await Notifications.cancelScheduledNotificationAsync(CLOCK_IN_REMINDER_ID).catch(() => {});
}
