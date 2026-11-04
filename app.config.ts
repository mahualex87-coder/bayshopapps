import type { ConfigContext, ExpoConfig } from 'expo/config';
const { resolvePushConfig } = require('./plugins/push-config.cjs');

export default ({ config, projectRoot }: ConfigContext): ExpoConfig => {
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    throw new Error('Publicarea în magazine este blocată pentru această versiune internă. Confirmați identificatorii aplicațiilor și finalizați verificările native și ale operațiilor reale din README înainte de a elimina această protecție.');
  }
  const push = resolvePushConfig(process.env, projectRoot);
  const googleIosClientId = process.env.BAYSHOP_GOOGLE_OAUTH_IOS_CLIENT_ID?.trim();
  if (googleIosClientId && !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleIosClientId)) throw new Error('Invalid Google iOS OAuth client ID');
  const googleScheme = googleIosClientId?.split('.').reverse().join('.');
  // Google Credential Manager requires the server/Web audience, not the Android client ID.
  const googleAndroidWebClientId = process.env.BAYSHOP_GOOGLE_OAUTH_ANDROID_WEB_CLIENT_ID?.trim();
  if (googleAndroidWebClientId && !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleAndroidWebClientId)) throw new Error('Invalid Google Android Web OAuth client ID');
  const iosSchemes = config.ios?.scheme ? (Array.isArray(config.ios.scheme) ? config.ios.scheme : [config.ios.scheme]) : [];
  const iosMapsKey = process.env.BAYSHOP_GOOGLE_MAPS_IOS_KEY?.trim();
  const androidMapsKey = process.env.BAYSHOP_GOOGLE_MAPS_ANDROID_KEY?.trim();
  const intercomAppId = process.env.BAYSHOP_INTERCOM_APP_ID?.trim();
  const intercomIosKey = process.env.BAYSHOP_INTERCOM_IOS_API_KEY?.trim();
  const intercomAndroidKey = process.env.BAYSHOP_INTERCOM_ANDROID_API_KEY?.trim();
  const intercomRegion = process.env.BAYSHOP_INTERCOM_REGION?.trim() || 'US';
  if (!['US', 'EU', 'AU'].includes(intercomRegion)) throw new Error('Invalid Intercom region');
  // Public identifiers for the existing merchant only; processing secrets stay on BayShop.
  // Empty configuration keeps native wallets unavailable in internal builds.
  const googlePayMerchantId = process.env.BAYSHOP_GOOGLE_PAY_MERCHANT_ID?.trim();
  const googlePayEnvironment = process.env.BAYSHOP_GOOGLE_PAY_ENVIRONMENT?.trim();
  const applePayMerchantId = process.env.BAYSHOP_APPLE_PAY_MERCHANT_ID?.trim();
  if (googlePayMerchantId && (!/^[A-Za-z0-9_-]{8,50}$/.test(googlePayMerchantId) || !['TEST', 'PRODUCTION'].includes(googlePayEnvironment || ''))) throw new Error('Verified Google Pay merchant and environment are required');
  if (googlePayEnvironment && !googlePayMerchantId) throw new Error('Google Pay environment requires its verified merchant identifier');
  if (applePayMerchantId && !/^merchant\.[A-Za-z0-9.-]{1,240}$/.test(applePayMerchantId)) throw new Error('Invalid native Apple Pay merchant identifier');
  const existingApplePayMerchants = config.ios?.entitlements?.['com.apple.developer.in-app-payments'];
  if (applePayMerchantId && existingApplePayMerchants !== undefined && !Array.isArray(existingApplePayMerchants)) throw new Error('Invalid existing Apple Pay entitlement');
  const applePayMerchants = [...new Set([...(Array.isArray(existingApplePayMerchants) ? existingApplePayMerchants : []), ...(applePayMerchantId ? [applePayMerchantId] : [])])];
  const walletOptions = { googleMerchantIds: googlePayMerchantId ? [googlePayMerchantId] : [], googleEnvironments: googlePayMerchantId ? [googlePayEnvironment] : [], appleMerchantIds: applePayMerchantId ? [applePayMerchantId] : [] };
  return {
    ...config, name: config.name ?? 'BayShop', slug: config.slug ?? 'bayshop-mobile',
    plugins: [...(config.plugins ?? []), ['expo-build-properties', { ios: { useFrameworks: 'dynamic' } }], ['expo-notifications', { color: '#C74740', defaultChannel: 'bayshop-updates' }], ...(push.enabled ? ['@react-native-firebase/app', '@react-native-firebase/messaging'] : []), 'expo-apple-authentication', 'expo-localization', ['expo-image-picker', { cameraPermission: "BayShop uses the camera when you choose to photograph a parcel or document, or send a photo to support.", photosPermission: "BayShop accesses the photos you select to attach them to parcels, documents or support messages.", microphonePermission: 'BayShop uses the microphone when you choose to record a message for support.' }], 'expo-web-browser', './plugins/with-workmanager-room.cjs', ['./plugins/with-wallet.cjs', walletOptions], ['./plugins/with-intercom-manual.cjs', { region: intercomRegion }], ['react-native-maps', {
      ...(iosMapsKey ? { iosGoogleMapsApiKey: iosMapsKey } : {}),
      ...(androidMapsKey ? { androidGoogleMapsApiKey: androidMapsKey } : {}),
    }], ['expo-location', {
      locationWhenInUsePermission: 'BayShop uses your location when you select the nearest pickup point.',
      locationAlwaysPermission: false, locationAlwaysAndWhenInUsePermission: false,
      motionUsagePermission: false, isIosBackgroundLocationEnabled: false,
      isAndroidBackgroundLocationEnabled: false, isAndroidForegroundServiceEnabled: false,
      isAndroidMotionActivityEnabled: false,
    }]],
    android: { ...config.android, ...(push.enabled ? { googleServicesFile: push.androidPath } : {}) },
    ios: { ...config.ios, ...(push.enabled ? { googleServicesFile: push.iosPath } : {}), usesAppleSignIn: true, entitlements: { ...config.ios?.entitlements, ...(push.enabled ? { 'aps-environment': 'production' } : {}), ...(applePayMerchantId ? { 'com.apple.developer.in-app-payments': applePayMerchants } : {}) }, ...(googleScheme ? { scheme: [...new Set([...iosSchemes, googleScheme])] } : {}), infoPlist: { ...config.ios?.infoPlist, CFBundleAllowMixedLocalizations: true, NSCameraUsageDescription: "BayShop uses the camera when you choose to photograph a parcel or document, or send a photo to support.", NSMicrophoneUsageDescription: 'BayShop uses the microphone when you choose to record a message for support.' } },
    locales: { ...config.locales, ro: './locales/ro.json', ru: './locales/ru.json', en: './locales/en.json' },
    extra: { ...config.extra, push: { ios: push.enabled, android: push.enabled, projectId: push.projectId }, nativeSocial: { googleIosClientId: googleIosClientId ?? null, googleAndroidWebClientId: googleAndroidWebClientId ?? null }, intercom: { appId: intercomAppId ?? null, iosApiKey: intercomIosKey ?? null, androidApiKey: intercomAndroidKey ?? null, region: intercomRegion }, googleMaps: { ios: !!iosMapsKey, android: !!androidMapsKey } },
  };
};
