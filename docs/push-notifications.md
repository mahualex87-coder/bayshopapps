# Mobile push notifications

BayShop’s server sends customer notifications using Firebase Cloud Messaging. Both mobile platforms register an FCM address with the signed-in BayShop account. Firebase delivers iPhone alerts through APNs. The app subscribes in Settings → Notifications after the user enables this device. The account’s existing channel preferences still apply.

## Native configuration

Use the Android and iOS **client** configuration files for `com.bayshop.mobile.demo` in the existing Firebase project `baymd-148208`. Configure the Expo/EAS preview environment with the file variables `BAYSHOP_FIREBASE_ANDROID_CONFIG` and `BAYSHOP_FIREBASE_IOS_CONFIG`. Set `BAYSHOP_REQUIRE_PUSH=1` for a build that must deliver notifications. The configuration checks the project, sender, and both application identifiers before native prebuild. A Firebase service account and an APNs signing key belong on the sender side and must never enter the app or the mobile build environment.

For local EAS preview builds, keep the verified client files at `credentials/firebase/google-services.json` and `credentials/firebase/GoogleService-Info.plist`, or supply their paths in the shell. EAS reads the local app configuration before fetching project variables. The preview worker uses the two file variables from the project. The Android download can contain registrations for several applications. To fit the 4 KiB EAS file limit, retain the project metadata and the complete `client` entry whose `package_name` is `com.bayshop.mobile.demo`.

The iOS app needs the Push Notifications capability in its signing profile and an APNs configuration in Firebase that can send to this bundle. The existing server uses FCM HTTP v1. Deploy the reviewed mobile push endpoint and queue changes before enrolling a phone. Native dependencies require a fresh signed build for each platform.

## Acceptance on phones

Using a staging member and its own unpaid invoice and parcel, enable the account’s push channel and notifications on this device. Verify delivery after a cold start, while the app is in the background, and with it open. A tap opens the owned detail, a group opens its section, and a payment alert opens the invoices page. In the foreground the user can read and dismiss the alert without leaving their form. Opening an alert never submits a form or starts a payment.

Verify token refresh, revoking OS permission, signing out and switching accounts. A queued notification for the first account must not open its data in the second account. Use a second test device to confirm that disabling the first leaves its other registrations available. Repeat on signed iOS and Android builds. The automated suite verifies routing, ownership guards, registration and cleanup with fixtures. Native delivery requires these platform credentials, a deployed sender and actual devices.
