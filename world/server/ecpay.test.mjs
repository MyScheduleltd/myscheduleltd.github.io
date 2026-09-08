/**
 * The official CheckMacValue vectors, copied in.
 *
 * Copied rather than read from the skill folder on purpose: that folder is on
 * one machine and this test has to run anywhere the repo does. Source is
 * `test-vectors/checkmacvalue.json` in ECPay's own API skill, and the eighth
 * vector there is left out because it is ECTicket, whose formula is a
 * different one entirely.
 *
 * If any of these ever fails, the integration is broken and no amount of
 * checking the form fields will show it — a wrong check value looks like a
 * request ECPay simply refuses.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMacValue, verifyCheckMacValue, ecpayUrlEncode } from './ecpay.mjs';

const VECTORS = [
  {
    "name": "SHA256 基本測試（AIO 金流）",
    "method": "SHA256",
    "hashKey": "pwFHCqoQZGmho4w6",
    "hashIV": "EkRm7iFT261dpevs",
    "params": {
      "MerchantID": "3002607",
      "MerchantTradeNo": "Test1234567890",
      "MerchantTradeDate": "2025/01/01 12:00:00",
      "PaymentType": "aio",
      "TotalAmount": "100",
      "TradeDesc": "測試",
      "ItemName": "測試商品",
      "ReturnURL": "https://example.com/notify",
      "ChoosePayment": "ALL",
      "EncryptType": "1"
    },
    "expected": "291CBA324D31FB5A4BBBFDF2CFE5D32598524753AFD4959C3BF590C5B2F57FB2"
  },
  {
    "name": "MD5 測試（國內物流）",
    "method": "MD5",
    "hashKey": "5294y06JbISpM5x9",
    "hashIV": "v77hoKGq4kWxNNIS",
    "params": {
      "MerchantID": "2000132",
      "LogisticsType": "CVS",
      "LogisticsSubType": "UNIMART",
      "MerchantTradeDate": "2025/01/01 12:00:00"
    },
    "expected": "545E6146FD45BDA683C88454DB34CE8D"
  },
  {
    "name": "特殊字元 ' 測試（Node.js/TypeScript 修正驗證）",
    "method": "SHA256",
    "hashKey": "pwFHCqoQZGmho4w6",
    "hashIV": "EkRm7iFT261dpevs",
    "params": {
      "MerchantID": "3002607",
      "ItemName": "Tom's Shop",
      "TotalAmount": "100"
    },
    "expected": "CF0A3D4901D99459D8641516EC57210700E8A5C9AB26B1D021301E9CB93EF78D"
  },
  {
    "name": "特殊字元 ~ 測試",
    "method": "SHA256",
    "hashKey": "pwFHCqoQZGmho4w6",
    "hashIV": "EkRm7iFT261dpevs",
    "params": {
      "MerchantID": "3002607",
      "ItemName": "Test~Product",
      "TotalAmount": "200"
    },
    "expected": "CEEAE01D2F9A8E74D4AC0DCE7735B046D73F35A5EC99558A31A2EE03159DA1C9"
  },
  {
    "name": "空格處理測試（%20 vs + 陷阱）",
    "method": "SHA256",
    "hashKey": "pwFHCqoQZGmho4w6",
    "hashIV": "EkRm7iFT261dpevs",
    "params": {
      "MerchantID": "3002607",
      "ItemName": "My Test Product",
      "TotalAmount": "300"
    },
    "expected": "7712A5E6EDC3B57086063C88568084C66CE882A21D40E74DE5ACA3B478C6F316"
  },
  {
    "name": "Callback 驗證測試（模擬收到付款通知）",
    "method": "SHA256",
    "hashKey": "pwFHCqoQZGmho4w6",
    "hashIV": "EkRm7iFT261dpevs",
    "params": {
      "MerchantID": "3002607",
      "MerchantTradeNo": "Test1234567890",
      "RtnCode": "1",
      "RtnMsg": "Succeeded",
      "TradeNo": "2301011234567890",
      "TradeAmt": "100",
      "PaymentDate": "2025/01/01 12:05:00",
      "PaymentType": "Credit_CreditCard",
      "TradeDate": "2025/01/01 12:00:00",
      "SimulatePaid": "0"
    },
    "expected": "2AB536D86AFF8E1086744D59175040A32538C96B1C28C4135B551BD728E913B8"
  },
  {
    "name": "MD5 測試（B2C 發票 AllowanceByCollegiate Callback）",
    "method": "MD5",
    "hashKey": "ejCk326UnaZWKisg",
    "hashIV": "q9jcZX8Ib9LM8wYk",
    "params": {
      "MerchantID": "2000132",
      "AllowanceAmt": "100",
      "AllowanceDate": "2025/01/01 12:00:00",
      "AllowanceNo": "A01-23456789",
      "InvoiceNo": "AB-12345678",
      "RtnCode": "1",
      "RtnMsg": "OK"
    },
    "expected": "6A248D13B8C5B5C4F93D38FB5F2E2B5F"
  }
];

for (const vector of VECTORS) {
  test(`CheckMacValue — ${vector.name}`, () => {
    assert.equal(
      checkMacValue(vector.params, vector.hashKey, vector.hashIV, vector.method),
      vector.expected,
    );
  });
}

test('a space encodes to + and not %20, which is the usual way this breaks', () => {
  assert.equal(ecpayUrlEncode('My Test Product'), 'my+test+product');
});

test('tilde and apostrophe keep their escapes; .NET only restores seven characters', () => {
  assert.equal(ecpayUrlEncode('a~b'), 'a%7eb');
  assert.equal(ecpayUrlEncode("Tom's"), 'tom%27s');
  assert.equal(ecpayUrlEncode('a(b)c!d*e'), 'a(b)c!d*e');
});

test('a notification verifies, and one byte of tampering does not', () => {
  const key = 'pwFHCqoQZGmho4w6';
  const iv = 'EkRm7iFT261dpevs';
  const notification = { MerchantID: '3002607', MerchantTradeNo: 'Test1234567890', RtnCode: '1', TradeAmt: '100' };
  const signed = { ...notification, CheckMacValue: checkMacValue(notification, key, iv) };
  assert.equal(verifyCheckMacValue(signed, key, iv), true);
  assert.equal(verifyCheckMacValue({ ...signed, TradeAmt: '1000' }, key, iv), false);
  assert.equal(verifyCheckMacValue({ ...signed, CheckMacValue: 'DEADBEEF' }, key, iv), false);
});

test('an existing check value is never part of its own input', () => {
  const key = 'pwFHCqoQZGmho4w6';
  const iv = 'EkRm7iFT261dpevs';
  const params = { MerchantID: '3002607', TotalAmount: '100' };
  assert.equal(
    checkMacValue(params, key, iv),
    checkMacValue({ ...params, CheckMacValue: 'WHATEVER' }, key, iv),
  );
});
