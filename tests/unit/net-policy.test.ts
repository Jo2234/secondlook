import { expect, test } from 'vitest';
import { allAddressesAllowed, authorizationAllowed, classifyUrl, isRedirect, isRefusedIp } from '../../src/youcam/net-policy.js';
test('F31 destination URLs reject host tricks userinfo ports and IP literals', () => {
  for (const url of ['http://yce-us.s3-accelerate.amazonaws.com/a', 'https://evil.example/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://user@yce-us.s3-accelerate.amazonaws.com/a', 'https://yce-us.s3-accelerate.amazonaws.com:8443/a', 'https://yce-us.s3-accelerate.amazonaws.com./a']) expect(classifyUrl(url, 'media').allowed).toBe(false);
  expect(classifyUrl('https://yce-us.s3-accelerate.amazonaws.com/a?Signature=opaque', 'media').allowed).toBe(true);
  expect(classifyUrl('https://yce-api-01.makeupar.com/s2s/v2.0/file', 'api').allowed).toBe(true);
  expect(authorizationAllowed('media', true)).toBe(false);
  for (const status of [301, 302, 307]) expect(isRedirect(status)).toBe(true);
});
test('F31 each forbidden IPv4 IPv6 and mapped range fails closed', () => {
  for (const ip of ['0.1.2.3', '10.0.0.5', '127.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.169.254', '100.64.0.1', '100.127.255.255', '224.0.0.1', '240.1.2.3', '::', '::1', 'fc00::1', 'fd00::1', 'fe80::1', 'febf::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:a00:5', 'not-an-ip']) expect(isRefusedIp(ip), ip).toBe(true);
  for (const ip of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:808:808']) expect(isRefusedIp(ip), ip).toBe(false);
  expect(allAddressesAllowed(['8.8.8.8', '10.0.0.1'])).toBe(false); expect(allAddressesAllowed([])).toBe(false);
});
