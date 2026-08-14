const API_VERSION = "https://api.opensubtitles.com/api/v1";
const USER_AGENT = "Hayase OpenSubtitles PT-BR v2.0";

function makeHeaders(apiKey, token = null, json = false) {
  const headers = {
    "Api-Key": apiKey,
    "User-Agent": USER_AGENT,
    "Accept": "application/json"
  };

  if (json) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

function getNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function getTitles(query) {
  const titles = Array.isArray(query.titles) ? query.titles : [];

  return [...new Set(
    titles
      .map(title => {
        if (typeof title === "string") return title;
        if (title && typeof title.title === "string") return title.title;
        return "";
      })
      .filter(Boolean)
  )];
}

function getSeason(query) {
  return (
    getNumber(query.season) ??
    getNumber(query.seasonNumber) ??
    getNumber(query.season_number) ??
    1
  );
}

function getEpisode(query) {
  return (
    getNumber(query.episode) ??
    getNumber(query.episodeNumber) ??
    getNumber(query.episode_number)
  );
}

function getId(query, names) {
  for (const name of names) {
    const value = query[name];

    if (value !== undefined && value !== null && value !== "") {
      const number = getNumber(value);

      if (number !== null) {
        return number;
      }
    }
  }

  return null;
}

async function login(fetchFn, apiKey, username, password) {
  const response = await fetchFn(`${API_VERSION}/login`, {
    method: "POST",
    headers: makeHeaders(apiKey, null, true),
    body: JSON.stringify({
      username,
      password
    })
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        "OpenSubtitles recusou o login. Verifique usuário e senha."
      );
    }

    const text = await response.text();
    throw new Error(
      `Falha no login do OpenSubtitles (${response.status}): ${text}`
    );
  }

  const data = await response.json();

  if (!data.token) {
    throw new Error("OpenSubtitles não retornou um token de login.");
  }

  const baseUrl = data.base_url
    ? `https://${data.base_url}/api/v1`
    : API_VERSION;

  return {
    token: data.token,
    baseUrl
  };
}

async function searchSubtitles(fetchFn, baseUrl, apiKey, token, query) {
  const params = new URLSearchParams();

  params.set("languages", "pt-br");
  params.set("type", "episode");

  const episode = getEpisode(query);
  const season = getSeason(query);

  /*
   * Se o Hayase fornecer um ID do episódio no IMDb/TMDB,
   * ele é mais preciso que uma busca textual.
   */
  const imdbId = getId(query, [
    "imdbId",
    "imdb_id",
    "episodeImdbId",
    "episode_imdb_id"
  ]);

  const tmdbId = getId(query, [
    "tmdbId",
    "tmdb_id",
    "episodeTmdbId",
    "episode_tmdb_id"
  ]);

  /*
   * Para séries, o OpenSubtitles recomenda:
   * parent_imdb_id/parent_tmdb_id + season_number + episode_number.
   */
  const parentImdbId = getId(query, [
    "parentImdbId",
    "parent_imdb_id"
  ]);

  const parentTmdbId = getId(query, [
    "parentTmdbId",
    "parent_tmdb_id"
  ]);

  if (parentImdbId !== null && episode !== null) {
    params.set("parent_imdb_id", String(parentImdbId));
    params.set("season_number", String(season));
    params.set("episode_number", String(episode));
  } else if (parentTmdbId !== null && episode !== null) {
    params.set("parent_tmdb_id", String(parentTmdbId));
    params.set("season_number", String(season));
    params.set("episode_number", String(episode));
  } else if (imdbId !== null) {
    params.set("imdb_id", String(imdbId));
  } else if (tmdbId !== null) {
    params.set("tmdb_id", String(tmdbId));
  } else {
    const titles = getTitles(query);

    if (titles.length > 0) {
      params.set("query", titles[0]);
    }

    if (episode !== null) {
      params.set("season_number", String(season));
      params.set("episode_number", String(episode));
    }
  }

  const response = await fetchFn(
    `${baseUrl}/subtitles?${params.toString()}`,
    {
      headers: makeHeaders(apiKey, token)
    }
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `OpenSubtitles retornou erro na busca (${response.status}): ${text}`
    );
  }

  return response.json();
}

