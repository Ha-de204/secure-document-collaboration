import IdentityManager from "./KeyManager";

export async function runIdentityTests() {
  console.log("===== TEST A1 – IdentityManager =====");

  /* ---------- INIT ---------- */
  console.log("TEST 1: initIdentity()");
  await IdentityManager.initIdentity();
  console.log("✔ Identity initialized");

  /* ---------- EXPORT ---------- */
  console.log("TEST 2: getPreKeyBundle()");
  const bundle = await IdentityManager.getPreKeyBundle();
  console.log(bundle);

  if (!bundle.identityKey || !bundle.signedPreKey || !bundle.signature) {
    console.error("❌ PreKeyBundle thiếu dữ liệu");
    return;
  }
  console.log("✔ PreKeyBundle OK");

  /* ---------- IMPORT + VERIFY ---------- */
  console.log("TEST 3: import + verify remote identity");

  const fakeUserId = "userB";
  await IdentityManager.importRemoteIdentity(fakeUserId, bundle);

  const verified = await IdentityManager.verifyRemoteIdentity(fakeUserId);
  console.log("verifyRemoteIdentity:", verified);

  if (verified !== true) {
    console.error("❌ Verify remote identity FAILED");
    return;
  }

  console.log("✔ Remote identity verified");

  /* ---------- TAMPER TEST ---------- */
  console.log("TEST 4: tamper signedPreKey");

  const tamperedBundle = {
    ...bundle,
    signedPreKey: bundle.signedPreKey.slice(0, -4) + "AAAA"
  };

  const attackerId = "attacker";
  await IdentityManager.importRemoteIdentity(attackerId, tamperedBundle);

  const verifiedTampered =
    await IdentityManager.verifyRemoteIdentity(attackerId);

  console.log("verify tampered:", verifiedTampered);

  if (verifiedTampered === false) {
    console.log("✔ Tamper detected correctly");
  } else {
    console.error("❌ Tamper NOT detected");
  }

  console.log("===== A1 TEST DONE =====");
}
