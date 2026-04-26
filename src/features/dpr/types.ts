import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type Weather = 'clear' | 'cloudy' | 'rain' | 'hot' | 'other';

export const WEATHER_OPTIONS: Array<{ key: Weather; label: string; icon: string }> = [
  { key: 'clear', label: 'Clear', icon: 'sunny-outline' },
  { key: 'cloudy', label: 'Cloudy', icon: 'cloud-outline' },
  { key: 'rain', label: 'Rain', icon: 'rainy-outline' },
  { key: 'hot', label: 'Hot', icon: 'thermometer-outline' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

export type DailyProgressReport = {
  id: string; // ${projectId}_${date}
  orgId: string;
  projectId: string;
  date: string; // YYYY-MM-DD
  workDone: string;
  weather: Weather;
  weatherNote: string;
  issues: string;
  tomorrowPlan: string;
  photoUris: string[];
  staffPresent: number;
  staffTotal: number;
  materialReceivedCount: number;
  materialUsedCount: number;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  updatedAt: FirebaseFirestoreTypes.Timestamp | null;
};
