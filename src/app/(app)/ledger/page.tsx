import { Suspense } from "react";
import LedgerClient from "./ledger-client";

export default function LedgerPage() {
  return (
    <Suspense>
      <LedgerClient />
    </Suspense>
  );
}
