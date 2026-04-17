export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Clé API non configurée sur le serveur" });
  }

  const { waypoints } = req.body;

  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return res.status(400).json({ error: "Il faut au moins 2 points" });
  }

  const toParam = (w) =>
    w.lat != null && w.lng != null ? `${w.lat},${w.lng}` : w.name;

  const origin = toParam(waypoints[0]);
  const destination = toParam(waypoints[waypoints.length - 1]);
  const intermediate = waypoints.slice(1, -1).map(toParam);

  const params = new URLSearchParams({
    origin,
    destination,
    mode: "driving",
    language: "fr",
    key: apiKey,
  });

  if (intermediate.length > 0) {
    params.set("waypoints", intermediate.join("|"));
  }

  const apiRes = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?${params}`
  );
  const data = await apiRes.json();

  if (data.status !== "OK") {
    return res.status(502).json({ error: `Google Directions : ${data.status}` });
  }

  const text = formatDirections(data, waypoints);
  return res.status(200).json({ text });
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<div[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatDirections(data, waypoints) {
  const lines = [];

  data.routes[0].legs.forEach((leg, legIdx) => {
    const from = waypoints[legIdx]?.name || leg.start_address;
    const to = waypoints[legIdx + 1]?.name || leg.end_address;

    lines.push(
      `▶️ ${from} → ${to} (${leg.distance.text}, ${leg.duration.text})`
    );

    const MIN_DISTANCE = 500; // mètres — ignore les micro-virages
    leg.steps.forEach((step) => {
      if (step.distance.value < MIN_DISTANCE) return;
      const instruction = stripHtml(step.html_instructions);
      lines.push(`  ${instruction} (${step.distance.text})`);
    });

    lines.push("");
  });

  const totalDist = data.routes[0].legs.reduce(
    (sum, leg) => sum + leg.distance.value,
    0
  );
  const totalTime = data.routes[0].legs.reduce(
    (sum, leg) => sum + leg.duration.value,
    0
  );
  const km = (totalDist / 1000).toFixed(1);
  const h = Math.floor(totalTime / 3600);
  const m = Math.round((totalTime % 3600) / 60);

  lines.push(`=== Total : ${km} km, ${h}h${String(m).padStart(2, "0")} ===`);

  return lines.join("\n");
}
