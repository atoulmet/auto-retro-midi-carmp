/**
 * Extrait le texte d'un itinéraire détaillé depuis un fichier KML Google Maps.
 *
 * Lit les points de passage du KML, puis appelle l'API Google Directions
 * pour obtenir les instructions textuelles.
 *
 * Usage:
 *   node extract_directions.js <fichier.kml>
 *   node extract_directions.js <fichier.kml> > sortie.txt
 *
 * Prérequis:
 *   export GOOGLE_MAPS_API_KEY='votre_clé'
 */

const fs = require("fs");
const path = require("path");

const filePath = process.argv[2];
const apiKey = process.env.GOOGLE_MAPS_API_KEY;

if (!filePath) {
  console.error(`Usage: node ${path.basename(process.argv[1])} <fichier.kml>`);
  process.exit(1);
}

if (!apiKey) {
  console.error(
    "Erreur : variable d'environnement GOOGLE_MAPS_API_KEY non définie.\n" +
      "  export GOOGLE_MAPS_API_KEY='votre_clé'"
  );
  process.exit(1);
}

const kml = fs.readFileSync(filePath, "utf-8");

function extractWaypoints(xml) {
  const points = [];
  const re = /<Placemark[\s>]([\s\S]*?)<\/Placemark>/gi;
  let match;

  while ((match = re.exec(xml)) !== null) {
    const block = match[1];

    // On ne garde que les Placemarks avec un <Point> (pas les LineString)
    const pointMatch = block.match(
      /<Point>\s*<coordinates>\s*([\s\S]*?)\s*<\/coordinates>\s*<\/Point>/i
    );
    if (!pointMatch) continue;

    const nameMatch = block.match(/<name>([\s\S]*?)<\/name>/i);
    const name = nameMatch ? nameMatch[1].trim() : "";

    const coords = pointMatch[1].trim().split(",");
    const lng = parseFloat(coords[0]);
    const lat = parseFloat(coords[1]);

    points.push({ name, lat, lng });
  }

  return points;
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

async function getDirections(waypoints) {
  const origin = `${waypoints[0].lat},${waypoints[0].lng}`;
  const destination = `${waypoints[waypoints.length - 1].lat},${waypoints[waypoints.length - 1].lng}`;
  const intermediate = waypoints
    .slice(1, -1)
    .map((w) => `${w.lat},${w.lng}`);

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

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?${params}`
  );

  if (!res.ok) {
    throw new Error(`Erreur HTTP ${res.status}`);
  }

  const data = await res.json();

  if (data.status !== "OK") {
    throw new Error(`API Directions erreur : ${data.status}`);
  }

  return data;
}

function formatDirections(data, waypoints) {
  const lines = [];

  data.routes[0].legs.forEach((leg, legIdx) => {
    const from = waypoints[legIdx]?.name || leg.start_address;
    const to = waypoints[legIdx + 1]?.name || leg.end_address;

    lines.push(
      `--- Tronçon ${legIdx + 1} : ${from} → ${to} (${leg.distance.text}, ${leg.duration.text}) ---`
    );

    const MIN_DISTANCE = 500; // mètres — ignore les micro-virages
    let stepNum = 0;
    leg.steps.forEach((step) => {
      if (step.distance.value < MIN_DISTANCE) return;
      stepNum++;
      const instruction = stripHtml(step.html_instructions);
      lines.push(`  ${stepNum}. ${instruction} (${step.distance.text})`);
    });

    lines.push("");
  });

  // Résumé total
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

async function main() {
  const waypoints = extractWaypoints(kml);

  if (waypoints.length < 2) {
    console.error(
      "Erreur : moins de 2 points trouvés dans le KML. " +
        "Vérifiez que le fichier contient des Placemarks avec des <Point>."
    );
    process.exit(1);
  }

  console.log(
    `Points détectés (${waypoints.length}) : ${waypoints.map((w) => w.name || `${w.lat},${w.lng}`).join(" → ")}\n`
  );

  const data = await getDirections(waypoints);
  console.log(formatDirections(data, waypoints));
}

main().catch((err) => {
  console.error(`Erreur : ${err.message}`);
  process.exit(1);
});
