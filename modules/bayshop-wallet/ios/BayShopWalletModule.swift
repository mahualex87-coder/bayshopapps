import ExpoModulesCore
import PassKit
import UIKit

public final class BayShopWalletModule: Module {
  private let coordinator = WalletCoordinator()
  public func definition() -> ModuleDefinition {
    Name("BayShopWallet")
    Constant("protocolVersion") { 1 }
    Constant("buttonProtocolVersion") { 1 }
    View(BayShopWalletButtonView.self) {
      Events("onButtonPress")
      Prop("walletNetworks") { (view: BayShopWalletButtonView, value: [String]) in view.walletNetworks = value }
      Prop("walletEnabled") { (view: BayShopWalletButtonView, value: Bool) in view.walletEnabled = value }
      Prop("darkBackground") { (view: BayShopWalletButtonView, value: Bool) in view.darkBackground = value }
      OnViewDidUpdateProps { (view: BayShopWalletButtonView) in view.updateButton() }
    }
    AsyncFunction("isReadyAsync") { (config: [String: Any]) -> Bool in
      self.coordinator.isReady(config)
    }.runOnQueue(.main)
    AsyncFunction("presentAsync") { (request: [String: Any], promise: Promise) in
      self.coordinator.begin(request, promise: promise)
    }.runOnQueue(.main)
    AsyncFunction("completeAsync") { (requestId: String, success: Bool) -> Bool in
      self.coordinator.complete(requestId, success: success)
    }.runOnQueue(.main)
    AsyncFunction("cancelAsync") { (requestId: String) -> Bool in
      self.coordinator.cancel(requestId)
    }.runOnQueue(.main)
    // Inactive during Face ID is expected. Actual background invalidates this one-shot flow.
    OnAppEntersBackground { DispatchQueue.main.async { self.coordinator.cancelActive() } }
    OnDestroy { DispatchQueue.main.async { self.coordinator.dispose() } }
  }
}

private final class WalletCoordinator: NSObject, PKPaymentAuthorizationControllerDelegate {
  private struct Config { let merchant: String; let networks: [PKPaymentNetwork] }
  private final class Pending {
    let id: String
    let controller: PKPaymentAuthorizationController
    var promise: Promise?
    var handler: ((PKPaymentAuthorizationResult) -> Void)?
    var timer: DispatchWorkItem?
    var phase = "presenting"
    var dismissing = false
    init(id: String, controller: PKPaymentAuthorizationController, promise: Promise) {
      self.id = id; self.controller = controller; self.promise = promise
    }
  }
  private var active: Pending?
  private var used = Set<String>()
  private var cancelled = Set<String>()
  private var disposed = false
  private let capabilities: PKMerchantCapability = [.capability3DS, .capabilityCredit, .capabilityDebit]

  func isReady(_ data: [String: Any]) -> Bool {
    guard !disposed, active == nil, UIApplication.shared.applicationState == .active, let config = configuration(data) else { return false }
    return PKPaymentAuthorizationController.canMakePayments() && PKPaymentAuthorizationController.canMakePayments(usingNetworks: config.networks, capabilities: capabilities)
  }
  private func configuration(_ data: [String: Any]) -> Config? {
    guard data["method"] as? String == "apple-pay", let apple = data["apple"] as? [String: Any],
      let merchant = apple["merchantIdentifier"] as? String, matches(merchant, "^merchant\\.[A-Za-z0-9.-]{1,240}$"),
      let configured = Bundle.main.object(forInfoDictionaryKey: "BayShopWalletAppleMerchantIds") as? [String], configured.contains(merchant),
      let names = apple["networks"] as? [String], !names.isEmpty, Set(names).count == names.count else { return nil }
    // Written by the candidate plugin ONLY after checking the existing Apple Pay entitlement.
    // Signed entitlement / provisioning equality remains a mandatory artifact verification gate.
    let lookup: [String: PKPaymentNetwork] = ["visa": .visa, "masterCard": .masterCard, "maestro": .maestro]
    let networks = names.compactMap { lookup[$0] }
    guard names.count == networks.count else { return nil }
    return Config(merchant: merchant, networks: networks)
  }
  func begin(_ data: [String: Any], promise: Promise) {
    guard !disposed, let config = configuration(data) else { reject(promise, "ERR_WALLET_UNAVAILABLE"); return }
    guard let id = data["requestId"] as? String, validId(id),
      let amount = data["amount"] as? String, matches(amount, "^(?:0|[1-9][0-9]{0,8})(?:\\.[0-9]{1,2})?$"), matches(amount, "[1-9]"),
      let currency = data["currencyCode"] as? String, matches(currency, "^[A-Z]{3}$"),
      let country = data["countryCode"] as? String, matches(country, "^[A-Z]{2}$"),
      let name = data["merchantName"] as? String, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      name.utf16.count <= 100, !matches(name, "[\\x00-\\x1f\\x7f]") else { reject(promise, "ERR_WALLET_INVALID_REQUEST"); return }
    if cancelled.remove(id) != nil { reject(promise, "ERR_WALLET_CANCELLED"); return }
    guard active == nil else { reject(promise, "ERR_WALLET_BUSY"); return }
    guard used.count < 4096, !used.contains(id) else { reject(promise, "ERR_WALLET_INVALID_REQUEST"); return }
    guard isReady(data) else { reject(promise, "ERR_WALLET_UNAVAILABLE"); return }
    used.insert(id)
    let request = PKPaymentRequest()
    request.merchantIdentifier = config.merchant
    request.merchantCapabilities = capabilities
    request.supportedNetworks = config.networks
    request.currencyCode = currency
    request.countryCode = country
    request.paymentSummaryItems = [PKPaymentSummaryItem(label: name, amount: NSDecimalNumber(string: amount, locale: Locale(identifier: "en_US_POSIX")), type: .final)]
    // No shipping/billing contacts or card fields are requested or returned to JS.
    let controller = PKPaymentAuthorizationController(paymentRequest: request)
    let op = Pending(id: id, controller: controller, promise: promise)
    active = op; controller.delegate = self
    schedule(op, seconds: 120) { [weak self, weak op] in
      if let self, let op { self.abort(op, code: "ERR_WALLET_TIMEOUT") }
    }
    controller.present { [weak self, weak op] presented in
      DispatchQueue.main.async {
        guard let self, let op else { return }
        guard self.active === op else { if presented { controller.dismiss(completion: nil) }; return }
        if op.phase == "closing" { self.dismiss(op); return }
        if !presented { self.abort(op, code: "ERR_WALLET_UNAVAILABLE", dismissSheet: false); return }
        op.phase = "choosing"
      }
    }
  }
  func complete(_ id: String, success: Bool) -> Bool {
    guard let op = active, op.id == id, op.phase == "authorized", let handler = op.handler else { return false }
    // success MUST mean confirmed server payment approval, never merely token acquisition.
    op.handler = nil; op.phase = "closing"; op.timer?.cancel()
    handler(PKPaymentAuthorizationResult(status: success ? .success : .failure, errors: nil))
    // PassKit normally calls DidFinish. Bound dismissal if the delegate callback is missing.
    schedule(op, seconds: 5) { [weak self, weak op] in if let self, let op { self.dismiss(op) } }
    return true
  }
  func cancel(_ id: String) -> Bool {
    guard validId(id) else { return false }
    if let op = active, op.id == id { abort(op, code: "ERR_WALLET_CANCELLED") }
    else if cancelled.count < 4096 { cancelled.insert(id) }
    return true
  }
  func cancelActive() { if let op = active { abort(op, code: "ERR_WALLET_CANCELLED") } }
  func dispose() { disposed = true; cancelActive() }

