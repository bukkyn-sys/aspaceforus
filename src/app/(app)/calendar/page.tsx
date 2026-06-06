import { Suspense } from "react";
import CalendarClient from "./calendar-client";

export default function CalendarPage() {
  return (
    <Suspense>
      <CalendarClient />
    </Suspense>
  );
}
