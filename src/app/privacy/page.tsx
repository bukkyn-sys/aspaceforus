import type { Metadata } from "next";
import LegalDocPage from "@/components/legal-doc-page";

export const metadata: Metadata = { title: "privacy policy · us." };

export default function PrivacyPage() {
  return <LegalDocPage doc="privacy" />;
}
