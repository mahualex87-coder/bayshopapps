import { installBackgroundPushHandler } from './src/features/push/native-push';

installBackgroundPushHandler();
// Register Expo Router only after Firebase installs its headless listener.
require('expo-router/entry');
