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

function extractRouteCoords(xml) {
  // Extraire toutes les coordonnées de la LineString (le tracé du parcours)
  const lineMatch = xml.match(
    /<LineString>\s*<tessellate>[^<]*<\/tessellate>\s*<coordinates>([\s\S]*?)<\/coordinates>\s*<\/LineString>/i
  );
  if (!lineMatch) return [];

  return lineMatch[1]
    .trim()
    .split(/\s+/)
    .map((c) => {
      const [lng, lat] = c.split(",").map(Number);
      return { lat, lng };
    })
    .filter((p) => !isNaN(p.lat) && !isNaN(p.lng));
}

function extractPlacemarkNames(xml) {
  // Extraire les noms des Points (départ/arrivée)
  const names = [];
  const re = /<Placemark[\s>]([\s\S]*?)<\/Placemark>/gi;
  let match;

  while ((match = re.exec(xml)) !== null) {
    const block = match[1];
    if (!/<Point>/i.test(block)) continue;
    const nameMatch = block.match(/<name>([\s\S]*?)<\/name>/i);
    if (nameMatch) names.push(nameMatch[1].trim());
  }

  return names;
}

function sampleWaypoints(coords, maxWaypoints = 25) {
  // Échantillonner des points le long du tracé pour rester sous la limite API
  if (coords.length <= maxWaypoints) return coords;

  const result = [coords[0]];
  const step = (coords.length - 1) / (maxWaypoints - 1);

  for (let i = 1; i < maxWaypoints - 1; i++) {
    result.push(coords[Math.round(i * step)]);
  }

  result.push(coords[coords.length - 1]);
  return result;
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
  const coords = extractRouteCoords(kml);
  const names = extractPlacemarkNames(kml);

  if (coords.length < 2) {
    console.error(
      "Erreur : pas de tracé (LineString) trouvé dans le KML."
    );
    process.exit(1);
  }

  const waypoints = sampleWaypoints(coords, 25);

  // Attacher les noms de départ/arrivée
  if (names[0]) waypoints[0].name = names[0];
  if (names[names.length - 1]) waypoints[waypoints.length - 1].name = names[names.length - 1];

  console.log(
    `Tracé : ${coords.length} points → ${waypoints.length} waypoints échantillonnés\n` +
    `${names[0] || "Départ"} → ${names[names.length - 1] || "Arrivée"}\n`
  );

  const data = await getDirections(waypoints);
  console.log(formatDirections(data, waypoints));
}

main().catch((err) => {
  console.error(`Erreur : ${err.message}`);
  process.exit(1);
});
