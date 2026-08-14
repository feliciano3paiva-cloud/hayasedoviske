const API = "https://api.opensubtitles.com/api/v1";
const USER_AGENT = "HayasePTBR/1.0";

let session = null;
let lastLogin = 0;

async function login(fetchFn, apiKey) {
  // Evita fazer login repetidamente.
  if (session && Date.now() - lastLogin < 10 * 60 * 1000) {
    return session;
  }

  const response = await fetchFn(`${API}/login`, {
    method: "POST",
    headers: {
      "Api-Key": apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": USER_AGENT
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(
      `Falha ao autenticar no OpenSubtitles (HTTP ${response.status}).`
    );
  }

  const data = await response.json();

  if (!data.token) {
    throw new Error("OpenSubtitles não retornou um token.");
  }

  session = {
    token: data.token,
    baseUrl: data.base_url || "api.opensubtitles.com"
  };

  lastLogin = Date.now();

  return session;
}

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
    const episode = query.episode;

    if (!title || !episode) {
      return [];
    }

    const auth = await login(query.fetch, apiKey);

    const params = new URLSearchParams({
      query: title,
      languages: "pt-br",
      type: "episode",
      episode_number: String(episode),
      order_by: "download_count",
      order_direction: "desc",
      page: "1"
    });

    const searchUrl =
      `https://${auth.baseUrl}/api/v1/subtitles?${params.toString()}`;

    const searchResponse = await query.fetch(searchUrl, {
      headers: {
        "Api-Key": apiKey,
        "Authorization": `Bearer ${auth.token}`,
        "Accept": "application/json",
        "User-Agent": USER_AGENT
      }
    });

    if (!searchResponse.ok) {
      throw new Error(
        `Busca no OpenSubtitles falhou (HTTP ${searchResponse.status}).`
      );
    }

    const data = await searchResponse.json();

    if (!Array.isArray(data.data)) {
      return [];
    }

    const results = [];

    for (const subtitle of data.data) {

      const attributes = subtitle?.attributes;

      if (!attributes) continue;

      // Garantir que seja realmente PT-BR.
      if (attributes.language !== "pt-br") continue;

      const files = Array.isArray(attributes.files)
        ? attributes.files
        : [];

      for (const file of files) {

        if (!file?.file_id) continue;

        try {

          const downloadUrl =
            `https://${auth.baseUrl}/api/v1/download`;

          const downloadResponse = await query.fetch(downloadUrl, {
            method: "POST",

            headers: {
              "Api-Key": apiKey,
              "Authorization": `Bearer ${auth.token}`,
              "Content-Type": "application/json",
              "Accept": "application/json",
              "User-Agent": USER_AGENT
            },

            body: JSON.stringify({
              file_id: Number(file.file_id)
            })
          });

          if (!downloadResponse.ok) {
            continue;
          }

          const downloadData = await downloadResponse.json();

          if (!downloadData.link) {
            continue;
          }

          results.push({
            url: downloadData.link,
            language: "BR"
          });

        } catch (_) {
          // Tenta a próxima legenda.
        }

        // Não sobrecarregar a API.
        if (results.length >= 5) {
          break;
        }
      }

      if (results.length >= 5) {
        break;
      }
    }

    return results;
  }
};
