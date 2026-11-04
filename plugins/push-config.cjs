const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist').default;
const appId = 'com.bayshop.mobile.demo';
const projectId = 'baymd-148208';
/** Client configuration only. A Firebase service-account/private key is never
 * accepted here, bundled, or uploaded to the mobile build. */
function resolvePushConfig(env, root) {
  let androidFile = env.BAYSHOP_FIREBASE_ANDROID_CONFIG?.trim();
  let iosFile = env.BAYSHOP_FIREBASE_IOS_CONFIG?.trim();
  // EAS evaluates the config locally before loading the preview file variables.
  if (!androidFile && !iosFile && env.EAS_BUILD !== 'true') {
    const androidLocal = path.join(root, 'credentials/firebase/google-services.json');
    const iosLocal = path.join(root, 'credentials/firebase/GoogleService-Info.plist');
    if (fs.existsSync(androidLocal)) androidFile = androidLocal;
    if (fs.existsSync(iosLocal)) iosFile = iosLocal;
  }
  if (!androidFile && !iosFile) {
    if (env.BAYSHOP_REQUIRE_PUSH === '1') throw new Error('Both BayShop Firebase client configurations are required for this build.');
    return { enabled: false, projectId };
  }
  if (!androidFile || !iosFile) throw new Error('Configure both Android and iOS Firebase client files before enabling push.');
  let android, ios;
  const androidPath = path.resolve(root, androidFile), iosPath = path.resolve(root, iosFile);
  try { android = JSON.parse(fs.readFileSync(androidPath, 'utf8')); ios = plist.parse(fs.readFileSync(iosPath, 'utf8')); }
  catch { throw new Error('Firebase client configuration files could not be read.'); }
  if (android.private_key || android.type === 'service_account' || ios.PRIVATE_KEY) throw new Error('Server credentials must never be used as mobile Firebase configuration.');
  if (android.project_info?.project_id !== projectId || String(android.project_info?.project_number) !== '376156188250' || ios.PROJECT_ID !== projectId || String(ios.GCM_SENDER_ID) !== '376156188250') throw new Error('Firebase configuration must use the existing BayShop project.');
  const client = android.client?.find(item => item.client_info?.android_client_info?.package_name === appId);
  if (!client?.client_info?.mobilesdk_app_id || !client.api_key?.some(item => typeof item.current_key === 'string' && item.current_key.length > 10) || ios.BUNDLE_ID !== appId || typeof ios.GOOGLE_APP_ID !== 'string' || typeof ios.API_KEY !== 'string') throw new Error('Firebase configurations must belong to com.bayshop.mobile.demo; existing application identifiers cannot be reused.');
  return { enabled: true, projectId, androidPath, iosPath };
}
module.exports = { resolvePushConfig };
