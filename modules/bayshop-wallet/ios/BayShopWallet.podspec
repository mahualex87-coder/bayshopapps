Pod::Spec.new do |s|
  s.name = 'BayShopWallet'
  s.version = '0.1.0'
  s.summary = 'Local EuPlatesc wallet token bridge'
  s.description = 'Collects encrypted wallet tokens; never processes charges.'
  s.license = { :type => 'Proprietary' }
  s.author = 'BayShop'
  s.homepage = 'https://bayshop.com'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PassKit', 'UIKit'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
