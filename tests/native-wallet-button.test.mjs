import test from 'node:test';
import assert from 'node:assert/strict';
import { walletButtonProps } from '../src/features/payments/wallet-button-contract.ts';
const google = {method:'google-pay',google:{gatewayMerchantId:'test-merchant',environment:'TEST',networks:['VISA','MASTERCARD']}};
const apple = {method:'apple-pay',apple:{merchantIdentifier:'merchant.example.qa',networks:['visa','masterCard']}};
test('official button is absent before readiness and on an unsupported platform',()=>{
  assert.equal(walletButtonProps(google,'android',false,false,false),null);
  assert.equal(walletButtonProps(google,'ios',true,false,false),null);
  assert.equal(walletButtonProps(apple,'android',true,false,false),null);
  assert.equal(walletButtonProps(apple,'web',true,false,false),null);
  assert.equal(walletButtonProps({...google,google:{...google.google,networks:['unknown']}},'android',true,false,false),null);
});
test('native button receives only display configuration, never merchant or payment fields',()=>{
  const value = walletButtonProps({...google,token:'never',amount:'10.00'},'android',true,false,true);
  assert.deepEqual(value,{walletNetworks:['VISA','MASTERCARD'],walletEnabled:true,darkBackground:true});
  value.walletNetworks.push('QA');
  assert.deepEqual(google.google.networks,['VISA','MASTERCARD']);
});
test('busy disables the native control without switching branding or platform',()=>{
  assert.deepEqual(walletButtonProps(apple,'ios',true,true,false),{walletNetworks:['visa','masterCard'],walletEnabled:false,darkBackground:false});
});
