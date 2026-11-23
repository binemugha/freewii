'use strict';

/**
 * Self-signed cert generator.
 *
 * Why this exists: DeviceOrientationEvent.requestPermission() only resolves in a
 * secure context. `http://192.168.x.x` is NOT a secure context, so a plain-HTTP
 * LAN server can never read the phone's IMU. HTTPS with a self-signed cert is —
 * you just have to click through the browser warning once on the phone.
 */

const { execFileSync } = require('child_process');
const { X509Certificate } = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CERT_DIR = process.env.FREEWII_CERT_DIR || path.join(__dirname, '..', 'certs');
const KEY_PATH = path.join(CERT_DIR, 'key.pem');
const CRT_PATH = path.join(CERT_DIR, 'cert.pem');

/** Every non-internal IPv4 address, so the cert covers whichever LAN IP is live. */
function localAddresses() {
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

/** Does the existing cert still cover every address we're about to serve on? */
function certCoversCurrentIps(quiet) {
  try {
    const text = new X509Certificate(fs.readFileSync(CRT_PATH)).subjectAltName || '';
    const missing = localAddresses().filter((ip) => !text.includes(ip));
    if (missing.length && !quiet) {
      console.log(`[cert] regenerating — cert predates current address ${missing.join(', ')}`);
    }
    return missing.length === 0;
  } catch {
    return false;
  }
}

function ensureCert({ quiet = false } = {}) {
  // A cert pinned to an old DHCP lease still loads, but the phone then hits a
  // NAME_INVALID error that looks nothing like "self-signed" — so check the
  // SANs rather than just the file's existence.
  if (fs.existsSync(KEY_PATH) && fs.existsSync(CRT_PATH) && certCoversCurrentIps(quiet)) {
    return { key: fs.readFileSync(KEY_PATH), cert: fs.readFileSync(CRT_PATH) };
  }

  fs.mkdirSync(CERT_DIR, { recursive: true });

  const ips = localAddresses();
  const names = [
    { type: 2, value: 'localhost' },
    { type: 7, value: '127.0.0.1' },
    ...ips.map((ip) => ({ type: 7, value: ip })),
  ];
  const altNames = names.map((name) => `${name.type === 2 ? 'DNS' : 'IP'}:${name.value}`).join(',');

  try {
    execFileSync(
      'openssl',
      [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', KEY_PATH,
        '-out', CRT_PATH,
        '-days', '825',
        '-subj', '/CN=freewii.local',
        '-addext', `subjectAltName=${altNames}`,
      ],
      { stdio: 'ignore' }
    );
  } catch (err) {
    try {
      const selfsigned = require('selfsigned');
      const pems = selfsigned.generate([{ name: 'commonName', value: 'freewii.local' }], {
        keySize: 2048,
        days: 825,
        algorithm: 'sha256',
        extensions: [
          { name: 'basicConstraints', cA: false, critical: true },
          { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
          { name: 'extKeyUsage', serverAuth: true },
          {
            name: 'subjectAltName',
            altNames: names.map((name) => name.type === 7
              ? { type: 7, value: Buffer.from(name.value.split('.').map(Number)).toString('latin1') }
              : name),
          },
        ],
      });
      fs.writeFileSync(KEY_PATH, pems.private, { mode: 0o600 });
      fs.writeFileSync(CRT_PATH, pems.cert);
      if (!quiet) console.log(`[cert] generated self-signed cert for ${altNames}`);
      return { key: pems.private, cert: pems.cert };
    } catch (fallbackErr) {
      if (!quiet) {
        console.error('[cert] certificate generation failed — falling back to plain HTTP.');
        console.error('[cert]', fallbackErr.message);
      }
      return null;
    }
  }

  if (!quiet) console.log(`[cert] generated self-signed cert for ${altNames}`);
  return { key: fs.readFileSync(KEY_PATH), cert: fs.readFileSync(CRT_PATH) };
}

module.exports = { ensureCert, localAddresses, CERT_DIR };

if (require.main === module) ensureCert();
