/** Candidate only. NOT registered in app.config. Does not create Apple Merchant IDs/entitlements. */
const { withInfoPlist, withAndroidManifest, AndroidConfig } = require('expo/config-plugins');
function walletOptions(config, input = {}) {
  const arrays = ['googleMerchantIds', 'googleEnvironments', 'appleMerchantIds'];
  for (const key of arrays) if (input[key] !== undefined && (!Array.isArray(input[key]) || input[key].some(x => typeof x !== 'string'))) throw new Error('Invalid wallet public configuration');
  const googleMerchantIds = [...new Set(input.googleMerchantIds || [])];
  const googleEnvironments = [...new Set(input.googleEnvironments || [])];
  const appleMerchantIds = [...new Set(input.appleMerchantIds || [])];
  if (googleMerchantIds.some(x => !/^[A-Za-z0-9_-]{8,50}$/.test(x)) || googleEnvironments.some(x => !['TEST', 'PRODUCTION'].includes(x)) || appleMerchantIds.some(x => !/^merchant\.[A-Za-z0-9.-]{1,240}$/.test(x))) throw new Error('Invalid wallet public configuration');
  const entitlements = config.ios?.entitlements?.['com.apple.developer.in-app-payments'];
  if (appleMerchantIds.length && (!Array.isArray(entitlements) || appleMerchantIds.some(x => !entitlements.includes(x)))) throw new Error('Apple Pay merchant entitlement must be explicitly configured first');
  return { googleMerchantIds, googleEnvironments, appleMerchantIds };
}
module.exports = function withWallet(config, input) {
  const options = walletOptions(config, input);
  config = withInfoPlist(config, mod => {
    mod.modResults.BayShopWalletAppleMerchantIds = options.appleMerchantIds;
    return mod;
  });
  return withAndroidManifest(config, mod => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'com.bayshop.wallet.GOOGLE_MERCHANT_IDS', options.googleMerchantIds.join(','));
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'com.bayshop.wallet.GOOGLE_ENVIRONMENTS', options.googleEnvironments.join(','));
    return mod;
  });
};
module.exports.walletOptions = walletOptions;
