import ExpoModulesCore
import PassKit
import UIKit

/** Official system artwork, localization and accessibility. No payment side effects. */
public final class BayShopWalletButtonView: ExpoView {
  let onButtonPress = EventDispatcher()
  var walletNetworks: [String] = []
  var walletEnabled = false
  var darkBackground = false
  private var button: PKPaymentButton?
  private var renderedDark: Bool?

  func updateButton() {
    let supported = Set(["visa", "masterCard", "maestro"])
    guard !walletNetworks.isEmpty, Set(walletNetworks).count == walletNetworks.count,
      walletNetworks.allSatisfy({ supported.contains($0) }) else {
      button?.removeFromSuperview(); button = nil; renderedDark = nil; return
    }
    if renderedDark != darkBackground || button == nil {
      button?.removeTarget(self, action: #selector(pressed), for: .touchUpInside)
      button?.removeFromSuperview()
      let child = PKPaymentButton(paymentButtonType: .inStore, paymentButtonStyle: darkBackground ? .white : .black)
      child.translatesAutoresizingMaskIntoConstraints = false
      child.addTarget(self, action: #selector(pressed), for: .touchUpInside)
      addSubview(child)
      NSLayoutConstraint.activate([
        child.leadingAnchor.constraint(equalTo: leadingAnchor), child.trailingAnchor.constraint(equalTo: trailingAnchor),
        child.topAnchor.constraint(equalTo: topAnchor), child.bottomAnchor.constraint(equalTo: bottomAnchor)
      ])
      button = child; renderedDark = darkBackground
    }
    button?.isEnabled = walletEnabled
  }

  @objc private func pressed() {
    guard walletEnabled, window != nil else { return }
    onButtonPress()
  }
}
