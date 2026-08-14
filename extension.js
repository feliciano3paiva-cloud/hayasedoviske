const API = "https://api.opensubtitles.com/api/v1";
const USER_AGENT = "HayasePTBR v1.1";

let session = null;
let sessionTime = 0;

async function getSession(fetchFn, apiKey, username, password) {
  // Reutiliza a sessão por 10 minutos para evitar logins repetidos.
  if (
    session &&
    Date.now() - sessionTime < 10 * 60 * 1000
  ) {
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
    body: JSON.stringify({
      username,
      password
    })
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        "OpenSubtitles recusou o login. Confira usuário e senha."
      );
    }

    throw new Error(
      `Erro ao fazer login no OpenSubtitles: HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (!data.token || !data.base_url) {
    throw new Error(
      "OpenSubtitles não retornou uma sessão válida."
    );
  }

  session = {
    token: data.token,
    baseUrl: data.base_url
  };

  sessionTime = Date.now();

  return session;
}

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[._:-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreResult(result, titles, episode) {
  const attributes = result?.attributes || {};
  const feature = attributes.feature_details || {};

  const resultTitle = normalizeTitle(
    feature.title || ""
  );

  const normalizedTitles = titles.map(normalizeTitle);

  let score = 0;

  for (const title of normalizedTitles) {
    if (!title) continue;

    if (resultTitle === title) {
      score += 100;
    } else if (
      resultTitle.includes(title) ||
      title.includes(resultTitle)
    ) {
      score += 50;
    }
  }

  if (attributes.language === "pt-br") {
    score += 100;
  }

  if (
    feature.episode_number != null &&
    Number(feature.episode_number) === Number(episode)
  ) {
    score += 50;
  }

  if (attributes.download_count) {
    score += Math.min(
      20,
      Math.log10(attributes.download_count + 1) * 5
    );
  }

  if (attributes.hearing_impaired === false) {
    score += 5;
  }

  return score;
}

export default new class extends SubtitleSource {

  async test() {
    return true;
  }

  async single(query, options) {

    const apiKey = String(
      options?.apiKey || ""
    ).trim();

    const username = String(
      options?.username || ""
    ).trim();

    const password = String(
      options?.password || ""
    ).trim();

    if (!apiKey) {
      throw new Error(
        "Configure a API Key do OpenSubtitles nas configurações da extensão."
      );
    }

    if (!username || !password) {
      throw new Error(
        "Configure usuário e senha do OpenSubtitles nas configurações da extensão."
      );
    }

    const titles = Array.isArray(query.titles)
      ? query.titles.filter(Boolean)
      : [];

    const episode = query.episode;

    if (!titles.length || !episode) {
      return [];
    }

    const auth = await getSession(
      query.fetch,
      apiKey,
      username,
      password
    );

    const baseUrl = String(auth.baseUrl)
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");

    const results = [];

    // Tentamos os títulos alternativos até encontrar resultados.
    for (const title of titles.slice(0, 5)) {

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
        `https://${baseUrl}/api/v1/subtitles?${params}`;

      const response = await query.fetch(
        searchUrl,
        {
          headers: {
            "Api-Key": apiKey,
            "Authorization": `Bearer ${auth.token}`,
            "Accept": "application/json",
            "User-Agent": USER_AGENT
          }
        }
      );

      if (!response.ok) {
        continue;
      }

      const data = await response.json();

      if (!Array.isArray(data.data)) {
        continue;
      }

      for (const item of data.data) {

        if (
          item?.attributes?.language !== "pt-br"
        ) {
          continue;
        }

        results.push(item);
      }

      if (results.length >= 10) {
        break;
      }
    }

    // Remove duplicados.
    const unique = [];

    const seen = new Set();

    for (const item of results) {

      const id =
        item?.id ||
        item?.attributes?.files?.[0]?.file_id;

      if (!id || seen.has(String(id))) {
        continue;
      }

      seen.add(String(id));
      unique.push(item);
    }

    // Ordena pelas correspondências mais prováveis.
    unique.sort(
      (a, b) =>
        scoreResult(b, titles, episode) -
        scoreResult(a, titles, episode)
    );

    const output = [];

    // No máximo 5 downloads de legenda por pesquisa.
    for (const item of unique.slice(0, 5)) {

      const files =
        Array.isArray(item?.attributes?.files)
          ? item.attributes.files
          : [];

      const file = files.find(
        f => f?.file_id
      );

      if (!file) {
        continue;
      }

      const downloadUrl =
        `https://${baseUrl}/api/v1/download`;

      try {

        const downloadResponse =
          await query.fetch(
            downloadUrl,
            {
              method: "POST",

              headers: {
                "Api-Key": apiKey,
                "Authorization":
                  `Bearer ${auth.token}`,
                "Content-Type":
                  "application/json",
                "Accept":
                  "application/json",
                "User-Agent":
                  USER_AGENT
              },

              body: JSON.stringify({
                file_id:
                  Number(file.file_id)
              })
            }
          );

        if (!downloadResponse.ok) {
          continue;
        }

        const downloadData =
          await downloadResponse.json();

        if (!downloadData.link) {
          continue;
        }

        output.push({
          url: downloadData.link,
          language: "BR"
        });

      } catch (_) {
        // Tenta a próxima legenda.
      }

      if (output.length >= 3) {
        break;
      }
    }

    return output;
  }
};
