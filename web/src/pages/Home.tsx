import { useCave } from "../app/context.ts";
import { useDoc } from "../store/queries.ts";

export function Home() {
  const settings = useDoc(useCave().local.db, "settings");
  const timeZone = typeof settings?.data.timezone === "string" ? settings.data.timezone : undefined;
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date());

  return (
    <section
      aria-label="Command center"
      style={{
        paddingTop: 24,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
      }}
    >
      <span className="k">{today}</span>
      <h1 style={{ margin: 0, fontSize: 44, fontWeight: 700, letterSpacing: "-0.035em" }}>
        What's the move?
      </h1>
    </section>
  );
}
