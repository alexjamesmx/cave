import webpush from "web-push";

// New VAPID keys as env lines. On the VPS the output is appended to /etc/cave/cave.env, so the
// private key never shows on screen (docs/hosting.md, "Web Push").
if (process.env.CAVE_VAPID_PUBLIC || process.env.CAVE_VAPID_PRIVATE) {
  console.error(
    "VAPID keys are already set. New keys would unsubscribe every device; remove the old ones first if that is what you want.",
  );
  process.exit(1);
}
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
const subject = process.env.CAVE_PUBLIC_ORIGIN || "mailto:you@example.com";
console.log(`CAVE_VAPID_PUBLIC=${publicKey}`);
console.log(`CAVE_VAPID_PRIVATE=${privateKey}`);
console.log(`CAVE_VAPID_SUBJECT=${subject}`);
