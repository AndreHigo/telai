import assert from "node:assert/strict";
import { clientIp, isLoopback, publicOriginForRequest, trustedForwardedHeaders } from "../server/http/request-context.mjs";

const request = ({ remoteAddress = "127.0.0.1", headers = {}, encrypted = false } = {}) => ({
  socket: { remoteAddress, encrypted },
  headers,
});

assert.equal(isLoopback("127.0.0.1"), true);
assert.equal(isLoopback("::1"), true);
assert.equal(isLoopback("203.0.113.10"), false);

const forwarded = request({
  headers: {
    host: "internal:8787",
    "x-forwarded-for": "198.51.100.10, 127.0.0.1",
    "x-forwarded-proto": "https",
    "x-forwarded-host": "telai.example",
  },
});
assert.equal(trustedForwardedHeaders(forwarded), true);
assert.equal(clientIp(forwarded), "198.51.100.10");
assert.equal(publicOriginForRequest(forwarded), "https://telai.example");

const direct = request({
  remoteAddress: "203.0.113.10",
  headers: {
    host: "telai.example",
    "x-forwarded-for": "198.51.100.20",
    "x-forwarded-proto": "https",
    "x-forwarded-host": "spoofed.example",
  },
});
assert.equal(trustedForwardedHeaders(direct), false);
assert.equal(clientIp(direct), "203.0.113.10");
assert.equal(publicOriginForRequest(direct), "http://telai.example");

console.log(JSON.stringify({ ok: true, loopback: true, forwardedTrusted: true, directForwardedIgnored: true }));
