"use strict";

export function stringToBuffer(str) {
  return new TextEncoder().encode(str);
}

export function bufferToString(buf) {
  return new TextDecoder().decode(buf);
}

export function encodeBuffer(buf) {
  return btoa(
    String.fromCharCode(...new Uint8Array(buf))
  );
}

export function decodeBuffer(base64) {
  return Uint8Array.from(
    atob(base64),
    c => c.charCodeAt(0)
  );
}


export function getRandomBytes(len) {
  return window.crypto.getRandomValues(new Uint8Array(len));
}
