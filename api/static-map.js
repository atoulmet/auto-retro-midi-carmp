export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Clé API non configurée sur le serveur" });
  }

  const { polyline } = req.body;
  if (!polyline) {
    return res.status(400).json({ error: "Polyline manquante" });
  }

  try {
    const params = new URLSearchParams({
      size: "600x600",
      scale: "2",
      maptype: "roadmap",
      path: `color:0x4a90d9ff|weight:4|enc:${polyline}`,
      key: apiKey,
    });

    const apiRes = await fetch(
      `https://maps.googleapis.com/maps/api/staticmap?${params}`
    );

    if (!apiRes.ok) {
      const text = await apiRes.text();
      return res.status(502).json({ error: `Google Static Maps: ${text}` });
    }

    const buffer = Buffer.from(await apiRes.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    return res.status(200).send(buffer);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
