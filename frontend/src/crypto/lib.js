// src/crypto/lib.js
"use strict";

/**
 * Converts a plaintext string into a Uint8Array
 */
export function stringToBuffer(str) {
  return new TextEncoder().encode(str);
}

/**
 * Converts Uint8Array / ArrayBuffer back to string
 */
export function bufferToString(buf) {
  return new TextDecoder().decode(buf);
}

/**
 * Converts buffer to Base64 string
 */
export function encodeBuffer(buf) {
  return btoa(
    String.fromCharCode(...new Uint8Array(buf))
  );
}

/**
 * Converts Base64 string back to Uint8Array
 */
export function decodeBuffer(base64) {
  return Uint8Array.from(
    atob(base64),
    c => c.charCodeAt(0)
  );
}

/**
 * Generates cryptographically secure random bytes
 */
export function getRandomBytes(len) {
  return window.crypto.getRandomValues(new Uint8Array(len));
}