  func paymentAuthorizationController(_ controller: PKPaymentAuthorizationController, didAuthorizePayment payment: PKPayment, handler completion: @escaping (PKPaymentAuthorizationResult) -> Void) {
    guard let op = active, op.controller === controller, op.phase == "choosing", UIApplication.shared.applicationState != .background else {
      completion(PKPaymentAuthorizationResult(status: .failure, errors: nil)); return
    }
    let bytes = payment.token.paymentData
    guard !bytes.isEmpty, bytes.count <= 12288 else {
      completion(PKPaymentAuthorizationResult(status: .failure, errors: nil)); abort(op, code: "ERR_WALLET_INVALID_RESULT"); return
    }
    op.handler = completion; op.phase = "authorized"
    // Apple allows ~30s for processing. Fail safely before that, with no automatic retry.
    schedule(op, seconds: 25) { [weak self, weak op] in if let self, let op { self.abort(op, code: "ERR_WALLET_TIMEOUT") } }
    let promise = op.promise; op.promise = nil
    promise?.resolve(["requestId": op.id, "method": "apple-pay", "token": bytes.base64EncodedString()])
  }
  func paymentAuthorizationControllerDidFinish(_ controller: PKPaymentAuthorizationController) {
    guard let op = active, op.controller === controller else { controller.dismiss(completion: nil); return }
    if op.phase != "closing" { abort(op, code: "ERR_WALLET_CANCELLED") }
    else { dismiss(op) }
  }
  private func abort(_ op: Pending, code: String, dismissSheet: Bool = true) {
    guard active === op else { return }
    let wasPresenting = op.phase == "presenting"
    op.phase = "closing"; op.timer?.cancel(); op.timer = nil
    let handler = op.handler; op.handler = nil
    handler?(PKPaymentAuthorizationResult(status: .failure, errors: nil))
    let promise = op.promise; op.promise = nil; if let promise { reject(promise, code) }
    if !dismissSheet { clear(op) }
    else if !wasPresenting { dismiss(op) }
    // If cancelled during present(), keep the lease until its completion and dismiss then.
  }
  private func dismiss(_ op: Pending) {
    guard active === op, !op.dismissing else { return }
    op.dismissing = true; op.timer?.cancel(); op.timer = nil
    op.controller.dismiss { [weak self, weak op] in
      DispatchQueue.main.async { if let self, let op { self.clear(op) } }
    }
  }
  private func clear(_ op: Pending) {
    guard active === op else { return }
    op.timer?.cancel(); op.timer = nil; op.handler = nil; op.promise = nil
    op.controller.delegate = nil; active = nil
  }
  private func schedule(_ op: Pending, seconds: Double, action: @escaping () -> Void) {
    op.timer?.cancel()
    let timer = DispatchWorkItem(block: action); op.timer = timer
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: timer)
  }
  private func matches(_ value: String, _ pattern: String) -> Bool { value.range(of: pattern, options: .regularExpression) != nil }
  private func validId(_ id: String) -> Bool { matches(id, "^[A-Za-z0-9_-]{16,64}$") }
  private func reject(_ promise: Promise, _ code: String) { promise.reject(code, "Wallet request could not be completed") }
}
