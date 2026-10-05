import { redirect } from "next/navigation";

export default function PyqAdminIndex() {
  redirect("/admin/pyq/questions");
}
