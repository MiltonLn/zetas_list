export const UserEvent = {
  BirthdaysToday: 'user.birthdays_today',
} as const;

export interface BirthdaysTodayEvent {
  users: Array<{ name: string; phone: string }>;
}
