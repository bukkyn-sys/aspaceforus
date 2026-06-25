import type { Metadata } from "next";
import LegalDocPage from "@/components/legal-doc-page";

export const metadata: Metadata = { title: "terms of service · us." };

export default function TermsPage() {
  return <LegalDocPage doc="terms" />;
}
