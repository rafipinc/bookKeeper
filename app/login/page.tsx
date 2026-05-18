import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Dashboard — bookkeeping-app",
};

export default function LoginPage() {
  redirect("/dashboard");
}
