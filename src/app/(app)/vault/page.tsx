import { Suspense } from "react";
import VaultClient from "./vault-client";

export default function VaultPage() {
  return (
    <Suspense>
      <VaultClient />
    </Suspense>
  );
}
