import { redirect } from "next/navigation";
import { getUser } from "@/lib/dal";
import GeneratorClient from "./GeneratorClient";

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ story?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login?next=/generate");
  const { story } = await searchParams;
  return <GeneratorClient initialStoryId={typeof story === "string" ? story : null} />;
}