function chooseBestSubtitle(data, query) {
  if (!data || !Array.isArray(data.data)) {
    return null;
  }

  const titles = getTitles(query).map(normalizeTitle);
  const episode = getEpisode(query);
  const season = getSeason(query);

  const candidates = data.data
    .map(item => {
      const attr = item?.attributes;

      if (!attr || attr.language !== "pt-br") {
        return null;
      }

      if (!Array.isArray(attr.files) || attr.files.length === 0) {
        return null;
      }

      let score = 0;

      const feature = attr.feature_details || {};

      /*
       * Pontuação para garantir que pegamos o episódio correto.
       */
      if (
        episode !== null &&
        Number(feature.episode_number) === episode
      ) {
        score += 100;
      }

      if (
        episode !== null &&
        Number(feature.season_number) === season
      ) {
        score += 50;
      }

      const featureTitle = normalizeTitle(
        feature.parent_title || feature.title || ""
      );

      for (const title of titles) {
        if (!title) continue;

        if (featureTitle === title) {
          score += 100;
        } else if (
          featureTitle.includes(title) ||
          title.includes(featureTitle)
        ) {
          score += 40;
        }
      }

      /*
       * Preferimos legendas confiáveis/populares.
       */
      score += Math.min(Number(attr.new_download_count) || 0, 50);
      score += Math.min(Number(attr.download_count) || 0, 20);

      if (attr.from_trusted) {
        score += 20;
      }

      if (attr.hd) {
        score += 5;
      }

      return {
        item,
        score,
        file: attr.files[0],
        attributes: attr
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return candidates[0] || null;
}

async function downloadLink(
  fetchFn,
  baseUrl,
  apiKey,
  token,
  fileId
) {
  const response = await fetchFn(`${baseUrl}/download`, {
    method: "POST",
    headers: makeHeaders(apiKey, token, true),
    body: JSON.stringify({
      file_id: Number(fileId),
      sub_format: "srt"
    })
  });

  if (!response.ok) {
    const text = await response.text();

    if (response.status === 403) {
      throw new Error(
        `OpenSubtitles recusou o download (403). ` +
        `Sua conta pode estar sem downloads disponíveis ou o token pode ter expirado. ${text}`
      );
    }

    throw new Error(
      `Falha ao obter a legenda (${response.status}): ${text}`
    );
  }

  const data = await response.json();

  if (!data.link) {
    throw new Error(
      "OpenSubtitles não retornou um link temporário para a legenda."
    );
  }

  return data.link;
}

export default new class extends SubtitleSource {
  async test() {
    return true;
  }

  async single(query, options) {
    const apiKey = String(options?.apiKey || "").trim();
    const username = String(options?.username || "").trim();
    const password = String(options?.password || "");

    if (!apiKey) {
      throw new Error(
        "Configure sua API Key do OpenSubtitles nas configurações da extensão."
      );
    }

    if (!username || !password) {
      throw new Error(
        "Configure seu usuário e senha do OpenSubtitles nas configurações da extensão."
      );
    }

    /*
     * Faz login para obter o JWT necessário ao /download.
     */
    const session = await login(
      query.fetch,
      apiKey,
      username,
      password
    );

    /*
     * Busca somente legendas PT-BR.
     */
    const search = await searchSubtitles(
      query.fetch,
      session.baseUrl,
      apiKey,
      session.token,
      query
    );

    const best = chooseBestSubtitle(search, query);

    if (!best) {
      return [];
    }

    const fileId = best.file?.file_id;

    if (!fileId) {
      throw new Error(
        "O OpenSubtitles encontrou uma legenda, mas não informou o file_id."
      );
    }

    /*
     * O /download consome uma cota de download e devolve
     * uma URL temporária para o arquivo.
     */
    const link = await downloadLink(
      query.fetch,
      session.baseUrl,
      apiKey,
      session.token,
      fileId
    );

    return [
      {
        url: link,
        language: "BR"
      }
    ];
  }
};
