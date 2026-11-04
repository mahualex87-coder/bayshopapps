const { withInfoPlist, withAndroidManifest, AndroidConfig, createRunOncePlugin } = require('expo/config-plugins');

/** Official SDK autolinking, region only. The upstream plugin also installs push
 * forwarding regardless of manual-init; this app has not enabled that transfer. */
function withIntercomManual(config, { region = 'US' } = {}) {
  if (!['US', 'EU', 'AU'].includes(region)) throw new Error('Unsupported Intercom region');
  config = withInfoPlist(config, mod => { mod.modResults.IntercomRegion = region; return mod; });
  return withAndroidManifest(config, mod => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'io.intercom.android.sdk.server.region', { US: '@integer/intercom_server_region_us', EU: '@integer/intercom_server_region_eu', AU: '@integer/intercom_server_region_aus' }[region]);
    return mod;
  });
}
module.exports = createRunOncePlugin(withIntercomManual, 'bayshop-intercom-manual', '1.0.0');
