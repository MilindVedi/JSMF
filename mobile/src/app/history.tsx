import { Redirect } from "expo-router";

/** Attempt history lives in the My Progress tab now; old links (results' "View all history") land there. */
export default function HistoryRedirect() {
  return <Redirect href={{ pathname: "/progress", params: { view: "history" } }} />;
}
