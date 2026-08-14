const API = "https://api.opensubtitles.com/api/v1";

export default new class extends SubtitleSource {

  async test() {
    return true;
  }

  async single(query, options) {
    const apiKey = String(options?.apiKey || "").trim();

    if (!apiKey) {
      throw new Error(
        "Configure sua API Key do OpenSubtitles nas configurações da extensão."
      );
    }

    const title = query.titles?.[0];

    if (!title || !query.episode) {
      return [];
    }

    const params = new URLSearchParams({
      query: title,
      languages: "pt-br",
      type: "episode",
      episode_number: String(query.episode),
      order_by: "download_count",
      order_direction: "desc",
      page: "1"
    });

    const response = await query.fetch(
      `${API}/subtitles?${params.toString()}`,
      {
        headers: {
          "Api-Key": apiKey,
          "Accept": "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        `OpenSubtitles retornou HTTP ${response.status}.`
      );
    }

    const data = await response.json();

    if (!Array.isArray(data.data)) {
      return [];
    }

    const results = [];

    for (const subtitle of data.data) {

      const attributes = subtitle?.attributes;

      if (!attributes) continue;

      if (attributes.language !== "pt-br") continue;

      const files = attributes.files || [];

      for (const file of files) {

        if (!file?.file_id) continue;

        results.push({
          url: `${API}/download/${file.file_id}`,
          language: "BR"
        });

      }
    }

    return results.slice(0, 5);
  }
};
